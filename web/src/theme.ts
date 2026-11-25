export const BUILTIN_THEMES = ['sage', 'paper', 'night'] as const;
export const SUPPORTED_THEMES = ['sage', 'paper', 'night', 'custom'] as const;
export const CONNECTION_STYLES = ['orthogonal', 'rounded', 'curved'] as const;
export const CUSTOM_THEME_KEYS = ['canvas', 'surface', 'ink', 'accent'] as const;

export type BuiltinTheme = (typeof BUILTIN_THEMES)[number];
export type PaperstreamTheme = (typeof SUPPORTED_THEMES)[number];
export type ConnectionStylePreference = (typeof CONNECTION_STYLES)[number];
export type CustomThemeColorKey = (typeof CUSTOM_THEME_KEYS)[number];

export interface CustomThemeColors {
  canvas: string;
  surface: string;
  ink: string;
  accent: string;
}

export interface AppearancePreferences {
  theme: PaperstreamTheme;
  connectionStyle: ConnectionStylePreference;
  customTheme?: CustomThemeColors;
}

export interface ThemeTokens {
  colorScheme: 'light' | 'dark';
  ink: string;
  muted: string;
  body: string;
  line: string;
  accent: string;
  accentInk: string;
  canvas: string;
  surface: string;
  surfaceAlt: string;
  field: string;
  cardLine: string;
  selected: string;
  grid: string;
  error: string;
  errorBg: string;
  focus: string;
  shadow: string;
  edge: string;
}

export interface ThemeExportPalette {
  background: string;
  cardBackground: string;
  foreground: string;
  muted: string;
  cardBorder: string;
  edgeColor: string;
  surfaceAlt: string;
}

export const BUILTIN_THEME_COLORS: Record<BuiltinTheme, CustomThemeColors> = {
  sage: { canvas: '#f5f7f3', surface: '#ffffff', ink: '#293d33', accent: '#3e7054' },
  paper: { canvas: '#fafaf8', surface: '#ffffff', ink: '#303330', accent: '#4c6254' },
  night: { canvas: '#19221c', surface: '#222d25', ink: '#e0e7df', accent: '#91bb9c' },
};

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  canvas: '#f6f3ec',
  surface: '#fffdf9',
  ink: '#2f2923',
  accent: '#9a5b32',
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: 'sage',
  connectionStyle: 'rounded',
};

export const BUILTIN_THEME_TOKENS: Record<BuiltinTheme, ThemeTokens> = {
  sage: {
    colorScheme: 'light',
    ink: '#293d33',
    muted: '#6c7b72',
    body: '#5f7065',
    line: '#dce4dd',
    accent: '#3e7054',
    accentInk: '#ffffff',
    canvas: '#f5f7f3',
    surface: '#ffffff',
    surfaceAlt: '#eef3ed',
    field: '#fafcf9',
    cardLine: '#b9c9bd',
    selected: '#eaf2e9',
    grid: '#d8e1d7',
    error: '#a34e44',
    errorBg: '#fff5f2',
    focus: '#749981',
    shadow: '#203c2a18',
    edge: '#70877e',
  },
  paper: {
    colorScheme: 'light',
    ink: '#303330',
    muted: '#737773',
    body: '#626962',
    line: '#e0e3de',
    accent: '#4c6254',
    accentInk: '#ffffff',
    canvas: '#fafaf8',
    surface: '#ffffff',
    surfaceAlt: '#f1f3ef',
    field: '#fafbf9',
    cardLine: '#c9cec6',
    selected: '#eef2ec',
    grid: '#e0e3dc',
    error: '#a34e44',
    errorBg: '#fff5f2',
    focus: '#829482',
    shadow: '#203c2a18',
    edge: '#737773',
  },
  night: {
    colorScheme: 'dark',
    ink: '#e0e7df',
    muted: '#a3b0a4',
    body: '#bac7bd',
    line: '#37463b',
    accent: '#91bb9c',
    accentInk: '#17271c',
    canvas: '#19221c',
    surface: '#222d25',
    surfaceAlt: '#2b382e',
    field: '#1e2922',
    cardLine: '#4c6050',
    selected: '#304535',
    grid: '#344238',
    error: '#eea396',
    errorBg: '#382824',
    focus: '#7fa98a',
    shadow: '#00000030',
    edge: '#7ea588',
  },
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const HEX_SHORTHAND_RE = /^#([0-9a-fA-F]{3})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function parseHexInput(value: string): string | null {
  const trimmed = value.trim();
  if (HEX_COLOR_RE.test(trimmed)) return trimmed.toLowerCase();
  const short = HEX_SHORTHAND_RE.exec(trimmed);
  if (!short) return null;
  const [r, g, b] = short[1].toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}

export function isCustomThemeColors(value: unknown): value is CustomThemeColors {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== CUSTOM_THEME_KEYS.length) return false;
  return CUSTOM_THEME_KEYS.every(key => Object.hasOwn(value, key) && isHexColor(value[key]));
}

export function normalizeCustomThemeColors(colors: CustomThemeColors): CustomThemeColors {
  return {
    canvas: colors.canvas.toLowerCase(),
    surface: colors.surface.toLowerCase(),
    ink: colors.ink.toLowerCase(),
    accent: colors.accent.toLowerCase(),
  };
}

export function resolveCustomTheme(preferences?: Pick<AppearancePreferences, 'customTheme'>): CustomThemeColors {
  if (preferences?.customTheme && isCustomThemeColors(preferences.customTheme)) {
    return normalizeCustomThemeColors(preferences.customTheme);
  }
  return { ...DEFAULT_CUSTOM_THEME };
}

export function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!isPlainObject(value)) return false;
  const preferences = value as Record<string, unknown>;
  if (typeof preferences.theme !== 'string' || !(SUPPORTED_THEMES as readonly string[]).includes(preferences.theme)) {
    return false;
  }
  if (typeof preferences.connectionStyle !== 'string' || !(CONNECTION_STYLES as readonly string[]).includes(preferences.connectionStyle)) {
    return false;
  }
  if (preferences.customTheme !== undefined && !isCustomThemeColors(preferences.customTheme)) {
    return false;
  }
  return true;
}

export function serializeCustomThemeJson(colors: CustomThemeColors): string {
  return JSON.stringify(normalizeCustomThemeColors(colors), null, 2);
}

export function parseCustomThemeJson(text: string): CustomThemeColors {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式无效，请检查括号与引号。');
  }
  if (!isPlainObject(parsed)) {
    throw new Error('配色 JSON 必须是包含 canvas、surface、ink、accent 的对象。');
  }
  const source = Object.hasOwn(parsed, 'customTheme') ? parsed.customTheme : parsed;
  if (!isPlainObject(source)) {
    throw new Error('customTheme 字段必须是包含四种颜色的对象。');
  }
  const unknownKeys = Object.keys(source).filter(key => !(CUSTOM_THEME_KEYS as readonly string[]).includes(key));
  if (unknownKeys.length) {
    throw new Error(`包含不支持的颜色字段：${unknownKeys.join(', ')}`);
  }
  const result = {} as CustomThemeColors;
  for (const key of CUSTOM_THEME_KEYS) {
    const raw = source[key];
    if (typeof raw !== 'string') {
      throw new Error(`缺少或无效的颜色字段：${key}`);
    }
    const normalized = parseHexInput(raw);
    if (!normalized) {
      throw new Error(`颜色 ${key} 必须是 #rrggbb 或 #rgb 十六进制格式。`);
    }
    result[key] = normalized;
  }
  return result;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = parseHexInput(hex);
  if (!clean) throw new Error(`Invalid hex color: ${hex}`);
  return [
    Number.parseInt(clean.slice(1, 3), 16),
    Number.parseInt(clean.slice(3, 5), 16),
    Number.parseInt(clean.slice(5, 7), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function mixHex(first: string, second: string, ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  const [r1, g1, b1] = hexToRgb(first);
  const [r2, g2, b2] = hexToRgb(second);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function deriveCustomThemeTokens(colors: CustomThemeColors): ThemeTokens {
  const c = normalizeCustomThemeColors(colors);
  const isDark = relativeLuminance(c.surface) < 0.24;
  const lightInk = '#ffffff';
  const darkInk = '#17221b';
  const accentInk = contrastRatio(c.accent, lightInk) >= contrastRatio(c.accent, darkInk) ? lightInk : darkInk;
  return {
    colorScheme: isDark ? 'dark' : 'light',
    ink: c.ink,
    muted: mixHex(c.ink, c.surface, 0.42),
    body: mixHex(c.ink, c.surface, 0.22),
    line: mixHex(c.surface, c.ink, isDark ? 0.16 : 0.14),
    accent: c.accent,
    accentInk,
    canvas: c.canvas,
    surface: c.surface,
    surfaceAlt: mixHex(mixHex(c.surface, c.ink, isDark ? 0.09 : 0.05), c.accent, 0.06),
    field: mixHex(c.surface, c.canvas, 0.45),
    cardLine: mixHex(c.surface, c.ink, isDark ? 0.28 : 0.24),
    selected: mixHex(c.surface, c.accent, isDark ? 0.26 : 0.16),
    grid: mixHex(c.canvas, c.ink, isDark ? 0.16 : 0.14),
    error: isDark ? '#eea396' : '#a34e44',
    errorBg: isDark ? mixHex(c.surface, '#7a2c22', 0.35) : '#fff5f2',
    focus: mixHex(c.accent, isDark ? '#ffffff' : c.surface, 0.2),
    shadow: isDark ? '#00000040' : '#203c2a18',
    edge: mixHex(c.ink, c.surface, isDark ? 0.34 : 0.38),
  };
}

export function resolveThemeTokens(theme: PaperstreamTheme, customTheme?: CustomThemeColors): ThemeTokens {
  if (theme === 'custom') return deriveCustomThemeTokens(resolveCustomTheme({ customTheme }));
  return BUILTIN_THEME_TOKENS[theme];
}

export function customThemeCssVariables(theme: PaperstreamTheme, customTheme?: CustomThemeColors): Record<string, string> | undefined {
  if (theme !== 'custom') return undefined;
  const tokens = resolveThemeTokens('custom', customTheme);
  return {
    colorScheme: tokens.colorScheme,
    '--ps-ink': tokens.ink,
    '--ps-muted': tokens.muted,
    '--ps-body': tokens.body,
    '--ps-line': tokens.line,
    '--ps-border': tokens.line,
    '--ps-accent': tokens.accent,
    '--ps-accent-ink': tokens.accentInk,
    '--ps-canvas': tokens.canvas,
    '--ps-surface': tokens.surface,
    '--ps-surface-alt': tokens.surfaceAlt,
    '--ps-field': tokens.field,
    '--ps-card-line': tokens.cardLine,
    '--ps-selected': tokens.selected,
    '--ps-grid': tokens.grid,
    '--ps-error': tokens.error,
    '--ps-error-bg': tokens.errorBg,
    '--ps-focus': tokens.focus,
    '--ps-shadow': tokens.shadow,
    '--ps-edge': tokens.edge,
  };
}

export function exportPaletteForTheme(theme: PaperstreamTheme, customTheme?: CustomThemeColors): ThemeExportPalette {
  const tokens = resolveThemeTokens(theme, customTheme);
  return {
    background: tokens.canvas,
    cardBackground: tokens.surface,
    foreground: tokens.ink,
    muted: tokens.muted,
    cardBorder: tokens.cardLine,
    edgeColor: tokens.edge,
    surfaceAlt: tokens.surfaceAlt,
  };
}
