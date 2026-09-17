#!/usr/bin/env node
// Test process fixture only: never used by the application provider.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex-cli 0.154.0'); process.exit(0); }
if (args[0] === 'login') process.exit(1);
let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  const task = JSON.parse(input.split('TASK DATA (JSON):\n')[1]);
  console.log(JSON.stringify({ type: 'thread.started', thread_id: `fixture_${task.runId}` }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  const resultPath = args[args.indexOf('--output-last-message') + 1];
  if (task.idea !== 'missing output') fs.writeFileSync(resultPath, JSON.stringify({ role: task.role, outcome: 'completed', summary: 'Process fixture, not a model', reviewVerdict: null, files: [{ path: 'requirements.md', content: '# Fixture requirements' }] }));
  console.log(JSON.stringify({ type: 'turn.completed' }));
});
