// DOM の無い環境（Node / SSR）で import しただけで落ちないこと。DOM 参照は関数の中で行う
test('jev-speakfill/dom は Node 環境で import できる', async () => {
  expect(typeof document).toBe('undefined')
  const mod = await import('../../src/hosts/dom')
  expect(typeof mod.collectFields).toBe('function')
})
