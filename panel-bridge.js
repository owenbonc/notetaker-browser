(() => {
  const ready = new Promise((r) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  let port = null, windowId = null;
  const report = () => port && windowId !== null && port.postMessage({ windowId, visible: document.visibilityState === 'visible' });
  document.addEventListener('visibilitychange', report);
  function connect() {
    port = chrome.runtime.connect({ name: 'panel' });
    chrome.windows.getCurrent().then((w) => { windowId = w.id; report(); }).catch(console.warn);
    port.onMessage.addListener(async (msg) => {
      if (!msg) return;
      await ready;
      if (msg.type === 'error') return typeof window.toast === 'function' ? window.toast(msg.message) : console.warn(msg.message);
      if (msg.type === 'new') return typeof window.onNewConversation === 'function' && window.onNewConversation();
      if (msg.type !== 'screenshot') return;
      if (typeof window.onScreenshot === 'function') window.onScreenshot(msg);
      else console.log('screenshot (no onScreenshot handler)', msg);
    });
    port.onDisconnect.addListener(() => setTimeout(connect, 100));
  }
  connect();
})();
