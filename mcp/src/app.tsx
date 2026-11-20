import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { PaperstreamEmbeddedEditor } from '../../web/src/EmbeddedEditor';
import { ResourceSession } from '../../web/src/resource-session';
import type { ResourceSnapshot } from '../../web/src/resource-session';
import type { JSONCanvasDocument } from '../../web/src/canvas';
import { canvasUri, createMcpResources, fileFromToolInput, fileFromToolResult, listCanvases } from './resources';
import type { CanvasFile, ListedCanvas } from './resources';
import './host.css';

const app = new App({ name: 'paperstream', version: '0.1.1' });
const call = (params: { name: string; arguments: Record<string, unknown> }) => app.callServerTool(params);
type View = { file: CanvasFile; session: ResourceSession; snapshot: ResourceSnapshot };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function HostEditor() {
  const [view, setView] = useState<View>();
  const [files, setFiles] = useState<ListedCanvas[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('正在连接画布工具…');
  const [choose, setChoose] = useState<(file: CanvasFile) => void>(() => () => {});

  useEffect(() => {
    let alive = true;
    let connected = false;
    let generation = 0;
    let current: View | undefined;
    let active: ResourceSession | undefined;
    let pending: CanvasFile | undefined;

    const cleanup = () => { active?.dispose(); active = undefined; };
    const open = async (file: CanvasFile) => {
      if (!connected) { pending = file; return; }
      if (current?.file.fileId === file.fileId) {
        try { await current.session.refresh(); }
        catch (err) { if (alive && current?.file.fileId === file.fileId) setError(message(err)); }
        return;
      }
      if (current?.snapshot.dirty || current?.snapshot.saving) {
        setError('当前文件还有未保存的修改。请保存后重新打开目标文件。');
        return;
      }
      const attempt = ++generation;
      cleanup();
      current = undefined;
      setView(undefined);
      setError('');
      setLoading(`正在读取 ${file.name}…`);
      let opened = file;
      const resources = createMcpResources(call, file.fileId, value => { opened = value; });
      const session = new ResourceSession(resources, canvasUri(file.fileId), snapshot => {
        if (!alive || generation !== attempt) return;
        current = { file: opened, session, snapshot };
        setView(current);
        setLoading('');
      });
      active = session;
      try { await session.refresh(); }
      catch (err) { if (alive && generation === attempt) { setLoading(''); setError(message(err)); } }
    };
    setChoose(() => (file: CanvasFile) => { void open(file); });
    const onInput = ({ arguments: args }: { arguments?: Record<string, unknown> }) => {
      const file = fileFromToolInput(args);
      if (file) void open(file);
    };
    // Tool results also arrive when an agent edits the open file. ResourceSession
    // accepts a clean refresh and preserves any draft, including invalid input.
    const onResult = (result: unknown) => {
      const file = fileFromToolResult(result);
      if (file) void open(file);
    };
    const applyContext = () => {
      const context = app.getHostContext();
      if (context?.theme) applyDocumentTheme(context.theme);
      if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
    };
    app.addEventListener('toolinput', onInput);
    app.addEventListener('toolresult', onResult);
    app.addEventListener('hostcontextchanged', applyContext);
    app.onteardown = async () => { alive = false; cleanup(); return {}; };
    const onPageHide = () => { alive = false; cleanup(); };
    window.addEventListener('pagehide', onPageHide);
    void app.connect().then(async () => {
      if (!alive) return;
      connected = true;
      applyContext();
      if (pending) { await open(pending); return; }
      try {
        const available = await listCanvases(call);
        if (!alive || active || current || pending) return;
        setFiles(available);
        if (available.length === 1) await open(available[0]);
        else setLoading(available.length ? '选择要打开的画布。' : '此服务尚未授权任何画布文件。');
      } catch (err) { if (alive) { setLoading(''); setError(message(err)); } }
    }).catch(err => { if (alive) { setLoading(''); setError(`连接画布工具失败：${message(err)}`); } });
    return () => {
      alive = false;
      cleanup();
      app.onteardown = undefined;
      window.removeEventListener('pagehide', onPageHide);
      app.removeEventListener('toolinput', onInput);
      app.removeEventListener('toolresult', onResult);
      app.removeEventListener('hostcontextchanged', applyContext);
      void app.close();
    };
  }, []);

  const session = view?.session;
  const onDirtyChange = useCallback((dirty: boolean) => session?.setDirty(dirty), [session]);
  const onDocumentChange = useCallback((_document: JSONCanvasDocument, source: string) => session?.noteLocalSource(source), [session]);
  const onInputChange = useCallback((form: Readonly<Record<string, string>>) => session?.noteLocalInput(form), [session]);
  const onSave = useCallback(async (document: JSONCanvasDocument) => {
    if (!session) throw new Error('画布会话尚未准备好。');
    await session.save(document);
  }, [session]);
  const reload = async () => {
    if (!view) return;
    if (view.snapshot.dirty && !window.confirm('重新载入将放弃当前未保存的修改。建议先导出备份。继续吗？')) return;
    try { setError(''); await view.session.refresh(true); }
    catch (err) { setError(message(err)); }
  };
  return <main className="ps-mcp">
    {(error || view?.snapshot.notice || loading) && <div className="ps-mcp-notice" role={error || view?.snapshot.externalChange ? 'alert' : 'status'}>
      {error || view?.snapshot.notice || loading}
    </div>}
    {!view && files.length > 1 && <nav className="ps-mcp-files" aria-label="已授权画布">
      {files.map(file => <button type="button" key={file.fileId} onClick={() => choose(file)}>{file.name}{file.writable ? '' : ' · 只读'}</button>)}
    </nav>}
    {view && <section className="ps-mcp-editor">
      <PaperstreamEmbeddedEditor key={`${view.file.fileId}:${view.snapshot.revision}`}
        document={view.snapshot.document} fileName={view.file.name} readOnly={view.snapshot.readOnly}
        onSave={onSave} onDirtyChange={onDirtyChange} onDocumentChange={onDocumentChange} onInputChange={onInputChange}
        onReload={() => void reload()} reloadDisabled={view.snapshot.saving}
        openExternal={async url => { await app.openLink({ url }); }} />
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<HostEditor />);
