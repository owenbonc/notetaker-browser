// Local bridge that lets the extension run on your Claude subscription through Claude Code (`claude -p`).
// Run: node server.mjs   (Node 18+, no dependencies)
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const env = { ...process.env };
const envFile = path.join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const PORT = Number(env.PORT || 8788);
const MODEL = env.CLAUDE_MODEL || 'sonnet';
const TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN || '';

const isExec = (f) => { try { accessSync(f, constants.X_OK); return true; } catch { return false; } };
const BIN = [env.CLAUDE_CODE_BIN, ...(env.PATH || '').split(path.delimiter).map((d) => path.join(d, 'claude')), path.join(env.HOME || '', '.local/bin/claude')]
  .filter(Boolean).find(isExec) || null;

function childEnv(configDir) {
  // Only these reach the CLI, so an ANTHROPIC_API_KEY or other provider setting can't move the bill off the plan.
  const kept = { PATH: env.PATH, HOME: env.HOME, LANG: env.LANG, TMPDIR: env.TMPDIR, USER: env.USER };
  // With a setup-token, use an empty config dir; without one, use your existing Claude Code login.
  if (TOKEN) Object.assign(kept, { CLAUDE_CODE_OAUTH_TOKEN: TOKEN, CLAUDE_CONFIG_DIR: configDir });
  return Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined));
}

// Streams Claude's answer as plain text deltas.
function chat(res, { system, content }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'notetaker-claude-'));
  const cwd = path.join(dir, 'work');
  const configDir = path.join(dir, 'config');
  mkdirSync(cwd); mkdirSync(configDir);
  const child = spawn(BIN, [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', MODEL, '--system-prompt', system || '', '--tools', '', '--permission-mode', 'dontAsk',
    '--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--no-chrome',
  ], { cwd, env: childEnv(configDir), stdio: ['pipe', 'pipe', 'pipe'], timeout: 5 * 60_000 });

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  let buf = '', stderr = '', streamed = false, finished = false;
  const done = (tail = '') => { if (finished) return; finished = true; res.end(tail); rmSync(dir, { recursive: true, force: true }); };
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let line; try { line = JSON.parse(raw); } catch { continue; }
      const d = line.type === 'stream_event' && line.event?.type === 'content_block_delta' && line.event.delta?.type === 'text_delta' && line.event.delta.text;
      if (d) { streamed = true; res.write(d); }
      if (line.type === 'result') {
        if (line.is_error) done(`\n\n⚠️ Claude Code: ${line.result || (line.errors || []).join('; ') || line.subtype}`);
        else done(streamed ? '' : line.result || '');
      }
    }
  });
  child.stderr.setEncoding('utf8').on('data', (c) => { stderr += c; });
  child.on('error', (e) => done(`⚠️ Couldn't run Claude Code at ${BIN}: ${e.message}`));
  child.on('close', (code) => done(code ? `\n\n⚠️ Claude Code exited (${code}): ${stderr.trim().slice(-300)}` : ''));
  res.on('close', () => { if (!finished) child.kill(); });
  child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' }) + '\n');
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ready: !!BIN, model: MODEL, auth: TOKEN ? 'setup-token' : 'claude-login' }));
  }
  // Only the extension may spend your plan: web pages can reach localhost too, but their Origin is never chrome-extension://.
  if (req.method !== 'POST' || req.url !== '/chat' || !String(req.headers.origin || '').startsWith('chrome-extension://')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!BIN) { res.writeHead(500); return res.end('⚠️ Claude Code is not installed. Install it, or set CLAUDE_CODE_BIN in .env to the output of `which claude`.'); }
  let body = '', size = 0;
  req.setEncoding('utf8').on('data', (c) => { size += c.length; if (size > 40e6) req.destroy(); else body += c; });
  req.on('end', () => {
    let payload; try { payload = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
    if (!Array.isArray(payload.content)) { res.writeHead(400); return res.end('content must be an array'); }
    chat(res, payload);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Notetaker Claude bridge on http://127.0.0.1:${PORT}  model=${MODEL}  auth=${TOKEN ? 'setup-token' : 'your Claude Code login'}  claude=${BIN || 'NOT FOUND'}`);
});
