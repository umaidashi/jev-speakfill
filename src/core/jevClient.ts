import type { JevResponse, Question } from './types'

export async function callJev(
  apiKey: string, state: unknown, questions: Record<string, Question>, fetchImpl: typeof fetch = fetch, model = 'jev-latest',
): Promise<JevResponse> {
  if (!apiKey) throw new Error('API キー未設定')
  const res = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw Object.assign(new Error(`jev ${res.status}${detail ? `: ${detail}` : ''}`), { status: res.status })
  }
  const json = (await res.json()) as JevResponse
  return { answers: json.answers, usage: json.usage, model: json.model }
}
