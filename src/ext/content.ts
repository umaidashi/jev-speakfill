import { applyPlacement, collectFields, restore } from '../dom'

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'collect') reply(collectFields(document, msg.opts ?? {}))
  else if (msg.type === 'apply') reply(applyPlacement(msg.placement))
  else if (msg.type === 'restore') { restore(msg.fieldId, msg.prev); reply(true) }
  return false
})
