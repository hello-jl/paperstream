import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILTIN_THEME_COLORS,
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_CUSTOM_THEME,
  contrastRatio,
  customThemeCssVariables,
  deriveCustomThemeTokens,
  exportPaletteForTheme,
  isAppearancePreferences,
  isCustomThemeColors,
  isHexColor,
  parseCustomThemeJson,
  parseHexInput,
  resolveCustomTheme,
  resolveThemeTokens,
  serializeCustomThemeJson,
} from './theme.ts';

test('hex validation and shorthand normalization enforce #rrggbb format', () => {
  assert.equal(isHexColor('#a1B2c3'), true);
  assert.equal(isHexColor('#abc'), false);
  assert.equal(isHexColor('red'), false);
  assert.equal(parseHexInput(' #AbC '), '#aabbcc');
  assert.equal(parseHexInput('#123456'), '#123456');
  assert.equal(parseHexInput('#12345'), null);
  assert.equal(parseHexInput('not-a-color'), null);
});

test('appearance preference validation keeps backward compatibility and rejects malformed custom themes', () => {
  assert.equal(isAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES), true);
  assert.equal(isAppearancePreferences({ theme: 'night', connectionStyle: 'curved' }), true);
  assert.equal(isAppearancePreferences({
    theme: 'custom',
    connectionStyle: 'orthogonal',
    customTheme: DEFAULT_CUSTOM_THEME,
  }), true);
  assert.equal(isCustomThemeColors({ ...DEFAULT_CUSTOM_THEME, extra: '#ffffff' }), false);
  assert.equal(isAppearancePreferences({
    theme: 'custom',
    connectionStyle: 'rounded',
    customTheme: { canvas: '#fff', surface: '#ffffff', ink: '#000000', accent: '#123456' },
  }), false);
  assert.equal(isAppearancePreferences({ theme: 'unknown', connectionStyle: 'rounded' }), false);
  assert.deepEqual(resolveCustomTheme({}), DEFAULT_CUSTOM_THEME);
  assert.deepEqual(resolveCustomTheme({
    customTheme: { canvas: '#AABBCC', surface: '#112233', ink: '#445566', accent: '#778899' },
  }), { canvas: '#aabbcc', surface: '#112233', ink: '#445566', accent: '#778899' });
});

test('custom theme JSON import/export supports direct objects, wrapper objects, and #rgb shorthands', () => {
  const exported = serializeCustomThemeJson(DEFAULT_CUSTOM_THEME);
  assert.deepEqual(parseCustomThemeJson(exported), DEFAULT_CUSTOM_THEME);

  const wrapped = parseCustomThemeJson(JSON.stringify({
    theme: 'custom',
    connectionStyle: 'rounded',
    customTheme: { canvas: '#112', surface: '#223', ink: '#EEE', accent: '#4a8' },
  }));
  assert.deepEqual(wrapped, {
    canvas: '#111122',
    surface: '#222233',
    ink: '#eeeeee',
    accent: '#44aa88',
  });

  assert.throws(() => parseCustomThemeJson('{bad'), /JSON 格式无效/);
  assert.throws(() => parseCustomThemeJson('[]'), /对象/);
  assert.throws(() => parseCustomThemeJson('{"canvas":"#111111"}'), /缺少或无效的颜色字段/);
  assert.throws(() => parseCustomThemeJson(JSON.stringify({ ...DEFAULT_CUSTOM_THEME, extra: '#000000' })), /不支持的颜色字段/);
  assert.throws(() => parseCustomThemeJson(JSON.stringify({ ...DEFAULT_CUSTOM_THEME, ink: 'blue' })), /十六进制/);
});

test('derived custom theme tokens adapt light/dark scheme, accent ink contrast, CSS vars, and export palette', () => {
  assert.equal(customThemeCssVariables('sage'), undefined);
  assert.equal(customThemeCssVariables('paper'), undefined);
  assert.equal(customThemeCssVariables('night'), undefined);

  const lightTokens = deriveCustomThemeTokens({
    canvas: '#f8f5ef',
    surface: '#ffffff',
    ink: '#1f2933',
    accent: '#f5d042',
  });
  assert.equal(lightTokens.colorScheme, 'light');
  assert.equal(lightTokens.accentInk, '#17221b');

  const darkCustom = { canvas: '#141820', surface: '#1c222d', ink: '#e7ecf4', accent: '#2f5d8c' };
  const darkTokens = resolveThemeTokens('custom', darkCustom);
  assert.equal(darkTokens.colorScheme, 'dark');
  assert.equal(darkTokens.accentInk, '#ffffff');
  assert.equal(deriveCustomThemeTokens({ ...darkCustom, accent: '#5e81ac' }).accentInk, '#17221b');
  assert.ok(contrastRatio(darkCustom.ink, darkCustom.surface) > 10);

  const vars = customThemeCssVariables('custom', darkCustom)!;
  assert.equal(vars.colorScheme, 'dark');
  assert.equal(vars['--ps-canvas'], '#141820');
  assert.equal(vars['--ps-surface'], '#1c222d');
  assert.equal(vars['--ps-ink'], '#e7ecf4');
  assert.equal(vars['--ps-accent'], '#2f5d8c');
  assert.equal(vars['--ps-border'], vars['--ps-line']);
  for (const [key, value] of Object.entries(vars)) {
    if (key === 'colorScheme') continue;
    assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/, `${key} should be valid hex`);
  }

  const palette = exportPaletteForTheme('custom', darkCustom);
  assert.equal(palette.background, '#141820');
  assert.equal(palette.cardBackground, '#1c222d');
  assert.equal(palette.foreground, '#e7ecf4');
  assert.match(palette.edgeColor, /^#[0-9a-f]{6}$/);
  assert.match(palette.cardBorder, /^#[0-9a-f]{6}$/);
  assert.match(palette.surfaceAlt, /^#[0-9a-f]{6}$/);

  const sagePalette = exportPaletteForTheme('sage');
  assert.equal(sagePalette.background, BUILTIN_THEME_COLORS.sage.canvas);
  assert.equal(sagePalette.cardBackground, BUILTIN_THEME_COLORS.sage.surface);
});
