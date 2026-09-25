const key = document.getElementById('key') as HTMLInputElement
const server = document.getElementById('server') as HTMLInputElement
const msg = document.getElementById('msg')!
chrome.storage.local.get(['typesafeApiKey', 'serverUrl']).then(({ typesafeApiKey, serverUrl }) => {
  if (typesafeApiKey) key.value = typesafeApiKey
  if (serverUrl) server.value = serverUrl
})
document.getElementById('save')!.onclick = async () => {
  await chrome.storage.local.set({ typesafeApiKey: key.value.trim(), serverUrl: server.value.trim().replace(/\/$/, '') })
  msg.textContent = '保存しました'
}

export {}
