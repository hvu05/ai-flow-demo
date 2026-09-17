import { test, expect } from '@playwright/test';
const base = (id: string) => ({ id, schemaVersion: 1, revision: 0, createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z' });
const roles = ['requirements', 'docs_reviewer', 'api_contract', 'planner', 'frontend'];
const projectId = 'demo_browser_fixture';
function fixture(status = 'waiting_approval') {
  const artifacts = [{ ...base('artifact_fixture'), projectId, producerRunId: 'run_requirements', kind: 'prd', version: 1, path: 'content/run_requirements/requirements.md', sha256: 'a'.repeat(64), mediaType: 'text/markdown' }];
  return {
    project: { ...base(projectId), name: 'Browser fixture', idea: 'Fixture only, not a live agent', workspace: '/tmp/browser-fixture', status: 'active' },
    workflow: { ...base('workflow'), projectId, stage: 'approval', status, activeTaskIds: [], approvedBundle: { id: 'bundle', version: 1, sha256: 'b'.repeat(64) }, ...(status === 'blocked' ? { reason: 'Review yêu cầu chỉnh sửa — browser fixture' } : {}) },
    tasks: roles.map((role, index) => ({ ...base(`task_${role}`), projectId, title: role, role, status: index < 4 ? 'completed' : 'pending', dependencies: [], acceptanceIds: [], allowedPaths: [], inputArtifacts: [] })),
    runs: roles.slice(0, 4).map((role, index) => ({ ...base(`run_${role}`), projectId, taskId: `task_${role}`, role, attempt: 1, workspace: '/tmp/fixture', status: 'succeeded', inputArtifacts: index ? [{ id: artifacts[0]!.id, version: 1, sha256: artifacts[0]!.sha256 }] : [], exitCode: 0, startedAt: '2026-09-16T00:00:00.000Z', endedAt: '2026-09-16T00:00:01.000Z', logPath: `logs/run_${role}.log`, validation: 'passed' })),
    artifacts, approvals: [], roles, bundleHash: 'b'.repeat(64), allowedActions: status === 'waiting_approval' ? ['approve', 'cancel'] : [], mode: 'live',
  };
}
test.beforeEach(async ({ page }) => {
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:5173')).status; } catch { return 0; } }).toBe(200);
  await page.route('**/api/preflight', (route) => route.fulfill({ json: { ready: false, authenticated: false, version: 'fixture', message: 'Chưa đăng nhập Codex — browser fixture' } }));
  await page.route('**/api/demo-runs/latest', (route) => route.fulfill({ json: null }));
});
test('missing auth disables start; backend health and connection failure are visible', async ({ page, request }) => {
  expect((await request.get('http://127.0.0.1:4100/health')).ok()).toBe(true);
  expect(await (await request.get('http://127.0.0.1:4100/api/demo-runs/latest')).json()).toBe(null);
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Cần kết nối Codex');
  await expect(page.getByRole('button', { name: 'Bắt đầu lượt mới →' })).toBeDisabled();
  await expect(page.locator('.agent-card')).toHaveCount(5);
  await page.route('**/api/preflight', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Kiểm tra lại' }).click();
  await expect(page.getByRole('alert')).toContainText('Không kết nối được backend');
});
test('fixture handoff, safe Markdown, approval hash and reload', async ({ page }) => {
  const state = fixture(); let approved: unknown;
  await page.route('**/api/demo-runs/**', async (route) => {
    if (route.request().url().endsWith('/approve')) { approved = route.request().postDataJSON(); return route.fulfill({ json: { ...state, workflow: { ...state.workflow, status: 'completed', revision: 1 }, allowedActions: [] } }); }
    if (route.request().url().includes('/artifacts/')) return route.fulfill({ json: { artifact: state.artifacts[0], content: '# Requirements fixture\n\n<script>window.fixtureUnsafe=true</script>\n\nSafe document' } });
    return route.fulfill({ json: state });
  });
  await page.goto('/');
  await expect(page.getByText('Chờ bạn duyệt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem bàn giao Yêu cầu sang Review' }).click();
  await expect(page.getByRole('button', { name: 'Nhận bàn giao (1)' })).toBeVisible();
  await page.locator('nav').getByRole('button', { name: /requirements.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Requirements fixture' })).toBeVisible();
  expect(await page.evaluate(() => 'fixtureUnsafe' in window)).toBe(false);
  await page.reload();
  await expect(page.getByText('Chờ bạn duyệt', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/demo-approval-fixture.png', fullPage: true });
  await page.getByRole('button', { name: 'Duyệt và tạo FE →' }).click();
  expect(approved).toEqual({ bundleHash: state.bundleHash });
  await expect(page.getByRole('link', { name: 'Tải source FE ↓' })).toHaveAttribute('href', /source.zip$/);
});
test('review block survives reload and mobile flow remains selectable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/demo-runs/**', (route) => route.fulfill({ json: fixture('blocked') }));
  await page.goto('/'); await page.reload();
  await expect(page.getByRole('alert')).toContainText('Review yêu cầu chỉnh sửa');
  await expect(page.getByRole('button', { name: 'Duyệt và tạo FE →' })).toHaveCount(0);
  await page.locator('.agent-card').last().click();
  await expect(page.locator('.detail h2')).toHaveText('Frontend');
  await page.screenshot({ path: 'test-results/demo-mobile-fixture.png', fullPage: true });
});
