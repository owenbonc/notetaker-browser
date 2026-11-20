window.exportMarkdown = function exportMarkdown(conversation) {
  const c = conversation || {};
  const title = c.title || 'Untitled conversation';
  const date = (c.createdAt || new Date().toISOString()).slice(0, 10);
  const sites = (c.sites || []).join(', ');
  const lines = [`# ${title}`, sites ? `${date} · ${sites}` : date, ''];
  if (Array.isArray(c.summary) && c.summary.length) {
    lines.push('## Summary', ...c.summary.map((s) => `- ${s}`), '');
  }
  lines.push('## Conversation');
  for (const m of c.messages || []) {
    if (m.type === 'screenshot') {
      lines.push(`**Screenshot:** [${m.title || m.url || 'page'}](${m.url || ''})`, `![screenshot](${m.dataUrl})`, '');
    } else if (m.type === 'text') {
      lines.push(`**${m.role === 'assistant' ? 'Tutor' : 'You'}:** ${m.text}`, '');
    }
  }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${date}-${slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
