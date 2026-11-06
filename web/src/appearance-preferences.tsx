import { createContext, useContext } from 'react';

export interface AppearancePreferences {
  theme: 'sage' | 'paper' | 'night';
  connectionStyle: 'orthogonal' | 'rounded' | 'curved';
}
export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = { theme: 'sage', connectionStyle: 'rounded' };
export const AppearancePreferencesContext = createContext<AppearancePreferences>(DEFAULT_APPEARANCE_PREFERENCES);
export function useAppearancePreferences(): AppearancePreferences { return useContext(AppearancePreferencesContext); }

export function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!value || typeof value !== 'object') return false;
  const preferences = value as AppearancePreferences;
  return ['sage', 'paper', 'night'].includes(preferences.theme)
    && ['orthogonal', 'rounded', 'curved'].includes(preferences.connectionStyle);
}
