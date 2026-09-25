import type { Field } from '../../src/core/types'

test('Field は id/label/kind を持つ', () => {
  const f: Field = { id: 'f1', label: '氏名', kind: 'text' }
  expect(f.kind).toBe('text')
})
