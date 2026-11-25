import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { EmbeddedEditorSession } from './Editor';
import type { EditorHost } from './editor-host';
import {
  AppearancePreferencesContext,
  DEFAULT_APPEARANCE_PREFERENCES,
  customThemeCssVariables,
  isAppearancePreferences,
} from './appearance-preferences';
import type { AppearancePreferences } from './appearance-preferences';
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel';
import './appearance-settings.css';

export interface PaperstreamEmbeddedEditorProps extends EditorHost {
  openExternal?: (url: string) => Promise<void>;
  onReload?: () => void;
  reloadDisabled?: boolean;
}

/** Single resource editor. The adapter keys this component by accepted resource
 * revision, and owns external-update/conflict handling before any remount. */
export function PaperstreamEmbeddedEditor(props: PaperstreamEmbeddedEditorProps) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('paperstream-embedded-appearance-v1') ?? 'null');
      if (isAppearancePreferences(value)) return value;
    } catch { /* Isolated hosts may not provide browser storage. */ }
    return { ...DEFAULT_APPEARANCE_PREFERENCES };
  });
  const [dirty, setDirty] = useState(false);
  const report = useCallback((meta: { fileName: string; dirty: boolean }) => {
    setDirty(meta.dirty);
  }, []);
  const changePreferences = (value: AppearancePreferences) => {
    setPreferences(value);
    try { localStorage.setItem('paperstream-embedded-appearance-v1', JSON.stringify(value)); } catch { /* Session settings remain usable. */ }
  };
  const themeStyle = customThemeCssVariables(preferences.theme, preferences.customTheme) as CSSProperties | undefined;
  return <AppearancePreferencesContext.Provider value={preferences}>
    <div className="paperstream-shell" data-theme={preferences.theme} style={themeStyle}>
      <div className="ps-tabs-header"><strong>Paperstream</strong>
        <div className="ps-tabs"><span className="ps-tab is-active" style={{ padding: '8px 12px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={props.fileName}>{props.fileName}{dirty ? ' ·' : ''}</span></div>
        {props.readOnly && <span className="ps-muted">只读</span>}
        {props.onReload && <button type="button" className="ps-settings-trigger" aria-label="重新载入文件" title="重新载入文件" disabled={props.reloadDisabled} onClick={props.onReload}>↻</button>}
        <details className="ps-global-settings">
          <summary className="ps-settings-trigger" aria-label="全局设置" title="全局设置" style={{ listStyle: 'none' }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-1 3-3 1-2 3 2 2v3l3 2 1 3h4l1-3 3-2v-3l2-2-2-3-3-1-1-3Z"/><circle cx="12" cy="11.5" r="3"/></svg>
          </summary>
          <div className="ps-settings-panel" aria-label="外观设置">
            <AppearanceSettingsPanel preferences={preferences} onChange={changePreferences} title="外观设置" />
          </div>
        </details>
      </div>
      <ReactFlowProvider><EmbeddedEditorSession draftKey="paperstream-embedded" onMeta={report} openExternal={props.openExternal} host={props} /></ReactFlowProvider>
    </div>
  </AppearancePreferencesContext.Provider>;
}
