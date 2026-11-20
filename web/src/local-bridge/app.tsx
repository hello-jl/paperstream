import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PaperstreamEmbeddedEditor } from '../EmbeddedEditor';
import { ResourceSession } from '../resource-session';
import type { ResourceSnapshot } from '../resource-session';
import type { JSONCanvasDocument } from '../canvas';
import { createHttpResources, LOCAL_RESOURCE_URI, localToken } from './http-resources';
import { createRefreshController } from './refresh-controller';
import './host.css';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
type View = { session: ResourceSession; snapshot: ResourceSnapshot; name: string };

function LocalEditor() {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const refresh = useRef<ReturnType<typeof createRefreshController>>();
  useEffect(() => {
    let storage: Storage | undefined;
    try { storage = sessionStorage; } catch { /* Fragment works without storage. */ }
    const credentials = localToken(location.hash, storage);
    if (credentials.clearFragment) history.replaceState(null, '', location.pathname + location.search);
    let adapter: ReturnType<typeof createHttpResources>;
    try { adapter = createHttpResources(credentials.token); }
    catch (err) { setError(message(err)); setLoading(false); return; }
    let alive = true;
    let hasDocument = false;
    const session = new ResourceSession(adapter.resources, LOCAL_RESOURCE_URI, snapshot => {
      if (!alive) return;
      hasDocument = true;
      setView({ session, snapshot, name: adapter.fileName() }); setLoading(false);
    });
    const controller = createRefreshController(session, {
      onStart(discard) { setError(''); setReloading(discard); if (!hasDocument) setLoading(true); },
      onSuccess() { setError(''); setLoading(false); setReloading(false); },
      onError(err) { setError(message(err)); setLoading(false); setReloading(false); },
    });
    refresh.current = controller; setCanRetry(true);
    const focus = () => { void controller.refresh().catch(() => {}); };
    focus();
    window.addEventListener('focus', focus);
    return () => {
      alive = false; controller.dispose(); session.dispose();
      if (refresh.current === controller) refresh.current = undefined;
      window.removeEventListener('focus', focus);
    };
  }, []);
  const session = view?.session;
  const onDirtyChange = useCallback((dirty: boolean) => session?.setDirty(dirty), [session]);
  const onDocumentChange = useCallback((_document: JSONCanvasDocument, source: string) => session?.noteLocalSource(source), [session]);
  const onInputChange = useCallback((form: Readonly<Record<string, string>>) => session?.noteLocalInput(form), [session]);
  const save = useCallback(async (document: JSONCanvasDocument) => {
    if (!session) throw new Error('本地文件尚未载入。');
    setError(''); await session.save(document);
  }, [session]);
  async function reload() {
    if (!view) return;
    if (view.snapshot.dirty && !window.confirm('重新载入会放弃未保存的修改。继续吗？')) return;
    await refresh.current?.refresh(true).catch(() => {});
  }
  const notice = error || view?.snapshot.notice || (loading ? '正在打开画布…' : '');
  return <main className="ps-local">
    {notice && <div className="ps-local-notice" role={error || view?.snapshot.externalChange ? 'alert' : 'status'}>{notice}
      {error && canRetry && <button type="button" disabled={loading || reloading}
        onClick={() => void refresh.current?.refresh().catch(() => {})}>重试</button>}</div>}
    {view && <section className="ps-local-editor"><PaperstreamEmbeddedEditor
      key={view.snapshot.revision} document={view.snapshot.document} fileName={view.name} readOnly={view.snapshot.readOnly}
      onSave={save} onDirtyChange={onDirtyChange} onDocumentChange={onDocumentChange} onInputChange={onInputChange}
      onReload={() => void reload()} reloadDisabled={view.snapshot.saving || reloading} /></section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<LocalEditor />);
