import { callJev } from '../../src/hosts/ext/jevClient'

const q = { c0: { type: 'choice' as const, instructions: 'x', criteria: { a: 'A', none: 'n' } } }

test('POST /v1/systemone に Bearer と model=jev-latest で送り answers を返す', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured = { url, init }
    return new Response(JSON.stringify({ model: 'jev-latest', answers: { c0: { type: 'choice', choice: 'a', probabilities: { a: 1 }, confidence: 1 } }, usage: { input_tokens: 318, output_tokens: 34 } }), { status: 200 })
  }) as unknown as typeof fetch
  const { answers, usage } = await callJev('KEY', { s: 1 }, q, fetchImpl)
  expect(captured!.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer KEY')
  expect(JSON.parse(captured!.init.body as string).model).toBe('jev-latest')
  expect(answers.c0.choice).toBe('a')
  expect(usage).toEqual({ input_tokens: 318, output_tokens: 34 })
})

test('非 2xx は Error(jev <status>) を throw（Review Focus 4）', async () => {
  const fetchImpl = (async () => new Response('nope', { status: 429 })) as unknown as typeof fetch
  await expect(callJev('KEY', {}, q, fetchImpl)).rejects.toThrow('jev 429')
})

test('キーが空なら fetch せずに throw', async () => {
  let called = false
  const fetchImpl = (async () => { called = true; return new Response('{}') }) as unknown as typeof fetch
  await expect(callJev('', {}, q, fetchImpl)).rejects.toThrow('API キー未設定')
  expect(called).toBe(false)
})
