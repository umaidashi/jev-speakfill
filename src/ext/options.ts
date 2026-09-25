import { JA_COMMERCE } from '../core/presets'

const key = document.getElementById('key') as HTMLInputElement
const server = document.getElementById('server') as HTMLInputElement
const config = document.getElementById('config') as HTMLTextAreaElement
const msg = document.getElementById('msg')!
chrome.storage.local.get(['typesafeApiKey', 'serverUrl', 'speakfillConfig']).then(({ typesafeApiKey, serverUrl, speakfillConfig }) => {
  if (typesafeApiKey) key.value = typesafeApiKey
  if (serverUrl) server.value = serverUrl
  if (speakfillConfig) config.value = JSON.stringify(speakfillConfig, null, 2)
})
document.getElementById('preset')!.onclick = () => { config.value = JSON.stringify(JA_COMMERCE, null, 2) }
document.getElementById('save')!.onclick = async () => {
  let speakfillConfig: unknown = null
  if (config.value.trim()) {
    try { speakfillConfig = JSON.parse(config.value) } catch (e) { msg.textContent = `設定 JSON が不正: ${(e as Error).message}`; return }
  }
  await chrome.storage.local.set({ typesafeApiKey: key.value.trim(), serverUrl: server.value.trim().replace(/\/$/, ''), speakfillConfig })
  msg.textContent = '保存しました'
}

export {}
