import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "lib/db.json");

export async function DELETE() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    const before = db.cards.length;
    db.cards = db.cards.filter((c: any) => !c.tags?.includes("sample"));
    const after = db.cards.length;
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return NextResponse.json({ success: true, removed: before - after });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
