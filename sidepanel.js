const SYSTEM_PROMPT = 'You are a patient tutor helping someone understand things they find while browsing. The user sends screenshots of diagrams, passages, objects or anything else on a web page, each with the page\'s title and URL. Use the URL and title as context. Explain clearly and simply, build on earlier screenshots in the conversation when they relate, and end with one short question offering an example or a deeper explanation.';
const SUMMARY_PROMPT = 'Summarize this conversation for my notes. Reply with exactly: a title of at most 8 words on the first line, then 3 bullet points of the key things I learned.';
const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 1c.6 5.6 4.4 9.4 11 11-6.6 1.6-10.4 5.4-11 11-.6-5.6-4.4-9.4-11-11 6.6-1.6 10.4-5.4 11-11z"/></svg>';
const USER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor"/></svg>';
const $ = (id) => document.getElementById(id);

let conversations = [];
let activeId = null;
let busy = false;
const sessions = new Map();

const active = () => conversations.find((c) => c.id === activeId) || null;
const now = () => new Date().toISOString();
const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

async function save() {
  await loaded; // never overwrite stored conversations before they are read
  await chrome.storage.local.set({ conversations, activeId });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// Minimal markdown: bold, italics, bullets, paragraphs.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g, '$1<i>$2</i>');
  let html = '', list = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (line) html += `<p>${inline(line.replace(/^#+\s*/, ''))}</p>`;
  }
  return html + (list ? '</ul>' : '');
}

function firstPreview(c) {
  const t = c.messages.find((m) => m.type === 'text' && m.role === 'user');
  const s = c.messages.find((m) => m.type === 'screenshot');
  return c.title || (t && t.text.slice(0, 60)) || (s && s.title) || 'New conversation';
}

// ---------- Rendering ----------
function msgEl(m) {
  const row = document.createElement('div');
  row.className = `row ${m.role === 'user' ? 'user' : 'ai'}`;
  let inner;
  if (m.type === 'screenshot') inner = `<img src="${m.dataUrl}" alt=""><div class="site">${esc(m.title || '')} · ${esc(host(m.url))}</div>`;
  else if (m.role === 'user') inner = esc(m.text).replace(/\n/g, '<br>');
  else inner = md(m.text);
  const bubble = `<div class="bubble${m.error ? ' err' : ''}">${inner}</div><div class="time">${fmtTime(m.at)}</div>`;
  row.innerHTML = m.role === 'user'
    ? `<div class="col">${bubble}</div><div class="av user">${USER}</div>`
    : `<div class="av ai">${SPARK}</div><div class="col">${bubble}</div>`;
  return row;
}

function renderChat() {
  const c = active();
  const thread = $('thread');
  thread.innerHTML = '';
  $('convTitle').textContent = c ? firstPreview(c) : 'New conversation';
  if (!c || !c.messages.length) {
    thread.innerHTML = `<div class="emptystate"><svg class="spark" viewBox="0 0 24 24"><path fill="#8b7cff" d="M12 1c.6 5.6 4.4 9.4 11 11-6.6 1.6-10.4 5.4-11 11-.6-5.6-4.4-9.4-11-11 6.6-1.6 10.4-5.4 11-11z"/></svg><div>Press <b>Alt+Shift+S</b> and drag over anything on the page to start.</div></div>`;
  } else {
    c.messages.forEach((m) => thread.appendChild(msgEl(m)));
    if (c.messages.at(-1).type === 'screenshot') addHint();
  }
  $('banner').classList.add('hidden');
  const s = c && sessions.get(c.id);
  if (s) checkQuota(s);
  renderOngoing();
  scrollDown();
}

function addHint() {
  const h = document.createElement('div');
  h.className = 'hint';
  h.textContent = 'Ask anything about this screenshot';
  $('thread').appendChild(h);
}

const scrollDown = () => { const t = $('thread'); t.scrollTop = t.scrollHeight; };

function renderOngoing() {
  const list = conversations.filter((c) => c.status === 'ongoing' && c.messages.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('ongoingBtn').textContent = `Ongoing (${list.length}) ▾`;
  const d = $('ongoingList');
  d.innerHTML = list.length ? '' : '<div class="empty">No ongoing conversations</div>';
  for (const c of list) {
    const shot = c.messages.find((m) => m.type === 'screenshot');
    const b = document.createElement('button');
    b.className = 'item' + (c.id === activeId ? ' on' : '');
    b.innerHTML = `${shot ? `<img src="${shot.dataUrl}" alt="">` : ''}<div style="min-width:0"><div class="t">${esc(firstPreview(c))}</div><div class="s">${esc(c.sites.join(', '))}</div></div>`;
    b.onclick = () => { activeId = c.id; d.classList.add('hidden'); save(); renderChat(); };
    d.appendChild(b);
  }
}

function renderDb() {
  const q = $('search').value.trim().toLowerCase();
  const closed = conversations.filter((c) => c.status === 'closed').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  $('count').textContent = closed.length;
  const shown = closed.filter((c) => !q || [c.title, (c.summary || []).join(' '), c.sites.join(' ')].join(' ').toLowerCase().includes(q));
  const cards = $('cards');
  cards.innerHTML = shown.length ? '' : `<div class="dbempty">${closed.length ? 'No notes match your search.' : 'No saved notes yet. Click Save on a conversation.'}</div>`;
  for (const c of shown) {
    const shot = c.messages.find((m) => m.type === 'screenshot');
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `${shot ? `<img class="thumb" src="${shot.dataUrl}" alt="">` : '<div class="thumb"></div>'}
      <div class="body"><h3>${esc(c.title || 'Untitled')}</h3>
      <div class="sum">${esc((c.summary || []).join(' '))}</div>
      <div class="meta"><span>${esc(c.sites.join(', '))}</span><span>${fmtDate(c.closedAt || c.updatedAt)}</span></div></div>
      <button class="more" title="More">•••</button>
      <div class="menu hidden"><button data-a="reopen">Reopen</button><button data-a="export">Export .md</button></div>`;
    const menu = el.querySelector('.menu');
    el.querySelector('.more').onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.menu').forEach((m) => m !== menu && m.classList.add('hidden')); menu.classList.toggle('hidden'); };
    menu.onclick = (e) => {
      const a = e.target.dataset.a;
      menu.classList.add('hidden');
      if (a === 'reopen') { c.status = 'ongoing'; c.updatedAt = now(); activeId = c.id; save(); showTab('chat'); }
      if (a === 'export') window.exportMarkdown ? window.exportMarkdown(c) : console.log('exportMarkdown missing', c);
    };
    cards.appendChild(el);
  }
}

function showTab(tab) {
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('chat').classList.toggle('hidden', tab !== 'chat');
  $('db').classList.toggle('hidden', tab !== 'db');
  tab === 'chat' ? renderChat() : renderDb();
}

// ---------- Gemini Nano ----------
const MODEL_OPTS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

async function getSession(c) {
  if (sessions.has(c.id)) return sessions.get(c.id);
  if (typeof LanguageModel === 'undefined') throw new Error('Gemini Nano is not available in this browser. Enable the Prompt API flags in chrome://flags and restart Chrome.');
  const avail = await LanguageModel.availability(MODEL_OPTS);
  if (avail !== 'available') throw new Error(`Gemini Nano is not ready (status: ${avail}). Check chrome://on-device-internals.`);
  // Replay: keep only the last 2 screenshots as images, older ones become text lines.
  const shotIdx = c.messages.map((m, i) => (m.type === 'screenshot' ? i : -1)).filter((i) => i >= 0).slice(-2);
  const initialPrompts = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const [i, m] of c.messages.entries()) {
    if (m.error) continue;
    if (m.type === 'screenshot') {
      const line = { type: 'text', value: `Screenshot from ${m.title} (${m.url})` };
      initialPrompts.push({ role: 'user', content: shotIdx.includes(i) ? [line, { type: 'image', value: await (await fetch(m.dataUrl)).blob() }] : [line] });
    } else initialPrompts.push({ role: m.role, content: m.text });
  }
  const session = await LanguageModel.create({ ...MODEL_OPTS, initialPrompts });
  sessions.set(c.id, session);
  return session;
}

function checkQuota(s) {
  const full = s.inputQuota && s.inputUsage / s.inputQuota > 0.85;
  $('banner').classList.toggle('hidden', !full);
}

function addError(c, err) {
  const m = { role: 'assistant', type: 'text', text: err.message || String(err), at: now(), error: true };
  $('thread').appendChild(msgEl(m));
  scrollDown();
}

// ---------- Actions ----------
function newConversation() {
  const c = { id: crypto.randomUUID(), status: 'ongoing', createdAt: now(), updatedAt: now(), closedAt: null, title: null, summary: null, sites: [], messages: [] };
  conversations.push(c);
  activeId = c.id;
  return c;
}

window.onScreenshot = async ({ dataUrl, url, title, newConversation: fresh }) => {
  showTab('chat');
  let c = active();
  if (fresh || !c || !c.messages.length || c.status !== 'ongoing') {
    if (c && !c.messages.length) conversations = conversations.filter((x) => x !== c);
    c = newConversation();
  }
  const m = { role: 'user', type: 'screenshot', dataUrl, url, title, at: now() };
  c.messages.push(m);
  c.updatedAt = m.at;
  const h = host(url);
  if (h && !c.sites.includes(h)) c.sites.push(h);
  await save();
  renderChat();
  const hadSession = sessions.has(c.id);
  try {
    const s = await getSession(c); // a fresh session already replays this screenshot
    if (hadSession) {
      await s.append([{ role: 'user', content: [{ type: 'text', value: `Screenshot from ${title} (${url})` }, { type: 'image', value: await (await fetch(dataUrl)).blob() }] }]);
    }
    checkQuota(s);
  } catch (e) { addError(c, e); }
};

async function send() {
  const text = $('input').value.trim();
  if (!text || busy) return;
  let c = active();
  if (!c || c.status !== 'ongoing') c = newConversation();
  $('input').value = '';
  autosize();
  const um = { role: 'user', type: 'text', text, at: now() };
  c.messages.push(um);
  c.updatedAt = um.at;
  await save();
  renderChat();
  busy = true;
  $('sendBtn').disabled = true;
  try {
    const s = await getSession(c);
    const am = { role: 'assistant', type: 'text', text: '', at: now() };
    const row = msgEl(am);
    const bubble = row.querySelector('.bubble');
    bubble.classList.add('typing');
    $('thread').appendChild(row);
    scrollDown();
    for await (const chunk of s.promptStreaming(text)) {
      am.text = chunk.startsWith(am.text) ? chunk : am.text + chunk;
      bubble.innerHTML = md(am.text);
      scrollDown();
    }
    bubble.classList.remove('typing');
    c.messages.push(am);
    c.updatedAt = now();
    await save();
    checkQuota(s);
  } catch (e) {
    $('thread').querySelector('.typing')?.closest('.row')?.remove();
    addError(c, e);
  } finally {
    busy = false;
    $('sendBtn').disabled = false;
  }
}

async function closeAndSave() {
  const c = active();
  if (!c || !c.messages.length) return toast('Nothing to save yet');
  if (busy) return;
  busy = true;
  const btn = $('saveBtn');
  btn.disabled = true;
  const label = btn.lastChild.textContent;
  btn.lastChild.textContent = 'Saving…';
  try {
    const s = await getSession(c);
    let out = '';
    for await (const chunk of s.promptStreaming(SUMMARY_PROMPT)) out = chunk.startsWith(out) ? chunk : out + chunk;
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || 'Untitled').replace(/^#+\s*|^\*\*|\*\*$|^title:\s*/gi, '').replace(/\*\*/g, '').trim();
    const bullets = lines.slice(1).filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, '').replace(/\*\*/g, '')).slice(0, 3);
    c.title = title;
    c.summary = bullets.length ? bullets : lines.slice(1, 4);
  } catch (e) {
    // Still save so nothing is lost; summary falls back to the first question.
    c.title = c.title || firstPreview(c);
    c.summary = c.summary || [];
    console.warn('Summary failed', e);
  }
  c.status = 'closed';
  c.closedAt = now();
  c.updatedAt = c.closedAt;
  sessions.delete(c.id);
  activeId = null;
  await save();
  busy = false;
  btn.disabled = false;
  btn.lastChild.textContent = label;
  renderChat();
  toast('Saved to Database');
}

function autosize() {
  const t = $('input');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
}

// ---------- Wiring ----------
document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$('newBtn').onclick = () => { activeId = null; save(); showTab('chat'); };
$('sendBtn').onclick = send;
$('saveBtn').onclick = closeAndSave;
$('input').addEventListener('input', autosize);
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
$('ongoingBtn').onclick = (e) => { e.stopPropagation(); renderOngoing(); $('ongoingList').classList.toggle('hidden'); };
$('search').addEventListener('input', renderDb);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ongoingList')) $('ongoingList').classList.add('hidden');
  if (!e.target.closest('.card')) document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
});

const loaded = chrome.storage.local.get(['conversations', 'activeId']).then((r) => {
  // Keep anything onScreenshot created before storage loaded.
  conversations = [...(r.conversations || []), ...conversations];
  activeId = activeId || r.activeId || null;
  if (active()?.status !== 'ongoing') activeId = null;
  renderChat();
});
renderChat();
