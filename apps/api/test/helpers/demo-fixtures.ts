import type { DemoOutput, DemoRole } from '@ai-flow/contracts';
export const contract = { openapi: '3.0.3', info: { title: 'Tasks', version: '1.0.0' }, paths: { '/tasks': { get: { responses: { '200': { description: 'Task list', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', required: ['id', 'title'], properties: { id: { type: 'integer' }, title: { type: 'string' } } } }, example: [{ id: 1, title: 'Demo' }] } } } } } } } };
export const frontendFiles = [
  { path: 'app/page.tsx', content: `'use client';\nimport mocks from '../mocks.json';\nimport { useState } from 'react';\nexport default function Page() { const [count,setCount]=useState(0); return <main><h1>Dữ liệu mock</h1><pre>{JSON.stringify(mocks.responses[0].body)}</pre><button onClick={()=>setCount(count+1)}>Đã làm {count}</button></main>; }` },
  { path: 'app/globals.css', content: 'body { font-family: system-ui; margin: 24px; }' },
  { path: 'mocks.json', content: JSON.stringify({ responses: [{ method: 'GET', path: '/tasks', status: 200, body: [{ id: 1, title: 'Demo' }] }] }) },
  { path: 'README.md', content: '# Frontend mock\nDữ liệu mock. npm ci; npm run dev; npm run build.' },
];
export function outputFor(role: DemoRole): DemoOutput {
  const files = {
    requirements: [{ path: 'requirements.md', content: '# Yêu cầu\nAC01: Xem danh sách công việc mock.' }],
    docs_reviewer: [{ path: 'review.md', content: '# Review\nPASS: Yêu cầu đủ rõ để demo.' }],
    api_contract: [{ path: 'openapi.json', content: JSON.stringify(contract) }, { path: 'api-notes.md', content: 'GET /tasks dùng mock.' }],
    planner: [{ path: 'plan.md', content: '# Kế hoạch\nFE: AC01 → GET /tasks. Dùng mocks.json.' }],
    frontend: frontendFiles,
  }[role];
  return { role, outcome: 'completed', summary: 'Fixture output — NOT a live AI result', reviewVerdict: role === 'docs_reviewer' ? 'PASS' : null, files };
}
