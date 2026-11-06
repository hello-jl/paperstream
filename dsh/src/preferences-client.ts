export type PaperstreamTheme = 'sage' | 'paper' | 'night'

async function requestTheme(method: 'GET' | 'PUT', theme?: PaperstreamTheme): Promise<PaperstreamTheme> {
  const response = await fetch(new URL('paperstream/preferences', document.baseURI), {
    method, credentials: 'same-origin', cache: 'no-store',
    ...(theme === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme }) }),
  })
  if (!response.ok) throw new Error(`DSH theme preferences unavailable (${response.status})`)
  const result = await response.json()
  if (!['sage', 'paper', 'night'].includes(result?.theme)) throw new Error('DSH returned an unsupported theme')
  return result.theme
}

export function loadTheme(): Promise<PaperstreamTheme> { return requestTheme('GET') }
export async function saveTheme(theme: PaperstreamTheme): Promise<void> { await requestTheme('PUT', theme) }

export async function openExternal(url: string): Promise<void> {
  const response = await fetch(new URL('paperstream/open-url', document.baseURI), {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(`系统默认浏览器未打开（${response.status}），可改用普通原文链接。`)
  const result = await response.json()
  if (result?.opened !== true) throw new Error('宿主尚未确认打开系统浏览器，可改用普通原文链接。')
}
