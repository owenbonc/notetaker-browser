# Notetaker Browser

**Screenshot anything in your browser, ask an on-device AI tutor about it, and keep every conversation as a searchable note.**

A Chrome extension with a side panel. Press a shortcut, drag a box over a diagram, passage or object on any page, and ask questions about it. Gemini Nano, the model built into Chrome, answers with the page's URL as context. Nothing leaves the laptop. Closing a conversation saves it to a database with an executive summary, and any saved conversation can be exported as Markdown.

Built in 45 minutes. This file is the spec: the demo script below is the acceptance criteria.

## Demo script (~90 seconds)

1. Open a Wikipedia page with a diagram (for example the Krebs cycle).
2. With the side panel closed, press `Alt+Shift+S`. The side panel opens on a fresh conversation, the page dims, and you drag a box over the diagram.
3. The screenshot drops into the **Chat** tab automatically. Ask "Explain this like I'm 15", and the answer streams in.
4. Keeping the side panel open, switch to a second site, screenshot a related passage, and ask "How does this connect to the diagram?" The same conversation continues across both sites.
5. Open the conversation list: the conversation is listed under **Ongoing**, next to one prepared earlier. Click **Close & save**.
6. Open the **Database** tab. A new row shows the thumbnail, title, sites and a 3-bullet summary.
7. Expand the row to see the full conversation, then click **Export .md** and open the file.
8. **Wow moment:** turn off Wi-Fi and do it again. Everything runs on-device.

## Scope

### Core concepts

- **Note = one conversation.** It holds every screenshot and message in it.
- **Every conversation is either ongoing or closed.**
  - **Ongoing:** still being worked on. Listed in the Chat tab's conversation list. No executive summary, not in the database.
  - **Closed:** the user clicked **Close & save**. The executive summary (title plus 3 bullets) is generated at that moment and the conversation becomes a row in the database.
- **Several conversations can be ongoing at once.** Switching between them, or closing the side panel, leaves them ongoing. Only **Close & save** summarizes and moves a conversation to the database.
- **Only one conversation is active** (shown in the Chat tab) at a time.
- **The shortcut's behaviour depends on whether the side panel is open:**
  - **Side panel closed:** the shortcut opens the side panel and starts a **fresh conversation**. The screenshot becomes its first message.
  - **Side panel open:** the screenshot joins the conversation currently shown in the Chat tab, whatever site it was taken on. If the user switched to another conversation from the list, it goes into that one. If the Chat tab is empty (after **+ New conversation** or **Close & save**), it starts a fresh conversation.
- **Screenshots always land in the side panel automatically.** No pasting. If the Database tab is showing, the panel switches to the Chat tab.
- Each screenshot keeps its own URL and page title, so the model knows where every image came from.
- **Closed conversations can be reopened.** Opening one from the Database tab moves it back to ongoing and makes it active: new questions and screenshots append to it, and the summary is rewritten the next time it is closed.

### UI: Chrome side panel with two tabs

Final visual designs will be added to this repo later. Until then, follow the layout below.

**Chat tab** (layout like a normal ChatGPT chat)
- Header: a ☰ button that opens the conversation list, the active conversation's title (or "New conversation"), a **+ New conversation** button, and a **Close & save** button.
- The conversation list is a drawer that slides over the chat (the side panel is too narrow for a permanent sidebar). It lists **ongoing** conversations, most recently updated first, each with its first screenshot as a thumbnail and its sites. Clicking one makes it active.
- Message thread: user messages and screenshots (with their site) right-aligned in bubbles, tutor answers left-aligned as plain text, newest at the bottom, auto-scrolling.
- Input box fixed at the bottom with a send button. Enter sends, Shift+Enter adds a new line.
- Empty state: "Press Alt+Shift+S and drag over anything on the page to start."
- Answers stream token by token.
- A "Conversation is full: close & save it, or start a new one" banner appears when the model's context is nearly used up.

**Database tab**
- Table of closed conversations, newest first. Columns: **Thumbnail · Title · Summary · Sites · Date**.
- Clicking a row expands it to show the full conversation, with **Reopen** and **Export .md** buttons.

### Built vs cut

| Built | Cut (see What's next) |
|---|---|
| Shortcut + drag-to-screenshot | Search, filters, sorting, tags |
| ChatGPT-style chat with Gemini Nano, streaming | Editing notes |
| Screenshots from multiple sites in one conversation | Bulk export |
| Several ongoing conversations, switchable from a list | Notion-style board or gallery views |
| Close & save generates title + 3-bullet summary | Brave support |
| Database table with expand and reopen | Renaming or deleting conversations |
| Export one note as `.md` | Languages other than English |
| Everything saved after each message | Chrome Web Store publishing |

Nothing on the demo path is faked.

## Architecture

Manifest V3, plain HTML/CSS/JS, no build step, loaded unpacked.

```
manifest.json      [A] permissions, side panel, Alt+Shift+S command
background.js      [A] service worker: handles the command, opens the panel, captures and crops the tab
overlay.js         [A] injected into the page: dims it, lets the user drag a box, returns the rectangle
panel-bridge.js    [A] loaded by the side panel: port to background, hands screenshots to the panel
export.js          [A] turns a conversation into Markdown and downloads it
sidepanel.html     [B] the two tabs
sidepanel.js       [B] chat (Gemini Nano), ongoing list, database table, storage
sidepanel.css      [B] styles
```

`[A]` and `[B]` are the owners; see [Team split](#team-split).

### Manifest essentials

- `permissions`: `sidePanel`, `storage`, `unlimitedStorage`, `scripting`, `tabs`, `activeTab`
- `host_permissions`: `<all_urls>` (needed for `captureVisibleTab` and injecting the overlay)
- `side_panel.default_path`: `sidepanel.html`
- `commands`: `take-note` with `suggested_key` `Alt+Shift+S`
- Set `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so the toolbar icon opens the panel.

### Capture flow

**Knowing whether the side panel is open.** When `panel-bridge.js` loads, it opens a port with `chrome.runtime.connect({ name: 'panel' })` and sends its window id (from `chrome.windows.getCurrent()`). Background keeps a `Set` of window ids with an open panel, removing one when its port disconnects. If the port drops while the panel is still open (the service worker restarted), the panel reconnects at once.

1. `chrome.commands.onCommand` (`take-note`, `tab`) fires in `background.js`.
2. Background checks the set. If the panel is **closed** in `tab.windowId`, it calls `chrome.sidePanel.open({ windowId: tab.windowId })` **immediately, before any `await`** (Chrome only allows it during the user gesture), and marks this capture `newConversation: true`.
3. Background injects `overlay.js` into the active tab with `chrome.scripting.executeScript`.
4. The overlay dims the page and lets the user drag a box. On mouseup it removes itself and returns `{x, y, width, height, devicePixelRatio}`. Esc cancels. If the panel was just opened, the cancelled capture still leaves the fresh, empty conversation showing.
5. Background calls `chrome.tabs.captureVisibleTab()`, then crops with `OffscreenCanvas`, **multiplying the rectangle by `devicePixelRatio`**.
6. Background sends `{type: 'screenshot', dataUrl, url, title, newConversation}` to the panel over its port. If the panel was just opened, it holds the message until the panel's port connects.
7. `panel-bridge.js` passes the message to `window.onScreenshot(msg)` in `sidepanel.js`. The panel switches to the Chat tab. If `newConversation` is true, or the Chat tab is empty, it creates a fresh ongoing conversation and makes it active. Otherwise it appends the screenshot to the conversation currently shown.

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

**One session per ongoing conversation.** Keep each in memory in a map keyed by conversation id. Switching back to a conversation whose session is gone (for example after the panel was closed) rebuilds it as described under "Reopening a conversation".

**Summary prompt** (sent to the conversation's session on **Close & save**):

> Summarize this conversation for my notes. Reply with exactly: a title of at most 8 words on the first line, then 3 bullet points of the key things I learned.

**Context limit:** after each turn compare `session.inputUsage` with `session.inputQuota`. Above 85%, show the "conversation is full" banner. Keep enough headroom for the summary prompt.

**Reopening a conversation:** create a new session with the saved messages as `initialPrompts`, keeping only the last 2 screenshots (older ones become their `"Screenshot from <title> (<url>)"` text line) so it fits in the context window.

### Data model

Stored in `chrome.storage.local` under the key `conversations`, as an array, plus `activeId` (the active conversation's id, or `null`). The Chat tab's list shows `status: 'ongoing'`, sorted by `updatedAt`. The Database tab shows `status: 'closed'`, sorted by `closedAt`.

```js
{
  id: crypto.randomUUID(),
  status: 'ongoing',                           // 'ongoing' | 'closed'
  createdAt: '2026-11-20T18:52:00Z',
  updatedAt: '2026-11-20T18:58:00Z',
  closedAt: null,                              // set on Close & save
  title: null,                                 // from the summary; null while ongoing
  summary: null,                               // 3 bullets; null while ongoing
  sites: ['en.wikipedia.org', 'khanacademy.org'],
  messages: [
    { role: 'user', type: 'screenshot', dataUrl: 'data:image/png;…', url: 'https://…', title: 'Citric acid cycle - Wikipedia', at: '…' },
    { role: 'user', type: 'text', text: 'Explain this like I\'m 15', at: '…' },
    { role: 'assistant', type: 'text', text: '…', at: '…' },
  ],
}
```

Save after every message, so a crash loses nothing. The thumbnail is the first screenshot. While a conversation is ongoing, the list shows the start of its first message in place of a title.

### Markdown export

`export.js` builds the file in the side panel and downloads it with a `Blob` and an `<a download>` link, named `<date>-<title>.md`:

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

## Team split

Two halves that never edit the same file. They meet at two small contracts, so each person can build and test alone and the pieces combine by simply being in the same folder.

| | **Person A: Capture & export** | **Person B: Side panel & AI** |
|---|---|---|
| Owns | `manifest.json`, `background.js`, `overlay.js`, `panel-bridge.js`, `export.js` | `sidepanel.html`, `sidepanel.js`, `sidepanel.css` |
| Builds | Shortcut, page overlay, drag box, crop, opening the panel, open/closed detection, new-vs-append flag, Markdown export | Two tabs, ChatGPT-style chat, Gemini Nano sessions, ongoing list, Close & save summary, database table, storage |
| Never touches | B's files, the data model in storage | A's files, Chrome extension APIs other than `chrome.storage` |

### Contracts

**1. Screenshot handoff** (A calls, B implements). `panel-bridge.js` calls this function, which `sidepanel.js` defines:

```js
window.onScreenshot = ({ dataUrl, url, title, newConversation }) => { /* B */ };
```

`dataUrl` is a cropped PNG `data:` URL. `newConversation` is `true` when the shortcut opened the panel.

**2. Markdown export** (B calls, A implements). `export.js` defines this function, which B's **Export .md** button calls with one conversation object from the [data model](#data-model):

```js
window.exportMarkdown(conversation); // builds the .md and downloads it
```

**Script order in `sidepanel.html`** (B writes it once, at T+3, and never changes it):

```html
<script src="panel-bridge.js"></script>
<script src="export.js"></script>
<script src="sidepanel.js"></script>
```

`panel-bridge.js` must wait for `window.onScreenshot` to exist (hold messages until `DOMContentLoaded`). The data model section above is the shared definition: B writes it, A reads it.

### Testing alone

- **A** opens the panel and watches the panel's DevTools console: until B's `onScreenshot` exists, `panel-bridge.js` logs every message it would hand over. A tests `exportMarkdown` by calling it from that console with the sample conversation from the data model.
- **B** fakes a screenshot from the panel's DevTools console, no capture code needed:
  ```js
  onScreenshot({ dataUrl: '<any image data URL>', url: 'https://en.wikipedia.org/wiki/Citric_acid_cycle', title: 'Citric acid cycle - Wikipedia', newConversation: true })
  ```
  Until A's `export.js` lands, the Export button logs the conversation instead.

### Git

Both commit straight to `main`, only their own files, and run `git pull --rebase` before every push. Disjoint files mean no merge conflicts. If a change to the other person's file is needed, ask them to make it.

### Timeline per person

| By | Person A | Person B |
|---|---|---|
| T+3 | Commit `manifest.json` (with `side_panel.default_path: sidepanel.html`) | Commit `sidepanel.html` with both tabs and the script tags above |
| T+8 | Shortcut → overlay → crop → message logged in the panel console | Chat layout, `onScreenshot` shows the image in the thread |
| **T+10** | **Integration check together:** a real screenshot appears in B's chat | ← same |
| T+18 | Panel open/closed detection, `newConversation` flag, Esc cancel, blocked-page handling | Gemini Nano streaming answers with image + URL |
| T+26 | `exportMarkdown` done; then test the demo pages for blocked overlays | Ongoing list and switching, Close & save summary, database table with reopen |
| **T+31** | **Freeze. Run the demo script together** | ← same |
| T+40 | Records the demo video and fills in the submission | Fixes demo-breaking bugs, prepares the demo browser profile |

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
| T+26 | Multi-screenshot conversations, ongoing list with switching, Close & save with summary, database table with expand and reopen |
| T+30 | Markdown export, context-full banner |
| **T+31** | **Feature freeze.** Anything not working is cut |
| T+40 | Demo script passes 3 runs in a row from a clean state; submitted |
| T+45 | Pitch |

If a milestone slips, cut scope, never the freeze.

## Risks and fallbacks

| Risk | Fallback | Decide by |
|---|---|---|
| Image input to Nano does not work | A note captures the **highlighted text** on the page instead of a screenshot (with URL); UI unchanged | T+10 |
| `chrome.sidePanel.open()` refused from the keyboard shortcut | Background holds the screenshot with `newConversation: true` and delivers it as soon as the user opens the panel from the toolbar icon | T+5 |
| Nano is slow (5–15 s per answer) | Streaming output; demo uses pre-tested pages and prepared questions | T+18 |
| Several screenshots overflow the context window | "Conversation is full" banner; reopened conversations keep only the last 2 images | T+26 |
| Several ongoing sessions use too much memory | Keep only the active conversation's session in memory; rebuild others when switched to | T+26 |
| A page blocks the overlay (Chrome Web Store, `chrome://` pages) | Demo only on pre-tested pages | T+20 |

## Pitch prep

- **"What's faked?"** Nothing. The model runs on-device in Chrome, and the Wi-Fi-off step proves it.
- Demo browser profile: extension loaded, model downloaded, demo pages open in tabs, notifications off, database cleared, one prepared ongoing conversation.

## What's next

Search and filter notes, tags, editing, renaming and deleting conversations, bulk export, a Notion-style board view, sync to Notion, Brave support once it ships an on-device model, and more languages.
