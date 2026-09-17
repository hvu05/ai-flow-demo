import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const [root, point] = process.argv.slice(2);
const originalRename = fs.rename;
fs.rename = async (source, target) => {
  await originalRename(source, target);
  if ((point === 'journal' && String(target).endsWith('/.journal.json')) || (point === 'first-entity' && String(target).endsWith('/tasks/task_fe.json'))) process.kill(process.pid, 'SIGKILL');
};
syncBuiltinESMExports();
const { JsonProjectRepository } = await import('../../src/storage/json-project.repository.js');
const repo = new JsonProjectRepository(root!);
const time = '2026-09-16T00:00:00.000Z';
await repo.transaction('project_a', ['task_fe', 'task_be'].map((id) => ({
  action: 'put', kind: 'task', id, expectedRevision: null,
  value: { schemaVersion: 1, id, projectId: 'project_a', revision: 0, createdAt: time, updatedAt: time, title: id, role: 'frontend', status: 'pending', dependencies: [], acceptanceIds: [], allowedPaths: [], inputArtifacts: [] },
})));
throw new Error('Crash checkpoint was not reached');
