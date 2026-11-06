import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppearancePreferencesContext, DEFAULT_APPEARANCE_PREFERENCES, isAppearancePreferences } from './appearance-preferences';
import type { AppearancePreferences } from './appearance-preferences';
import './appearance-settings.css';
import { hydrateWorkspace, persistWorkspace, deleteDraft, subscribeWorkspaceStatus, getWorkspaceStatus, tabDraftKey } from './workspace-store';

export interface TabMetadata { fileName: string; dirty: boolean }
type Theme = AppearancePreferences['theme'];
const preferencesKey = 'dsh-paperstream-appearance-v1';
function localPreferences(): AppearancePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null');
    if (isAppearancePreferences(value)) return value;
    const theme = localStorage.getItem('dsh-paperstream-theme-v1');
    if (theme === 'sage' || theme === 'paper' || theme === 'night') return { ...DEFAULT_APPEARANCE_PREFERENCES, theme };
  } catch { /* A damaged or unavailable local preference uses the defaults. */ }
  return { ...DEFAULT_APPEARANCE_PREFERENCES };
}
export function WorkspaceTabs({ draftKey, children, loadTheme, saveTheme, loadPreferences, savePreferences }: { draftKey: string; loadPreferences?: () => Promise<AppearancePreferences>; savePreferences?: (value: AppearancePreferences) => Promise<void>; loadTheme?: () => Promise<Theme>; saveTheme?: (theme: Theme) => Promise<void>; children: (key: string, onMeta: (meta: TabMetadata) => void) => ReactNode }) {
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
  const [ready, setReady] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState(getWorkspaceStatus);
  const canPersistTabs = useRef(false);
  useEffect(() => subscribeWorkspaceStatus(setWorkspaceStatus), []);
  useEffect(() => {
    let active = true;
    setReady(false);
    void hydrateWorkspace(draftKey, state).then(restored => {
      if (active) { canPersistTabs.current = true; setState(restored); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [draftKey]);
  const [preferences, setPreferences] = useState(localPreferences);
  const [preferencesError, setPreferencesError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsElement = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const preferencesChanged = useRef(0);
  const preferencesQueue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    const load = loadPreferences ?? (loadTheme ? async () => ({ ...localPreferences(), theme: await loadTheme() }) : undefined);
    if (load) void load().then(value => {
      if (!isAppearancePreferences(value)) throw new Error('Invalid appearance preferences');
      if (active && !preferencesChanged.current) {
        setPreferences(value); setPreferencesError('');
        try { localStorage.setItem(preferencesKey, JSON.stringify(value)); } catch { /* The host already has the durable settings. */ }
      }
    }).catch(() => { if (active && !preferencesChanged.current) setPreferencesError('DSH 设置尚未同步，当前使用本机回退设置'); });
    return () => { active = false; };
  }, [loadPreferences, loadTheme]);
  useEffect(() => {
    if (!settingsOpen) return;
    const dismiss = (event: PointerEvent) => { if (!settingsElement.current?.contains(event.target as Node)) setSettingsOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSettingsOpen(false); settingsButton.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [settingsOpen]);
  function changePreferences(value: AppearancePreferences) {
    const version = ++preferencesChanged.current;
    setPreferences(value); setPreferencesError('');
    let localSaved = false;
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(value));
      localSaved = true;
      localStorage.setItem('dsh-paperstream-theme-v1', value.theme);
    } catch { /* Host persistence remains available. */ }
    const save = savePreferences ?? (saveTheme ? (next: AppearancePreferences) => saveTheme(next.theme) : undefined);
    if (save) preferencesQueue.current = preferencesQueue.current.catch(() => {}).then(() => save(value))
      .then(() => { if (preferencesChanged.current === version) setPreferencesError(''); })
      .catch(() => { if (preferencesChanged.current === version) setPreferencesError('设置未保存到 DSH，请重试'); });
    else if (!localSaved) setPreferencesError('设置未保存到本机，关闭后可能丢失，请重试');
  }
  useEffect(() => {
    if (!ready || !canPersistTabs.current) return;
    void persistWorkspace(draftKey, state).catch(() => { /* The shared status reports persistence failures. */ });
  }, [state, ready, draftKey]);
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
    void deleteDraft(tabDraftKey(draftKey, id)).catch(() => { /* Preserve the existing durable record if recovery failed. */ });
  }
  return <AppearancePreferencesContext.Provider value={preferences}><div className="paperstream-shell" data-theme={preferences.theme}>
    <div className="ps-tabs-header"><strong>Paperstream</strong><div className="ps-tabs" role="tablist" aria-label="画布文件">
      {state.ids.map(id => <div className={`ps-tab ${id === state.active ? 'is-active' : ''}`} key={id}>
        <button role="tab" disabled={!ready} aria-selected={id === state.active} onClick={() => setState(old => ({ ...old, active: id }))}>{metadata[id]?.fileName ?? 'papers.canvas'}{metadata[id]?.dirty ? ' ·' : ''}</button>
        <button disabled={!ready} className="ps-tab-close" aria-label={`关闭${metadata[id]?.fileName ?? '画布'}页签`} onClick={() => close(id)}>×</button>
      </div>)}
      <button disabled={!ready} className="ps-add-tab" aria-label="新增画布页签" onClick={add}>＋</button>
    </div><div className="ps-global-settings" ref={settingsElement}>
      <button ref={settingsButton} className="ps-settings-trigger" aria-label="全局设置" title="全局设置" aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen(open => !open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-1 3-3 1-2 3 2 2v3l3 2 1 3h4l1-3 3-2v-3l2-2-2-3-3-1-1-3Z"/><circle cx="12" cy="11.5" r="3"/></svg>
      </button>
      {settingsOpen && <div className="ps-settings-panel" role="dialog" aria-label="全局设置">
        <strong>全局设置</strong><p className="ps-settings-help">所有画布共用，自动保存</p>
        <fieldset><legend>连线路径</legend><div className="ps-settings-options">
          {([['orthogonal', '直角', 'M4 24H25V7H46'], ['rounded', '圆角', 'M4 24H20Q25 24 25 19V12Q25 7 30 7H46'], ['curved', '曲线', 'M4 24C25 24 25 7 46 7']] as const).map(([value, label, path]) =>
            <button key={value} type="button" aria-pressed={preferences.connectionStyle === value} onClick={() => changePreferences({ ...preferences, connectionStyle: value })}>
              <svg viewBox="0 0 50 32" aria-hidden="true"><path d={path}/></svg><span>{label}</span>
            </button>)}
        </div></fieldset>
        <fieldset><legend>主题</legend><div className="ps-settings-options">
          {([['sage', '苔绿'], ['paper', '纸白'], ['night', '夜间']] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={preferences.theme === value} onClick={() => changePreferences({ ...preferences, theme: value })}>
              <span className={`ps-theme-swatch is-${value}`} aria-hidden="true"/><span>{label}</span>
            </button>)}
        </div></fieldset>
        {preferencesError && <div className="ps-settings-error" role="status"><p>{preferencesError}</p><button type="button" onClick={() => changePreferences(preferences)}>重试保存</button></div>}
      </div>}
    </div>{preferencesError && <span className="ps-theme-warning" role="status" title={preferencesError}>设置未同步</span>}</div>
    {workspaceStatus.state === 'error' && <div role="status" className="ps-workspace-warning" style={{ padding: '4px 12px', fontSize: 11, color: '#a56e31' }}>{workspaceStatus.message}</div>}
    {ready ? state.ids.map(id => <TabPanel key={id} id={id} active={state.active === id} draftKey={tabDraftKey(draftKey, id)} report={report} render={children} />)
      : <div role="status" style={{ padding: 24 }}>正在恢复工作区…</div>}
  </div></AppearancePreferencesContext.Provider>;
}
function TabPanel({ id, active, draftKey, report, render }: { id: string; active: boolean; draftKey: string; report: (id: string, meta: TabMetadata) => void; render: (key: string, onMeta: (meta: TabMetadata) => void) => ReactNode }) {
  const onMeta = useCallback((meta: TabMetadata) => report(id, meta), [id, report]);
  return <div className="ps-tab-panel" role="tabpanel" style={{ display: active ? 'flex' : 'none' }}>{render(draftKey, onMeta)}</div>;
}
