# Notetaker Browser

**Screenshot anything in your browser, ask an on-device AI tutor about it, and keep every conversation as a searchable note.**

A Chrome extension with a side panel. Press a shortcut, drag a box over a diagram, passage or object on any page, and ask questions about it. Gemini Nano, the model built into Chrome, answers with the page's URL as context. Nothing leaves the laptop. Each conversation is saved to a notes table with an executive summary and can be exported as Markdown.

Built in 45 minutes. This README is the spec: the demo script below is the acceptance criteria.

## Demo script (~90 seconds)

1. Open a Wikipedia page with a diagram (for example the Krebs cycle).
2. Press `Alt+Shift+S`, the page dims, drag a box over the diagram.
3. The screenshot appears in the side panel's **Chat** tab. Ask "Explain this like I'm 15", and the answer streams in.
4. Switch to a second site, screenshot a related passage, and ask "How does this connect to the diagram?" The same conversation continues across both sites.
5. Open the **Notes** tab. A new row shows the thumbnail, title, sites and a 3-bullet summary.
6. Expand the row to see the full conversation, then click **Export .md** and open the file.
7. **Wow moment:** turn off Wi-Fi and do it again. Everything runs on-device.

## Scope

### Core concepts

- **Note = one conversation.** It holds every screenshot and message in it, plus an executive summary.
- **Screenshots join the open conversation**, from any site. Each screenshot keeps its own URL and page title, so the model knows where every image came from.
- **A conversation ends** when the user clicks **+ New note**, opens a past note, or closes the panel. The summary is generated automatically when it ends.
- **Past notes can be resumed.** Opening one from the Notes tab makes it the open conversation again: new questions and screenshots append to it, and the summary is rewritten when you leave it.

### UI: Chrome side panel with two tabs

**Chat tab**
- Shows the open conversation: screenshots (with their site) and messages, newest at the bottom.
- Text input plus **+ New note** button.
- Answers stream token by token.
- Shows a "Conversation is full, start a new note?" banner when the model's context is nearly used up.

**Notes tab**
- Table, newest first. Columns: **Thumbnail · Title · Summary · Sites · Date**.
- Clicking a row expands it to show the full conversation, with **Open** (resume) and **Export .md** buttons.

### Built vs cut

| Built | Cut (see What's next) |
|---|---|
| Shortcut + drag-to-screenshot | Search, filters, sorting, tags |
| Chat with Gemini Nano, streaming | Editing notes |
| Screenshots from multiple sites in one conversation | Bulk export |
| Auto-generated title + 3-bullet summary | Notion-style board or gallery views |
| Notes table with expand and resume | Brave support |
| Export one note as `.md` | Languages other than English |
| Everything saved after each message | Chrome Web Store publishing |

Nothing on the demo path is faked.

## Architecture

Manifest V3, plain HTML/CSS/JS, no build step, loaded unpacked.

```
manifest.json      permissions, side panel, Alt+Shift+S command
background.js      service worker: handles the command, captures and crops the tab
overlay.js         injected into the page: dims it, lets the user drag a box, returns the rectangle
sidepanel.html     the two tabs
sidepanel.js       chat (Gemini Nano), notes table, storage, Markdown export
sidepanel.css      styles
```

### Manifest essentials

- `permissions`: `sidePanel`, `storage`, `unlimitedStorage`, `scripting`, `tabs`, `activeTab`
- `host_permissions`: `<all_urls>` (needed for `captureVisibleTab` and injecting the overlay)
- `side_panel.default_path`: `sidepanel.html`
- `commands`: `take-note` with `suggested_key` `Alt+Shift+S`
- Set `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so the toolbar icon opens the panel.

### Capture flow

1. `chrome.commands.onCommand` (`take-note`) fires in `background.js`.
2. Background injects `overlay.js` into the active tab with `chrome.scripting.executeScript`.
3. The overlay dims the page and lets the user drag a box. On mouseup it removes itself and returns `{x, y, width, height, devicePixelRatio}`. Esc cancels.
4. Background calls `chrome.tabs.captureVisibleTab()`, then crops with `OffscreenCanvas`, **multiplying the rectangle by `devicePixelRatio`**.
5. Background sends `{type: 'screenshot', dataUrl, url, title}` to the side panel with `chrome.runtime.sendMessage`.
6. The side panel appends it to the open conversation (starting a new one if none is open).

### Gemini Nano (Prompt API)

Run the model in `sidepanel.js` (an extension page), not in the service worker.

```js
const session = await LanguageModel.create({
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
});

// A screenshot turn: image plus where it came from
await session.append([{ role: 'user', content: [
  { type: 'text', value: `Screenshot from ${title} (${url})` },
  { type: 'image', value: imageBlob },
]}]);

// A question turn, streamed into the chat
for await (const chunk of session.promptStreaming(question)) render(chunk);
```

**System prompt:**

> You are a patient tutor helping someone understand things they find while browsing. The user sends screenshots of diagrams, passages, objects or anything else on a web page, each with the page's title and URL. Use the URL and title as context. Explain clearly and simply, build on earlier screenshots in the conversation when they relate, and end with one short question offering an example or a deeper explanation.

**Summary prompt** (sent to the same session when a conversation ends):

> Summarize this conversation for my notes. Reply with exactly: a title of at most 8 words on the first line, then 3 bullet points of the key things I learned.

**Context limit:** after each turn compare `session.inputUsage` with `session.inputQuota`. Above 85%, show the "conversation is full" banner.

**Resuming a note:** create a new session with the saved messages as `initialPrompts`, keeping only the last 2 screenshots (older ones become their `"Screenshot from <title> (<url>)"` text line) so it fits in the context window.

### Data model

Stored in `chrome.storage.local` under the key `notes`, as an array, newest first.

```js
{
  id: crypto.randomUUID(),
  createdAt: '2026-11-20T18:52:00Z',
  updatedAt: '2026-11-20T18:58:00Z',
  title: 'How the Krebs cycle makes energy',   // from the summary
  summary: ['…', '…', '…'],                    // 3 bullets
  sites: ['en.wikipedia.org', 'khanacademy.org'],
  messages: [
    { role: 'user', type: 'screenshot', dataUrl: 'data:image/png;…', url: 'https://…', title: 'Citric acid cycle - Wikipedia', at: '…' },
    { role: 'user', type: 'text', text: 'Explain this like I\'m 15', at: '…' },
    { role: 'assistant', type: 'text', text: '…', at: '…' },
  ],
}
```

Save after every message, so a crash loses nothing. The thumbnail is the first screenshot.

### Markdown export

Build the file in the side panel and download it with a `Blob` and an `<a download>` link, named `<date>-<title>.md`:

```md
# How the Krebs cycle makes energy
2026-11-20 · en.wikipedia.org, khanacademy.org

## Summary
- …
- …
- …

## Conversation
**Screenshot:** [Citric acid cycle - Wikipedia](https://…)
![screenshot](data:image/png;base64,…)

**You:** Explain this like I'm 15

**Tutor:** …
```

## Setup (do this before the clock starts)

The model is a multi-GB download. Do not let it happen during the event.

1. Use **Chrome desktop** (not Brave, Android or iOS). Requirements: 22 GB free disk, plus a GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ CPU cores.
2. In `chrome://flags`, enable **Prompt API for Gemini Nano** and **Prompt API for Gemini Nano with Multimodal Input** if they are not already on.
3. Open `chrome://on-device-internals` and confirm the model is downloaded.
4. In DevTools on any page, run `await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] })` until it returns `'available'`.
5. Send it one test image and count how many screenshots fit before `inputUsage` nears `inputQuota`.
6. Run the same check in Brave. If it is not `'available'`, Brave stays cut.

## Timeline (minutes from start)

| By | Done |
|---|---|
| T+2 | This spec agreed |
| T+8 | **Skeleton:** side panel with both tabs, shortcut captures a cropped screenshot into the Chat tab |
| T+18 | Chat with Gemini Nano working on a screenshot plus URL, streaming |
| T+26 | Multi-screenshot conversations, auto-summary, notes table with expand and resume |
| T+30 | Markdown export, context-full banner |
| **T+31** | **Feature freeze.** Anything not working is cut |
| T+40 | Demo script passes 3 runs in a row from a clean state; submitted |
| T+45 | Pitch |

If a milestone slips, cut scope, never the freeze.

## Risks and fallbacks

| Risk | Fallback | Decide by |
|---|---|---|
| Image input to Nano does not work | A note captures the **highlighted text** on the page instead of a screenshot (with URL); UI unchanged | T+10 |
| `chrome.sidePanel.open()` refused from the keyboard shortcut | Open the side panel once at the start of the demo; the shortcut only captures | T+5 |
| Nano is slow (5–15 s per answer) | Streaming output; demo uses pre-tested pages and prepared questions | T+18 |
| Several screenshots overflow the context window | "Conversation is full" banner; resumed notes keep only the last 2 images | T+26 |
| A page blocks the overlay (Chrome Web Store, `chrome://` pages) | Demo only on pre-tested pages | T+20 |

## Pitch prep

- **"What's faked?"** Nothing. The model runs on-device in Chrome, and the Wi-Fi-off step proves it.
- Demo browser profile: extension loaded, model downloaded, demo pages open in tabs, notifications off, notes cleared.

## What's next

Search and filter notes, tags, editing, bulk export, a Notion-style board view, sync to Notion, Brave support once it ships an on-device model, and more languages.
