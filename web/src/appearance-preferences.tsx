import { createContext, useContext } from 'react';
import type {
  AppearancePreferences,
  BuiltinTheme,
  ConnectionStylePreference,
  CustomThemeColorKey,
  CustomThemeColors,
  PaperstreamTheme,
  ThemeExportPalette,
  ThemeTokens,
} from './theme.ts';
import {
  BUILTIN_THEMES,
  BUILTIN_THEME_COLORS,
  CONNECTION_STYLES,
  CUSTOM_THEME_KEYS,
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_CUSTOM_THEME,
  SUPPORTED_THEMES,
  contrastRatio,
  customThemeCssVariables,
  deriveCustomThemeTokens,
  exportPaletteForTheme,
  isAppearancePreferences,
  isCustomThemeColors,
  normalizeCustomThemeColors,
  parseCustomThemeJson,
  parseHexInput,
  resolveCustomTheme,
  resolveThemeTokens,
  serializeCustomThemeJson,
} from './theme.ts';

export type {
  AppearancePreferences,
  BuiltinTheme,
  ConnectionStylePreference,
  CustomThemeColorKey,
  CustomThemeColors,
  PaperstreamTheme,
  ThemeExportPalette,
  ThemeTokens,
};

export {
  BUILTIN_THEMES,
  BUILTIN_THEME_COLORS,
  CONNECTION_STYLES,
  CUSTOM_THEME_KEYS,
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_CUSTOM_THEME,
  SUPPORTED_THEMES,
  contrastRatio,
  customThemeCssVariables,
  deriveCustomThemeTokens,
  exportPaletteForTheme,
  isAppearancePreferences,
  isCustomThemeColors,
  normalizeCustomThemeColors,
  parseCustomThemeJson,
  parseHexInput,
  resolveCustomTheme,
  resolveThemeTokens,
  serializeCustomThemeJson,
};

export const AppearancePreferencesContext = createContext<AppearancePreferences>(DEFAULT_APPEARANCE_PREFERENCES);
export function useAppearancePreferences(): AppearancePreferences { return useContext(AppearancePreferencesContext); }
