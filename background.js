chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

const ports = new Map();   // windowId -> panel port
const pending = new Map(); // windowId -> queued messages

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  let windowId = null;
  port.onMessage.addListener((msg) => {
    if (msg && typeof msg.windowId === 'number' && windowId === null) {
      windowId = msg.windowId;
      ports.set(windowId, port);
      const queue = pending.get(windowId) || [];
      pending.delete(windowId);
      queue.forEach((m) => port.postMessage(m));
    }
  });
  port.onDisconnect.addListener(() => {
    if (windowId !== null && ports.get(windowId) === port) ports.delete(windowId);
  });
});

function send(windowId, msg) {
  const port = ports.get(windowId);
  if (port) {
    try { port.postMessage(msg); return; } catch (e) { ports.delete(windowId); }
  }
  if (!pending.has(windowId)) pending.set(windowId, []);
  pending.get(windowId).push(msg);
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'take-note' || !tab) return;
  const windowId = tab.windowId;
  let newConversation = false;
  if (!ports.has(windowId)) {
    newConversation = true;
    // Must run synchronously inside the user gesture, before any await.
    try { chrome.sidePanel.open({ windowId }).catch((e) => console.warn('sidePanel.open failed', e)); }
    catch (e) { console.warn('sidePanel.open failed', e); }
  }
  capture(tab, newConversation).catch((e) => console.warn('Notetaker capture failed (restricted page?)', e));
});

async function capture(tab, newConversation) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  const rect = injection && injection.result;
  if (!rect) return;
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  // Scale from the real capture size; falls back to devicePixelRatio.
  const scale = rect.innerWidth ? bitmap.width / rect.innerWidth : rect.devicePixelRatio || 1;
  const sx = Math.round(rect.x * scale), sy = Math.round(rect.y * scale);
  const sw = Math.max(1, Math.min(Math.round(rect.width * scale), bitmap.width - sx));
  const sh = Math.max(1, Math.min(Math.round(rect.height * scale), bitmap.height - sy));
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  send(tab.windowId, { type: 'screenshot', dataUrl, url: tab.url, title: tab.title, newConversation });
}
