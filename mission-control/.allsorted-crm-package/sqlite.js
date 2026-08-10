"use strict";

const { execFileSync } = require("node:child_process");

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlIdentifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Unsafe SQLite identifier: ${value}`);
  return `"${value}"`;
}

function runSqlite(databasePath, sql, options = {}) {
  return execFileSync("sqlite3", [databasePath, sql], {
    encoding: options.encoding === false ? undefined : "utf8",
    stdio: options.stdio || (options.encoding === false ? "inherit" : "pipe"),
  });
}

function listTables(databasePath) {
  return runSqlite(databasePath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function listColumns(databasePath, tableName) {
  return runSqlite(databasePath, `PRAGMA table_info(${sqlLiteral(tableName)});`)
    .split(/\r?\n/).filter(Boolean).map((row) => row.split("|")[1]).filter(Boolean);
}

function mergeDatabase(targetPath, samplePath) {
  const targetTables = new Set(listTables(targetPath));
  const statements = [];
  for (const table of listTables(samplePath)) {
    if (table === "sqlite_sequence" || !targetTables.has(table)) continue;
    const targetColumns = new Set(listColumns(targetPath, table));
    const shared = listColumns(samplePath, table).filter((column) => targetColumns.has(column));
    if (!shared.length) continue;
    const columns = shared.map(sqlIdentifier).join(", ");
    statements.push(`INSERT OR IGNORE INTO ${sqlIdentifier(table)} (${columns}) SELECT ${columns} FROM sample.${sqlIdentifier(table)};`);
  }
  if (!statements.length) return 0;
  runSqlite(targetPath, `ATTACH DATABASE ${sqlLiteral(samplePath)} AS sample; BEGIN IMMEDIATE; ${statements.join(" ")} COMMIT; DETACH DATABASE sample;`);
  return statements.length;
}

module.exports = { sqlLiteral, sqlIdentifier, runSqlite, listTables, listColumns, mergeDatabase };
