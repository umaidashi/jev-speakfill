const msg = document.getElementById('msg')!
document.getElementById('grant')!.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    msg.textContent = '許可されました。このタブを閉じて side panel の 🎤 開始 を押してください。'
  } catch (e) {
    msg.textContent = `許可されませんでした: ${(e as Error).name}。アドレスバー左のアイコンからマイクを「許可」にしてから再度押してください。`
  }
}

export {}
