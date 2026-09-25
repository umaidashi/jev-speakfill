const toHalf = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

// ponytail: 電話と郵便番号だけ。日付は Web Speech が「9月25日」で返すので今は触らない
export function normalize(text: string, label: string): string {
  const digits = toHalf(text).replace(/[^\d]/g, '')
  if (/郵便|〒/.test(label) && digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (/電話|TEL|tel|携帯|FAX/.test(label) && digits.length >= 10) {
    return digits.length === 11
      ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
      : `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return text
}
