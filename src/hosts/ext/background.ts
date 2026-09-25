import { callJev } from '../../core/jevClient'

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'ask') return false
  chrome.storage.local.get('typesafeApiKey').then(async ({ typesafeApiKey }) => {
    try {
      reply({ ok: true, response: await callJev(typesafeApiKey ?? '', msg.state, msg.questions) })
    } catch (e) {
      reply({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
  return true
})
