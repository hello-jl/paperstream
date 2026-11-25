import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/app';
import { PaperstreamEmbeddedEditor } from '../../web/src/EmbeddedEditor';
import { ResourceSession } from '../../web/src/resource-session';
import { ResourceSubscriptions } from './resource-subscriptions';
import type { ResourceSnapshot } from '../../web/src/resource-session';
import type { JSONCanvasDocument } from '../../web/src/canvas';
import './host.css';

const app = new App({ name: 'paperstream', version: '0.1.2' });
const extensions = new OpenAIExtensions(app);
type OpenFile = { name: string; resourceUri: string };
type View = { file: OpenFile; session: ResourceSession; snapshot: ResourceSnapshot };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function HostEditor() {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('正在连接 ChatGPT 文件服务…');

  useEffect(() => {
    let alive = true;
    let current: View | undefined;
    let active: { session: ResourceSession; disposeHandler: () => void; unsubscribe: () => Promise<void> } | undefined;
    const subscriptions = new ResourceSubscriptions();
    let generation = 0;
    let connected = false;
    let pending: OpenFile | undefined;

    const cleanup = () => {
      const closing = active;
      closing?.session.dispose();
      closing?.disposeHandler();
      active = undefined;
      return closing ? closing.unsubscribe().catch(() => {}) : Promise.resolve();
    };
    const open = async (file: OpenFile) => {
      if (!connected) { pending = file; return; }
      if (current?.file.resourceUri === file.resourceUri) { await current.session.refresh(); return; }
      if (current?.snapshot.dirty) {
        setError('当前文件还有未保存的修改。请保存后重新打开目标文件。');
        return;
      }
      const resources = extensions.resources;
      if (!app.getHostCapabilities()?.experimental?.['openai/resource'] || !resources) {
        setLoading('');
        setError('此宿主未开放文件资源接口，无法读取或保存 Canvas。请在支持文件编辑扩展的 ChatGPT 桌面版本中打开。');
        return;
      }
      const attempt = ++generation;
      void cleanup();
      current = undefined;
      setView(undefined);
      setError('');
      setLoading(`正在读取 ${file.name}…`);
      const session = new ResourceSession(resources, file.resourceUri, snapshot => {
        if (!alive || generation !== attempt) return;
        current = { file, session, snapshot };
        setView(current);
        setLoading('');
      });
      const disposeHandler = resources.addUpdateHandler(async ({ params }) => {
        if (params.uri !== file.resourceUri) return;
        try { await session.refresh(); }
        catch (err) { if (alive && generation === attempt) setError(`读取外部更新失败：${message(err)}`); }
      });
      const subscription = subscriptions.open(resources, file.resourceUri);
      active = { session, disposeHandler, unsubscribe: subscription.close };
      // Subscribe first so an update between subscription and the initial read
      // cannot leave the editor silently showing an old version.
      try {
        await subscription.ready;
      } catch (err) {
        if (alive && generation === attempt) setError(`无法订阅文件更新；请使用“重新载入”检查外部修改。${message(err)}`);
      }
      await session.refresh();
    };
    const onInput = ({ arguments: args }: { arguments?: Record<string, unknown> }) => {
      const parsed = OpenAIFileEntrypointInputSchema.safeParse(args);
      if (!parsed.success) {
        setLoading('');
        setError('请从会话文件面板打开一个 .canvas 文件。');
        return;
      }
      void open(parsed.data.file).catch(err => { if (alive) { setLoading(''); setError(message(err)); } });
    };
    const applyContext = () => {
      const context = app.getHostContext();
      if (context?.theme) applyDocumentTheme(context.theme);
      if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
    };
    app.addEventListener('toolinput', onInput);
    app.addEventListener('hostcontextchanged', applyContext);
    app.onteardown = async () => { alive = false; await cleanup(); return {}; };
    const onPageHide = () => { alive = false; void cleanup(); };
    window.addEventListener('pagehide', onPageHide);
    void app.connect().then(async () => {
      if (!alive) return;
      connected = true;
      applyContext();
      if (pending) await open(pending);
      else if (alive) setLoading('请从会话文件面板打开一个 .canvas 文件。');
    }).catch(err => { if (alive) { setLoading(''); setError(`连接文件服务失败：${message(err)}`); } });
    return () => {
      alive = false;
      void cleanup();
      app.onteardown = undefined;
      window.removeEventListener('pagehide', onPageHide);
      app.removeEventListener('toolinput', onInput);
      app.removeEventListener('hostcontextchanged', applyContext);
      void app.close();
    };
  }, []);

  const session = view?.session;
  const onDirtyChange = useCallback((dirty: boolean) => session?.setDirty(dirty), [session]);
  const onDocumentChange = useCallback((_document: JSONCanvasDocument, canonicalSource: string) => session?.noteLocalSource(canonicalSource), [session]);
  const onInputChange = useCallback((form: Readonly<Record<string, string>>) => session?.noteLocalInput(form), [session]);
  const onSave = useCallback(async (document: JSONCanvasDocument) => {
    if (!session) throw new Error('文件会话尚未准备好。');
    await session.save(document);
  }, [session]);
  const reload = async () => {
    if (!view) return;
    if (view.snapshot.dirty && !window.confirm('重新载入将放弃当前未保存的修改。建议先导出备份。继续吗？')) return;
    try { setError(''); await view.session.refresh(true); }
    catch (err) { setError(message(err)); }
  };
  return <main className="ps-codex">
    {(error || view?.snapshot.notice || loading) && <div className="ps-codex-notice" role={error || view?.snapshot.externalChange ? 'alert' : 'status'}>
      {error || view?.snapshot.notice || loading}
    </div>}
    {view && <section className="ps-codex-editor">
      <PaperstreamEmbeddedEditor key={`${view.file.resourceUri}:${view.snapshot.revision}`}
        document={view.snapshot.document} fileName={view.file.name} readOnly={view.snapshot.readOnly}
        onSave={onSave} onDirtyChange={onDirtyChange} onDocumentChange={onDocumentChange} onInputChange={onInputChange}
        onReload={() => void reload()} reloadDisabled={view.snapshot.saving}
        openExternal={async url => { await app.openLink({ url }); }} />
    </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<HostEditor />);
