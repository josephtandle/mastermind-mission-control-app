const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2];

// Read old and new
const oldGraph = JSON.parse(fs.readFileSync(
  path.join(projectRoot, '.understand-anything/knowledge-graph.json'), 'utf8'
));

const newBatches = JSON.parse(fs.readFileSync(
  path.join(projectRoot, '.understand-anything/intermediate/assembled-graph.json'), 'utf8'
));

// Merge nodes: new overwrites old with same ID
const nodeMap = new Map();
(oldGraph.nodes || []).forEach(n => nodeMap.set(n.id, n));
(newBatches.nodes || []).forEach(n => nodeMap.set(n.id, n));
const nodes = Array.from(nodeMap.values());

// Merge edges
const edgeSet = new Map();
const edgeKey = (e) => `${e.source}|${e.target}|${e.type}`;
(oldGraph.edges || []).forEach(e => edgeSet.set(edgeKey(e), e));
(newBatches.edges || []).forEach(e => edgeSet.set(edgeKey(e), e));
const edges = Array.from(edgeSet.values());

// Build final graph with metadata
const finalGraph = {
  version: "1.0.0",
  project: oldGraph.project || {},
  nodes,
  edges,
  layers: oldGraph.layers || [],
  tour: oldGraph.tour || []
};

fs.writeFileSync(
  path.join(projectRoot, '.understand-anything/knowledge-graph.json'),
  JSON.stringify(finalGraph, null, 2)
);

console.log(`Final graph: ${nodes.length} nodes, ${edges.length} edges`);
