#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Configuration
const BATCHES = [
  {
    index: 5,
    name: '__tests__',
    dir: '/Users/myos/.myos/workspace/projects/mastermind-mission-control/agents/task-runner/cli/src/__tests__',
  },
  {
    index: 6,
    name: 'checks',
    dir: '/Users/myos/.myos/workspace/projects/mastermind-mission-control/agents/task-runner/cli/src/checks',
  },
  {
    index: 7,
    name: 'commands',
    dir: '/Users/myos/.myos/workspace/projects/mastermind-mission-control/agents/task-runner/cli/src/commands',
  },
  {
    index: 8,
    name: 'commands/client',
    dir: '/Users/myos/.myos/workspace/projects/mastermind-mission-control/agents/task-runner/cli/src/commands/client',
  },
  {
    index: 9,
    name: 'config',
    dir: '/Users/myos/.myos/workspace/projects/mastermind-mission-control/agents/task-runner/cli/src/config',
  },
];

const OUT_DIR = '/Users/myos/.understand-anything/intermediate';

// Ensure output directory exists
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Helper to generate unique ID
function generateId(prefix, name) {
  return `${prefix}_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
}

// Parse a single TypeScript file
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const result = {
    filePath,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    enums: [],
    calls: new Set(),
  };

  function visit(node) {
    // Imports
    if (ts.isImportDeclaration(node)) {
      const moduleName = node.moduleSpecifier.getText(sourceFile).slice(1, -1);
      const imports = [];

      if (node.importClause?.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          node.importClause.namedBindings.elements.forEach(e => {
            imports.push(e.name.getText(sourceFile));
          });
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          imports.push(node.importClause.namedBindings.name.getText(sourceFile));
        }
      }
      if (node.importClause?.name) {
        imports.push(node.importClause.name.getText(sourceFile));
      }

      if (imports.length > 0) {
        result.imports.push({ moduleName, imports });
      }
    }

    // Exports
    if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node)) {
        result.exports.push(node.name?.getText(sourceFile) || 'default');
      }
    }

    // Functions
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.getText(sourceFile);
      if (name) {
        const params = node.parameters.map(p => p.name?.getText(sourceFile)).filter(Boolean);
        result.functions.push({ name, params });
      }
    }

    // Classes
    if (ts.isClassDeclaration(node)) {
      const name = node.name?.getText(sourceFile);
      if (name) {
        const methods = [];
        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
            methods.push(member.name?.getText(sourceFile) || 'constructor');
          }
        });
        result.classes.push({ name, methods });
      }
    }

    // Interfaces
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name?.getText(sourceFile);
      if (name) {
        const properties = [];
        node.members.forEach(member => {
          if (ts.isPropertySignature(member)) {
            properties.push(member.name?.getText(sourceFile));
          }
        });
        result.interfaces.push({ name, properties });
      }
    }

    // Types
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name?.getText(sourceFile);
      if (name) {
        result.types.push({ name });
      }
    }

    // Enums
    if (ts.isEnumDeclaration(node)) {
      const name = node.name?.getText(sourceFile);
      if (name) {
        const members = node.members.map(m => m.name?.getText(sourceFile)).filter(Boolean);
        result.enums.push({ name, members });
      }
    }

    // Function calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression.getText(sourceFile);
      if (!expr.includes('.') && !expr.includes('(')) {
        result.calls.add(expr);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  result.calls = Array.from(result.calls);
  return result;
}

// Create nodes and edges for a batch
function processBatch(batch) {
  console.log(`Processing batch ${batch.index} (${batch.name})...`);

  const files = fs.readdirSync(batch.dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map(f => path.join(batch.dir, f));

  const fileAnalysis = {};
  const allImports = {};
  const neighborMap = {};
  const graphNodes = [];
  const graphEdges = [];
  const nodeIdMap = {}; // Track created node IDs for edge linking

  // First pass: analyze all files
  for (const filePath of files) {
    fileAnalysis[filePath] = analyzeFile(filePath);
  }

  // Generate nodes and edges
  for (const filePath of files) {
    const analysis = fileAnalysis[filePath];
    const relPath = path.relative(batch.dir, filePath);
    const fileNodeId = generateId('file', relPath);

    nodeIdMap[filePath] = { nodeId: fileNodeId, nodes: [] };

    // File node
    graphNodes.push({
      id: fileNodeId,
      type: 'file',
      name: relPath,
      filePath: filePath,
      summary: `TypeScript file: ${relPath}`,
      tags: ['file', 'typescript'],
      complexity: analysis.functions.length + analysis.classes.length > 5 ? 'complex' :
                  analysis.functions.length + analysis.classes.length > 2 ? 'moderate' : 'simple',
    });

    // Import edges
    const importedModules = new Set();
    for (const imp of analysis.imports) {
      importedModules.add(imp.moduleName);
      allImports[filePath] = (allImports[filePath] || []).concat(imp.imports);

      graphEdges.push({
        source: fileNodeId,
        target: generateId('module', imp.moduleName),
        type: 'imports',
        direction: 'forward',
        weight: 0.7,
      });
    }

    // Function nodes and edges
    for (const func of analysis.functions) {
      const funcNodeId = generateId('function', `${relPath}_${func.name}`);
      nodeIdMap[filePath].nodes.push(funcNodeId);

      graphNodes.push({
        id: funcNodeId,
        type: 'function',
        name: func.name,
        filePath: filePath,
        summary: `Function: ${func.name}`,
        tags: ['function', 'typescript'],
        complexity: func.params.length > 3 ? 'complex' : func.params.length > 0 ? 'moderate' : 'simple',
      });

      // Function contained in file
      graphEdges.push({
        source: fileNodeId,
        target: funcNodeId,
        type: 'contains',
        direction: 'forward',
        weight: 0.9,
      });
    }

    // Class nodes and edges
    for (const cls of analysis.classes) {
      const classNodeId = generateId('class', `${relPath}_${cls.name}`);
      nodeIdMap[filePath].nodes.push(classNodeId);

      graphNodes.push({
        id: classNodeId,
        type: 'class',
        name: cls.name,
        filePath: filePath,
        summary: `Class: ${cls.name}`,
        tags: ['class', 'typescript'],
        complexity: cls.methods.length > 5 ? 'complex' : cls.methods.length > 2 ? 'moderate' : 'simple',
      });

      // Class contained in file
      graphEdges.push({
        source: fileNodeId,
        target: classNodeId,
        type: 'contains',
        direction: 'forward',
        weight: 0.9,
      });
    }

    // Interface nodes
    for (const iface of analysis.interfaces) {
      const ifaceNodeId = generateId('class', `${relPath}_${iface.name}`);
      nodeIdMap[filePath].nodes.push(ifaceNodeId);

      graphNodes.push({
        id: ifaceNodeId,
        type: 'class',
        name: iface.name,
        filePath: filePath,
        summary: `Interface: ${iface.name}`,
        tags: ['interface', 'typescript'],
        complexity: 'simple',
      });

      graphEdges.push({
        source: fileNodeId,
        target: ifaceNodeId,
        type: 'contains',
        direction: 'forward',
        weight: 0.9,
      });
    }

    // Type nodes
    for (const type of analysis.types) {
      const typeNodeId = generateId('schema', `${relPath}_${type.name}`);
      nodeIdMap[filePath].nodes.push(typeNodeId);

      graphNodes.push({
        id: typeNodeId,
        type: 'schema',
        name: type.name,
        filePath: filePath,
        summary: `Type: ${type.name}`,
        tags: ['type', 'typescript'],
        complexity: 'simple',
      });

      graphEdges.push({
        source: fileNodeId,
        target: typeNodeId,
        type: 'contains',
        direction: 'forward',
        weight: 0.9,
      });
    }

    // Enum nodes
    for (const en of analysis.enums) {
      const enumNodeId = generateId('schema', `${relPath}_${en.name}`);
      nodeIdMap[filePath].nodes.push(enumNodeId);

      graphNodes.push({
        id: enumNodeId,
        type: 'schema',
        name: en.name,
        filePath: filePath,
        summary: `Enum: ${en.name}`,
        tags: ['enum', 'typescript'],
        complexity: 'simple',
      });

      graphEdges.push({
        source: fileNodeId,
        target: enumNodeId,
        type: 'contains',
        direction: 'forward',
        weight: 0.9,
      });
    }
  }

  // Build neighbor map
  for (const filePath of files) {
    const relPath = path.relative(batch.dir, filePath);
    const analysis = fileAnalysis[filePath];
    const neighbors = new Set();

    // Neighbors are files that this file imports
    for (const imp of analysis.imports) {
      if (imp.moduleName.startsWith('.')) {
        const resolvedPath = path.normalize(path.join(path.dirname(filePath), imp.moduleName));
        const resolvedRel = path.relative(batch.dir, resolvedPath);
        if (resolvedRel && !resolvedRel.startsWith('..')) {
          neighbors.add(resolvedRel);
        }
      }
    }

    neighborMap[relPath] = Array.from(neighbors);
  }

  // Output result
  const result = {
    batchIndex: batch.index,
    batchImportData: allImports,
    neighborMap: neighborMap,
    graphNodes: graphNodes,
    graphEdges: graphEdges,
    summary: {
      filesAnalyzed: files.length,
      nodesGenerated: graphNodes.length,
      edgesGenerated: graphEdges.length,
      dominantLanguage: 'TypeScript',
    },
  };

  const outputPath = path.join(OUT_DIR, `batch-${batch.index}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`✓ Batch ${batch.index}: ${files.length} files, ${graphNodes.length} nodes, ${graphEdges.length} edges`);
  console.log(`  Output: ${outputPath}`);

  return result;
}

// Process all batches
async function main() {
  console.log('TypeScript Code Analysis - Batch Processor\n');

  const results = [];
  for (const batch of BATCHES) {
    try {
      const result = processBatch(batch);
      results.push(result);
    } catch (error) {
      console.error(`✗ Batch ${batch.index} failed:`, error.message);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Batches processed: ${results.length}`);
  console.log(`Total files analyzed: ${results.reduce((sum, r) => sum + r.summary.filesAnalyzed, 0)}`);
  console.log(`Total nodes generated: ${results.reduce((sum, r) => sum + r.summary.nodesGenerated, 0)}`);
  console.log(`Total edges generated: ${results.reduce((sum, r) => sum + r.summary.edgesGenerated, 0)}`);
  console.log('\nOutput directory: ' + OUT_DIR);
}

main().catch(console.error);
