const key = document.getElementById('key') as HTMLInputElement
const msg = document.getElementById('msg')!
chrome.storage.local.get('typesafeApiKey').then(({ typesafeApiKey }) => { if (typesafeApiKey) key.value = typesafeApiKey })
document.getElementById('save')!.onclick = async () => {
  await chrome.storage.local.set({ typesafeApiKey: key.value.trim() })
  msg.textContent = '保存しました'
}

export {}
