(() => {
  const ready = new Promise((r) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  function connect() {
    const port = chrome.runtime.connect({ name: 'panel' });
    chrome.windows.getCurrent().then((w) => port.postMessage({ windowId: w.id })).catch(console.warn);
    port.onMessage.addListener(async (msg) => {
      if (!msg || msg.type !== 'screenshot') return;
      await ready;
      if (typeof window.onScreenshot === 'function') window.onScreenshot(msg);
      else console.log('screenshot (no onScreenshot handler)', msg);
    });
    port.onDisconnect.addListener(() => setTimeout(connect, 100));
  }
  connect();
})();
