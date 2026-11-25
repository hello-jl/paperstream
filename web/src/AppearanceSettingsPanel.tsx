import { useEffect, useId, useState } from 'react';
import type { AppearancePreferences, CustomThemeColorKey, CustomThemeColors } from './appearance-preferences';
import {
  BUILTIN_THEME_COLORS,
  DEFAULT_CUSTOM_THEME,
  contrastRatio,
  parseCustomThemeJson,
  parseHexInput,
  resolveCustomTheme,
  serializeCustomThemeJson,
} from './appearance-preferences';

const CONNECTION_OPTIONS = [
  ['orthogonal', '直角', 'M4 24H25V7H46'],
  ['rounded', '圆角', 'M4 24H20Q25 24 25 19V12Q25 7 30 7H46'],
  ['curved', '曲线', 'M4 24C25 24 25 7 46 7'],
] as const;

const BUILTIN_THEME_OPTIONS = [
  ['sage', '苔绿'],
  ['paper', '纸白'],
  ['night', '夜间'],
] as const;

const COLOR_FIELDS: readonly { key: CustomThemeColorKey; label: string }[] = [
  { key: 'canvas', label: '画布底色' },
  { key: 'surface', label: '卡片底色' },
  { key: 'ink', label: '主文字' },
  { key: 'accent', label: '强调色' },
];

const THEME_SEEDS: readonly { label: string; colors: CustomThemeColors }[] = [
  { label: '苔绿', colors: BUILTIN_THEME_COLORS.sage },
  { label: '纸白', colors: BUILTIN_THEME_COLORS.paper },
  { label: '夜间', colors: BUILTIN_THEME_COLORS.night },
  { label: '暖纸', colors: DEFAULT_CUSTOM_THEME },
];

export interface AppearanceSettingsPanelProps {
  preferences: AppearancePreferences;
  onChange: (next: AppearancePreferences) => void;
  title?: string;
  help?: string;
  error?: string;
  onRetry?: () => void;
}

export function AppearanceSettingsPanel({
  preferences,
  onChange,
  title,
  help,
  error,
  onRetry,
}: AppearanceSettingsPanelProps) {
  const baseId = useId();
  const custom = resolveCustomTheme(preferences);
  const serializedCustom = serializeCustomThemeJson(custom);
  const [drafts, setDrafts] = useState<CustomThemeColors>(custom);
  const [jsonText, setJsonText] = useState(serializedCustom);
  const [jsonError, setJsonError] = useState('');
  const [jsonStatus, setJsonStatus] = useState('');

  useEffect(() => {
    setDrafts(custom);
    setJsonText(serializedCustom);
  }, [serializedCustom]);

  const selectTheme = (theme: AppearancePreferences['theme']) => {
    if (theme === 'custom') {
      onChange({ ...preferences, theme: 'custom', customTheme: custom });
      return;
    }
    onChange({ ...preferences, theme });
  };

  const updateCustomColors = (nextColors: CustomThemeColors) => {
    setJsonError('');
    setJsonStatus('');
    onChange({ ...preferences, theme: 'custom', customTheme: nextColors });
  };

  const updateColorChannel = (key: CustomThemeColorKey, value: string) => {
    updateCustomColors({ ...custom, [key]: value.toLowerCase() });
  };

  const handleHexChange = (key: CustomThemeColorKey, raw: string) => {
    setDrafts(old => ({ ...old, [key]: raw }));
    if (/^\s*#[0-9a-fA-F]{6}\s*$/.test(raw)) {
      const normalized = parseHexInput(raw);
      if (normalized) updateColorChannel(key, normalized);
    }
  };

  const commitHexDraft = (key: CustomThemeColorKey) => {
    const normalized = parseHexInput(drafts[key]);
    if (normalized) {
      setDrafts(old => ({ ...old, [key]: normalized }));
      if (normalized !== custom[key]) updateColorChannel(key, normalized);
      return;
    }
    setDrafts(old => ({ ...old, [key]: custom[key] }));
  };

  const copyJson = async () => {
    setJsonError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(serializedCustom);
      setJsonStatus('已复制当前配色 JSON');
    } catch {
      setJsonStatus('请从下方文本框手动复制 JSON');
    }
  };

  const applyJson = () => {
    setJsonStatus('');
    try {
      const parsed = parseCustomThemeJson(jsonText);
      setJsonError('');
      setDrafts(parsed);
      setJsonText(serializeCustomThemeJson(parsed));
      onChange({ ...preferences, theme: 'custom', customTheme: parsed });
      setJsonStatus('已应用配色');
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const textContrast = contrastRatio(custom.ink, custom.surface);

  return <>
    {title && <strong>{title}</strong>}
    {help && <p className="ps-settings-help">{help}</p>}
    <fieldset><legend>连线路径</legend><div className="ps-settings-options">
      {CONNECTION_OPTIONS.map(([value, label, path]) =>
        <button key={value} type="button" aria-pressed={preferences.connectionStyle === value}
          onClick={() => onChange({ ...preferences, connectionStyle: value })}>
          <svg viewBox="0 0 50 32" aria-hidden="true"><path d={path} /></svg><span>{label}</span>
        </button>)}
    </div></fieldset>
    <fieldset><legend>主题</legend><div className="ps-settings-options ps-theme-options">
      {BUILTIN_THEME_OPTIONS.map(([value, label]) =>
        <button key={value} type="button" aria-pressed={preferences.theme === value} onClick={() => selectTheme(value)}>
          <span className={`ps-theme-swatch is-${value}`} aria-hidden="true" /><span>{label}</span>
        </button>)}
      <button type="button" aria-pressed={preferences.theme === 'custom'} onClick={() => selectTheme('custom')}>
        <span className="ps-theme-swatch is-custom" aria-hidden="true"
          style={{ background: custom.canvas, borderColor: custom.ink }}>
          <span className="ps-theme-swatch-accent" style={{ background: custom.accent }} />
        </span>
        <span>自定义</span>
      </button>
    </div></fieldset>
    {preferences.theme === 'custom' && <div className="ps-custom-theme">
      <div className="ps-theme-seeds" role="group" aria-label="套用基底配色">
        <span>套用基底</span>
        {THEME_SEEDS.map(seed => <button key={seed.label} type="button"
          onClick={() => updateCustomColors({ ...seed.colors })}>{seed.label}</button>)}
      </div>
      <div className="ps-color-grid">
        {COLOR_FIELDS.map(field => {
          const inputId = `${baseId}-${field.key}`;
          return <div key={field.key} className="ps-color-row">
            <label htmlFor={inputId}>{field.label}</label>
            <div className="ps-color-inputs">
              <input type="color" className="ps-color-swatch-input" aria-label={`${field.label}取色器`}
                value={custom[field.key]} onChange={event => updateColorChannel(field.key, event.target.value)} />
              <input id={inputId} type="text" className="ps-color-hex-input" maxLength={7} spellCheck={false}
                aria-label={`${field.label}十六进制色值`} value={drafts[field.key]}
                onChange={event => handleHexChange(field.key, event.target.value)}
                onBlur={() => commitHexDraft(field.key)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitHexDraft(field.key); } }} />
            </div>
          </div>;
        })}
      </div>
      {textContrast < 4.5 && <p className="ps-theme-contrast-warning" role="status">
        主文字与卡片对比度偏低（{textContrast.toFixed(1)}:1，建议 ≥ 4.5:1）。
      </p>}
      <details className="ps-theme-json">
        <summary>导入 / 导出配色 JSON</summary>
        <textarea rows={6} spellCheck={false} aria-label="自定义配色 JSON" value={jsonText}
          onChange={event => { setJsonText(event.target.value); setJsonError(''); setJsonStatus(''); }} />
        <div className="ps-theme-json-actions">
          <button type="button" onClick={() => void copyJson()}>复制 JSON</button>
          <button type="button" onClick={applyJson}>应用 JSON</button>
        </div>
        {jsonError && <p className="ps-theme-json-error" role="alert">{jsonError}</p>}
        {jsonStatus && <p className="ps-theme-json-status" role="status">{jsonStatus}</p>}
      </details>
    </div>}
    {error && <div className="ps-settings-error" role="status"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}>重试保存</button>}</div>}
  </>;
}
