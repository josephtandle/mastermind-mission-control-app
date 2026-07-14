const fs = require('fs');
const graphPath = process.argv[2];
try {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const issues = [], warnings = [];
  
  if (!Array.isArray(graph.nodes)) { issues.push('graph.nodes not an array'); graph.nodes = []; }
  if (!Array.isArray(graph.edges)) { issues.push('graph.edges not an array'); graph.edges = []; }
  
  const nodeIds = new Set();
  graph.nodes.forEach((n, i) => {
    if (!n.id) issues.push(`Node[${i}] missing id`);
    else nodeIds.add(n.id);
  });
  
  graph.edges.forEach((e, i) => {
    if (!nodeIds.has(e.source)) issues.push(`Edge[${i}] source '${e.source}' not found`);
    if (!nodeIds.has(e.target)) issues.push(`Edge[${i}] target '${e.target}' not found`);
  });
  
  const stats = {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    nodeTypes: {},
    edgeTypes: {}
  };
  graph.nodes.forEach(n => { stats.nodeTypes[n.type] = (stats.nodeTypes[n.type]||0)+1; });
  graph.edges.forEach(e => { stats.edgeTypes[e.type] = (stats.edgeTypes[e.type]||0)+1; });
  
  console.log(JSON.stringify({issues, warnings, stats}, null, 2));
} catch (e) { console.error(e.message); }
