#!/usr/bin/env node
/**
 * Seed test tasks into Convex database
 * This script creates sample cards for the Tasks Kanban board
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const CONVEX_URL = 'http://localhost:3210';

// Test data
const testTasks = [
  {
    title: 'Design new dashboard',
    description: 'Create mockups for the updated dashboard UI',
    labels: ['design', 'ui'],
    priority: 'High',
    column: 'doing',
    dueDate: '2026-02-25',
  },
  {
    title: 'Fix loading spinner',
    description: 'Tasks page shows loading indefinitely - debug Convex connection',
    labels: ['bug', 'convex'],
    priority: 'High',
    column: 'doing',
    dueDate: '2026-02-20',
  },
  {
    title: 'Implement search feature',
    description: 'Add full-text search for tasks across all columns',
    labels: ['feature', 'search'],
    priority: 'Med',
    column: 'backlog',
  },
  {
    title: 'Write API documentation',
    description: 'Document all Convex functions and their parameters',
    labels: ['docs'],
    priority: 'Low',
    column: 'backlog',
  },
  {
    title: 'Review code changes',
    description: 'PR review for mission-control updates',
    labels: ['review', 'qa'],
    priority: 'Med',
    column: 'review',
  },
  {
    title: 'Deploy to staging',
    description: 'Push latest build to staging environment',
    labels: ['deploy', 'staging'],
    priority: 'High',
    column: 'done',
    dueDate: '2026-02-19',
  },
];

async function seedTasks() {
  console.log(`🌱 Seeding tasks to ${CONVEX_URL}...`);
  
  try {
    for (const task of testTasks) {
      console.log(`  Adding: "${task.title}"`);
      
      const response = await fetch(`${CONVEX_URL}/api/cards.createCard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      
      if (!response.ok) {
        console.error(`    ❌ Failed:`, response.statusText);
      } else {
        console.log(`    ✓ Created`);
      }
    }
    
    console.log(`\n✅ Seeding complete!`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(`\nMake sure Convex backend is running on ${CONVEX_URL}`);
    process.exit(1);
  }
}

seedTasks();
