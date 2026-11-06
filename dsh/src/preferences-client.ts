import type { AppearancePreferences } from '../../web/src/appearance-preferences'
export type PaperstreamTheme = AppearancePreferences['theme']

async function requestPreferences(method: 'GET' | 'PUT', preferences?: Partial<AppearancePreferences>): Promise<AppearancePreferences> {
  const response = await fetch(new URL('paperstream/preferences', document.baseURI), {
    method, credentials: 'same-origin', cache: 'no-store',
    ...(preferences === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferences) }),
  })
  if (!response.ok) throw new Error(`DSH appearance preferences unavailable (${response.status})`)
  const result = await response.json()
  if (!['sage', 'paper', 'night'].includes(result?.theme)) throw new Error('DSH returned an unsupported theme')
  // A pre-settings host may still return only its theme.
  const connectionStyle = result.connectionStyle ?? 'rounded'
  if (!['orthogonal', 'rounded', 'curved'].includes(connectionStyle)) throw new Error('DSH returned an unsupported connection style')
  return { theme: result.theme, connectionStyle }
}

export function loadPreferences(): Promise<AppearancePreferences> { return requestPreferences('GET') }
export async function savePreferences(preferences: AppearancePreferences): Promise<void> { await requestPreferences('PUT', preferences) }
export async function loadTheme(): Promise<PaperstreamTheme> { return (await loadPreferences()).theme }
export async function saveTheme(theme: PaperstreamTheme): Promise<void> { await requestPreferences('PUT', { theme }) }

export async function openExternal(url: string): Promise<void> {
  const response = await fetch(new URL('paperstream/open-url', document.baseURI), {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(`系统默认浏览器未打开（${response.status}），可改用普通原文链接。`)
  const result = await response.json()
  if (result?.opened !== true) throw new Error('宿主尚未确认打开系统浏览器，可改用普通原文链接。')
}
