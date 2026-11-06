import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface TabMetadata { fileName: string; dirty: boolean }
type Theme = 'sage' | 'paper' | 'night';
export function WorkspaceTabs({ draftKey, children, loadTheme, saveTheme }: { draftKey: string; loadTheme?: () => Promise<Theme>; saveTheme?: (theme: Theme) => Promise<void>; children: (key: string, onMeta: (meta: TabMetadata) => void) => ReactNode }) {
  const storageKey = `${draftKey}:tabs`;
  const [state, setState] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(value?.ids) && value.ids.length && value.ids.every((id: unknown) => typeof id === 'string')) {
        return { ids: value.ids as string[], active: value.ids.includes(value.active) ? value.active as string : value.ids[0] as string };
      }
    } catch { /* Start a new workspace when stored tabs are damaged. */ }
    return { ids: ['initial'], active: 'initial' };
  });
  const [metadata, setMetadata] = useState<Record<string, TabMetadata>>({});
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('dsh-paperstream-theme-v1') ?? 'sage'; } catch { return 'sage'; } });
  const [themeError, setThemeError] = useState('');
  const themeChanged = useRef(false);
  const themeQueue = useRef(Promise.resolve());
  useEffect(() => { let active = true; if (loadTheme) void loadTheme().then(value => { if (active && !themeChanged.current) setTheme(value); }).catch(() => { if (active) setThemeError('DSH 主题尚未同步，当前使用本机回退设置'); }); return () => { active = false; }; }, [loadTheme]);
  function changeTheme(value: Theme) {
    themeChanged.current = true; setTheme(value); setThemeError('');
    try { localStorage.setItem('dsh-paperstream-theme-v1', value); } catch { /* Host persistence remains available. */ }
    if (saveTheme) themeQueue.current = themeQueue.current.catch(() => {}).then(() => saveTheme(value)).catch(() => setThemeError('主题未保存到 DSH，请稍后重试'));
  }
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Canvas drafts have their own error handling. */ } }, [state, storageKey]);
  const report = useCallback((id: string, next: TabMetadata) => setMetadata(old => old[id]?.fileName === next.fileName && old[id]?.dirty === next.dirty ? old : { ...old, [id]: next }), []);
  function add() { const id = crypto.randomUUID(); setState(old => ({ ids: [...old.ids, id], active: id })); }
  function close(id: string) {
    if (metadata[id]?.dirty && !window.confirm('这个页签还有未保存的修改。关闭它吗？')) return;
    setState(old => {
      const ids = old.ids.filter(item => item !== id);
      return ids.length ? { ids, active: old.active === id ? ids[Math.max(0, old.ids.indexOf(id) - 1)] ?? ids[0] : old.active }
        : (() => { const fresh = crypto.randomUUID(); return { ids: [fresh], active: fresh }; })();
    });
    try { sessionStorage.removeItem(id === 'initial' ? draftKey : `${draftKey}:${id}`); } catch { /* Ignore unavailable recovery storage. */ }
  }
  return <div className="paperstream-shell" data-theme={theme}>
    <div className="ps-tabs-header"><strong>Paperstream</strong><div className="ps-tabs" role="tablist" aria-label="画布文件">
      {state.ids.map(id => <div className={`ps-tab ${id === state.active ? 'is-active' : ''}`} key={id}>
        <button role="tab" aria-selected={id === state.active} onClick={() => setState(old => ({ ...old, active: id }))}>{metadata[id]?.fileName ?? 'papers.canvas'}{metadata[id]?.dirty ? ' ·' : ''}</button>
        <button className="ps-tab-close" aria-label={`关闭${metadata[id]?.fileName ?? '画布'}页签`} onClick={() => close(id)}>×</button>
      </div>)}
      <button className="ps-add-tab" aria-label="新增画布页签" onClick={add}>＋</button>
    </div><button className="ps-theme" aria-label={`切换主题，当前${theme === 'night' ? '夜间' : theme === 'paper' ? '纸白' : '苔绿'}`} title={themeError || '切换苔绿、纸白、夜间；所有画布共用 DSH 本地设置'} onClick={() => changeTheme(theme === 'sage' ? 'paper' : theme === 'paper' ? 'night' : 'sage')}>◐</button>
    {themeError && <span className="ps-theme-warning" role="status" title={themeError}>主题未同步</span>}</div>
    {state.ids.map(id => <TabPanel key={id} id={id} active={state.active === id} draftKey={id === 'initial' ? draftKey : `${draftKey}:${id}`} report={report} render={children} />)}
  </div>;
}
function TabPanel({ id, active, draftKey, report, render }: { id: string; active: boolean; draftKey: string; report: (id: string, meta: TabMetadata) => void; render: (key: string, onMeta: (meta: TabMetadata) => void) => ReactNode }) {
  const onMeta = useCallback((meta: TabMetadata) => report(id, meta), [id, report]);
  return <div className="ps-tab-panel" role="tabpanel" style={{ display: active ? 'flex' : 'none' }}>{render(draftKey, onMeta)}</div>;
}
