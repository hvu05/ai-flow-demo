import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { DEMO_ROLES, DemoSnapshotSchema, PreflightSchema, type DemoRole, type DemoSnapshot, type Preflight, type Artifact } from '@ai-flow/contracts';
import { api, apiOrigin } from './lib/api';
const labels: Record<DemoRole, string> = { requirements: 'Yêu cầu', docs_reviewer: 'Review', api_contract: 'API contract', planner: 'Kế hoạch', frontend: 'Frontend' };
const descriptions: Record<DemoRole, string> = { requirements: 'Làm rõ ý tưởng', docs_reviewer: 'Kiểm tra tài liệu', api_contract: 'Định nghĩa giao tiếp', planner: 'Chia việc triển khai', frontend: 'Tạo giao diện mock' };
const statuses: Record<string, string> = { pending: 'Đang chờ', running: 'Đang làm', completed: 'Hoàn tất', failed: 'Thất bại', blocked: 'Cần xem lại', cancelled: 'Đã dừng', waiting_approval: 'Chờ bạn duyệt', interrupted: 'Bị gián đoạn', succeeded: 'Đã bàn giao' };
const initialIdea = 'Tạo ứng dụng quản lý công việc cá nhân: xem danh sách, thêm công việc, đánh dấu hoàn thành và lọc theo trạng thái. Giao diện một trang, dùng dữ liệu mock.';
export function App() {
  const [idea, setIdea] = useState(initialIdea);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [selected, setSelected] = useState<DemoRole>('requirements');
  const [tab, setTab] = useState<'output' | 'input' | 'log'>('output');
  const [preview, setPreview] = useState<{ artifact: Artifact; content: string } | null>(null);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [now, setNow] = useState(Date.now());
  const applySnapshot = useCallback((value: unknown) => {
    if (value === null) return;
    const next = DemoSnapshotSchema.parse(value);
    setSnapshot((previous) => previous?.project.id === next.project.id && previous.workflow.revision > next.workflow.revision ? previous : next);
  }, []);
  const refreshPreflight = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try { setPreflight(PreflightSchema.parse(await api('/api/preflight', { signal }))); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(window.location.search).get('run');
    void Promise.all([
      refreshPreflight(controller.signal),
      api(id ? `/api/demo-runs/${encodeURIComponent(id)}` : '/api/demo-runs/latest', { signal: controller.signal }).then(applySnapshot),
    ]).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không kết nối được backend.'); }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [applySnapshot, refreshPreflight]);
  const id = snapshot?.project.id;
  const live = snapshot?.workflow.status === 'running' || snapshot?.workflow.status === 'waiting_approval';
  useEffect(() => {
    if (!id || !live) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { applySnapshot(await api(`/api/demo-runs/${id}`, { signal: controller.signal })); }
      catch { if (!controller.signal.aborted) setError('Mất kết nối backend. Đang thử tải lại trạng thái…'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 1500); }
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, live, applySnapshot]);
  useEffect(() => { if (!live) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live]);
  const task = snapshot?.tasks.find((t) => t.role === selected);
  const run = snapshot?.runs.find((r) => r.taskId === task?.id);
  useEffect(() => { setPreview(null); setLog(''); }, [selected, id]);
  useEffect(() => {
    if (!id || !run || tab !== 'log') return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await api<{ text: string }>(`/api/demo-runs/${id}/runs/${run.id}/logs`, { signal: controller.signal }); setLog(result.text); }
      catch { if (!controller.signal.aborted) setLog('Không tải được log.'); }
      finally { if (!controller.signal.aborted && live) timer = setTimeout(poll, 1500); }
    };
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, run?.id, tab, live]);
  async function command(path: string, body: unknown) {
    setBusy(true); setError('');
    try {
      const result = DemoSnapshotSchema.parse(await api(path, { method: 'POST', body: JSON.stringify(body) }));
      applySnapshot(result); window.history.replaceState(null, '', `?run=${result.project.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(false); }
  }
  async function openArtifact(artifact: Artifact) {
    if (!id) return;
    try { setPreview(await api(`/api/demo-runs/${id}/artifacts/${artifact.id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được artifact.'); }
  }
  const outputFiles = snapshot?.artifacts.filter((a) => a.producerRunId === run?.id && a.mediaType !== 'application/zip') ?? [];
  const inputFiles = snapshot?.artifacts.filter((a) => run?.inputArtifacts.some((ref) => ref.id === a.id)) ?? [];
  const documents = snapshot?.artifacts.filter((a) => ['prd', 'review', 'contract', 'task_plan'].includes(a.kind)) ?? [];
  const fileButton = (artifact: Artifact) => <button className={`file ${preview?.artifact.id === artifact.id ? 'selected' : ''}`} key={artifact.id} onClick={() => void openArtifact(artifact)}>
    <span>{artifact.path.split('/').slice(2).join('/')}</span><small>v{artifact.version} · {artifact.sha256.slice(0, 8)}</small>
  </button>;
  return <main>
    <header><a className="brand" href="/">AI <span>FLOW</span><span className="brand-dot" /></a><span className="badge">5 AGENT ĐỘC LẬP · DEMO</span></header>
    <div className="hero"><div><p className="eyebrow">TỪ Ý TƯỞNG ĐẾN GIAO DIỆN</p><h1>Thấy từng lần<br/><span>bàn giao công việc.</span></h1></div><p>Mỗi agent một nhiệm vụ, một phiên riêng.<br/>Tài liệu nối các bước. Bạn quyết định trước khi code.</p></div>
    <div className="workspace-top">
      <section className="panel brief"><label htmlFor="idea">Bạn muốn tạo gì?</label><textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} maxLength={8000} disabled={busy || live} /><div className="brief-actions"><small>FE dùng mock · chưa có backend ứng dụng</small><button disabled={!loaded || busy || live || !preflight?.ready || idea.trim().length < 10} onClick={() => { setSelected('requirements'); setPreview(null); void command('/api/demo-runs', { idea, requestId: crypto.randomUUID() }); }}>{busy ? 'Đang xử lý…' : 'Bắt đầu lượt mới →'}</button></div></section>
      <aside className="panel connection"><div className="eyebrow">CODEX CLI</div><p role="status" className={preflight?.ready ? 'online' : 'muted'}>{checking ? 'Đang kiểm tra…' : preflight?.ready ? 'Sẵn sàng nhận việc' : 'Cần kết nối Codex'}</p><p className="connection-note">{preflight?.message ?? 'Đang kết nối với backend.'}</p><button className="secondary" disabled={checking} onClick={() => { setError(''); void refreshPreflight().catch(() => setError('Không kết nối được backend.')); }}>Kiểm tra lại</button></aside>
    </div>
    {error ? <div className="alert" role="alert">{error}</div> : null}
    <section className="flow-section" aria-label="Flow agent"><div className="section-heading"><h2>Luồng bàn giao</h2><div>{snapshot ? <span className="workflow-status">{statuses[snapshot.workflow.status] ?? snapshot.workflow.status}</span> : <span className="muted">Chưa bắt đầu</span>}{snapshot?.allowedActions.includes('cancel') ? <button className="text-button" disabled={busy} onClick={() => void command(`/api/demo-runs/${id}/cancel`, {})}>Dừng lượt chạy</button> : null}</div></div>
      <div className="flow-grid">{DEMO_ROLES.map((role, index) => {
        const stage = snapshot?.tasks.find((t) => t.role === role); const stageRun = snapshot?.runs.find((r) => r.taskId === stage?.id);
        const elapsed = stageRun?.startedAt ? Math.max(0, Math.floor(((stageRun.endedAt ? Date.parse(stageRun.endedAt) : now) - Date.parse(stageRun.startedAt)) / 1000)) : null;
        return <div className="flow-item" key={role}><button className={`agent-card ${stage?.status ?? 'pending'} ${selected === role ? 'active' : ''}`} onClick={() => { setSelected(role); setTab('output'); }} aria-pressed={selected === role}>
          <span className="agent-top"><span className="agent-number">0{index + 1}</span><span className="status-dot" /></span><strong>{labels[role]}</strong><span className="agent-description">{descriptions[role]}</span><span className="agent-bottom">{statuses[stage?.status ?? 'pending']}{elapsed !== null ? <small>{elapsed}s</small> : null}</span>
        </button>{index < 4 ? <button className="handoff-arrow" aria-label={`Xem bàn giao ${labels[role]} sang ${labels[DEMO_ROLES[index + 1]!]}`} onClick={() => { setSelected(DEMO_ROLES[index + 1]!); setTab('input'); }}>→</button> : null}</div>;
      })}</div>
      <div className="flow-caption">Requirements → Reviewer → API Contract → Planner <span>→ BẠN DUYỆT →</span> Frontend</div>
    </section>
    {snapshot?.workflow.reason ? <div className="alert" role="alert">{snapshot.workflow.reason}</div> : null}
    {snapshot?.workflow.status === 'waiting_approval' ? <section className="approval panel"><div><p className="eyebrow">ĐIỂM DUYỆT CỦA BẠN</p><h2>Tài liệu đã sẵn sàng. Cho phép agent FE bắt đầu?</h2><p>Đọc yêu cầu, review, contract và kế hoạch bên dưới. Chưa có code được tạo.</p><div className="document-links">{documents.map(fileButton)}</div><small>Bundle: {snapshot.bundleHash?.slice(0, 16)}</small></div><button disabled={busy} onClick={() => void command(`/api/demo-runs/${id}/approve`, { bundleHash: snapshot.bundleHash })}>Duyệt và tạo FE →</button></section> : null}
    {snapshot?.workflow.status === 'completed' ? <section className="success panel"><div><h2>FE đã build thành công</h2><p>5 agent đã bàn giao xong. FE dùng dữ liệu mock theo API contract.</p></div><a className="button" href={`${apiOrigin}/api/demo-runs/${id}/source.zip`}>Tải source FE ↓</a></section> : null}
    <section className="detail panel"><div className="section-heading"><div><p className="eyebrow">CHI TIẾT AGENT</p><h2>{labels[selected]}</h2></div><small className="run-id">{run?.id ?? 'Chưa có phiên chạy'}</small></div>
      {run?.summary ? <p>{run.summary}</p> : null}{run?.error ? <p className="error-text">{run.error}</p> : null}
      <div className="tabs">{(['output', 'input', 'log'] as const).map((name) => <button key={name} className={tab === name ? 'chosen' : ''} onClick={() => setTab(name)}>{name === 'output' ? `Đầu ra (${outputFiles.length})` : name === 'input' ? `Nhận bàn giao (${inputFiles.length})` : 'Nhật ký'}</button>)}</div>
      {tab === 'log' ? <pre className="log">{log || 'Chưa có log cho agent này.'}</pre> : <div className="files-layout"><nav className="files" aria-label="Danh sách tài liệu">{(tab === 'input' ? inputFiles : outputFiles).map(fileButton)}{!(tab === 'input' ? inputFiles : outputFiles).length ? <p className="muted">{tab === 'input' && selected === 'requirements' ? 'Agent đầu tiên nhận ý tưởng bạn nhập.' : 'File sẽ xuất hiện khi agent nhận việc hoặc bàn giao.'}</p> : null}{tab === 'input' ? <small>Input là file của phiên trước, không phải context chat dùng chung.</small> : null}</nav>
      <article className="preview">{preview ? <><div className="preview-heading"><strong>{preview.artifact.path.split('/').at(-1)}</strong><small>Producer: {preview.artifact.producerRunId}</small></div>{preview.artifact.mediaType === 'text/markdown' ? <ReactMarkdown skipHtml>{preview.content}</ReactMarkdown> : <pre>{preview.content}</pre>}</> : <div className="empty-preview"><span>↳</span><p>Chọn một file để xem nội dung bàn giao.</p></div>}</article></div>}
    </section>
    <footer><span>AI FLOW / LOCAL DEMO</span><span>Phiên thật · Bàn giao bằng file · Lưu dữ liệu cục bộ</span></footer>
  </main>;
}
