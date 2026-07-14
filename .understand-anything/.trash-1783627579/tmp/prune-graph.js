const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2];
const changedFile = process.argv[3];

// Read existing graph
const graphPath = path.join(projectRoot, '.understand-anything/knowledge-graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

// Read changed files
const changed = fs.readFileSync(changedFile, 'utf8')
  .split('\n')
  .filter(l => l.trim().length > 0);

const changedSet = new Set(changed);

// Filter nodes: keep those whose filePath is NOT in changed set
const oldNodes = (graph.nodes || []).filter(n => !changedSet.has(n.filePath));
const oldNodeIds = new Set(oldNodes.map(n => n.id));

// Filter edges: keep only those where both source and target still exist
const oldEdges = (graph.edges || []).filter(e => 
  oldNodeIds.has(e.source) && oldNodeIds.has(e.target)
);

// Write pruned graph
const output = { nodes: oldNodes, edges: oldEdges };
fs.writeFileSync(
  path.join(projectRoot, '.understand-anything/intermediate/batch-existing.json'),
  JSON.stringify(output, null, 2)
);

console.log(`Pruned: ${oldNodes.length} nodes (removed ${(graph.nodes || []).length - oldNodes.length})`);
console.log(`Pruned: ${oldEdges.length} edges (removed ${(graph.edges || []).length - oldEdges.length})`);
