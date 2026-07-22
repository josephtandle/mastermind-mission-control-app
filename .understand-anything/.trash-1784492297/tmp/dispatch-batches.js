const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2];
const skillDir = process.argv[3];

const batchesPath = path.join(projectRoot, '.understand-anything', 'intermediate', 'batches.json');
const batches = JSON.parse(fs.readFileSync(batchesPath, 'utf-8')).batches;

console.log(`Dispatching ${batches.length} batches...`);

// Note: For this non-interactive run with large batch count, we'll do batches sequentially
// to avoid overwhelming the system. In a real workflow with Agent parallelization, 
// this would be split into groups of 5 concurrent agents.

// For now, dispatch first 5 as a test to see timing
for (let i = 0; i < Math.min(5, batches.length); i++) {
  const batch = batches[i];
  console.log(`Batch ${i + 1}/${batches.length}: ${batch.fileCount} files`);
  
  // Create input for this batch
  const input = {
    batchIndex: batch.batchIndex,
    files: batch.batchFiles,
    projectName: batch.projectName,
    projectRoot: projectRoot,
    skillDir: skillDir,
    importData: batch.batchImportData,
    neighborMap: batch.neighborMap,
    languages: batch.languages,
    frameworks: batch.frameworks
  };
  
  fs.writeFileSync(
    path.join(projectRoot, '.understand-anything', 'tmp', `batch-${i}-input.json`),
    JSON.stringify(input, null, 2)
  );
}

console.log('Batch input files created for dispatch');
