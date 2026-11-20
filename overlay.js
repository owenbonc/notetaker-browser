(() => new Promise((resolve) => {
  const old = document.getElementById('__notetaker_overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = '__notetaker_overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.35);user-select:none;';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;display:none;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none;box-sizing:border-box;';
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);

  let start = null, rect = null;
  const finish = (result) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    // Two frames so the dim layer is gone before the tab is captured.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    rect = { x: start.x, y: start.y, width: 0, height: 0 };
    overlay.style.background = 'transparent';
    box.style.display = 'block';
    Object.assign(box.style, { left: rect.x + 'px', top: rect.y + 'px', width: '0px', height: '0px' });
  });
  overlay.addEventListener('mousemove', (e) => {
    if (!start) return;
    rect = {
      x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y),
    };
    Object.assign(box.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  });
  overlay.addEventListener('mouseup', () => {
    if (!start || !rect || rect.width < 5 || rect.height < 5) return finish(null);
    finish({ ...rect, devicePixelRatio: window.devicePixelRatio, innerWidth: window.innerWidth });
  });
}))();
