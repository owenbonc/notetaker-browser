# Notetaker Browser

**Screenshot anything in your browser, ask an on-device AI tutor about it, and keep every conversation as a note.**

A Chrome extension with a side panel. Press a shortcut, drag a box over a diagram, passage or object on any page, and ask questions about it. Gemini Nano, the model built into Chrome, answers using the screenshot and the page's URL. Nothing leaves your laptop. Saving a conversation adds it to a database with an executive summary, and any saved conversation can be exported as Markdown.

| Chat | Database |
|---|---|
| ![Chat tab](<AI Assistant Enzyme Kinetics Chat.png>) | ![Database tab](<AI Assistant Saved Notes Database UI.png>) |

## Requirements

- **Chrome desktop** (Windows, macOS or Linux). Brave and mobile browsers do not ship Gemini Nano.
- 22 GB free disk, plus a GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ CPU cores.

## Set up Gemini Nano (once)

The model is a multi-GB download, so do this before you need it.

1. In `chrome://flags`, enable **Prompt API for Gemini Nano** and **Prompt API for Gemini Nano with Multimodal Input**, then restart Chrome.
2. Open `chrome://on-device-internals` and check the model has downloaded.
3. Optional check: in DevTools on any page, run
   ```js
   await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] })
   ```
   It should return `'available'`.

## Install the extension

1. Clone this repo:
   ```bash
   git clone https://github.com/owenbonc/notetaker-browser.git
   ```
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `notetaker-browser` folder.
4. Pin **Notetaker** from the puzzle-piece menu so its icon is in the toolbar.

If `Alt+Shift+S` clashes with another shortcut, change it at `chrome://extensions/shortcuts`.

## How to use it

**Take a note**
1. On any web page, press **`Alt+Shift+S`**.
2. The page dims. Drag a box over what you want to ask about. Press **Esc** to cancel.
3. The screenshot drops into the side panel's **Chat** tab. Type a question and press **Enter**.

**Which conversation a screenshot goes into**
- **Side panel closed:** the shortcut opens it and starts a **new conversation**.
- **Side panel open:** the screenshot joins the conversation on screen, even from a different website. Use this to compare things across pages.
- **+ New Conversation** clears the chat so the next screenshot starts a fresh one.

**Ongoing conversations**
- Conversations you haven't saved stay **ongoing**. Open the **Ongoing** list in the Chat tab to switch between them. They survive closing the side panel.

**Save to the database**
- Click **Save**. The tutor writes a title and a 3-bullet executive summary, and the conversation moves to the **Database** tab.

**Database tab**
- Every saved conversation as a card: thumbnail, title, summary, website and date. Use the search box to filter.
- The **•••** menu on a card:
  - **Reopen** moves it back to ongoing so you can keep asking. Its summary is rewritten the next time you save.
  - **Export .md** downloads the full conversation, screenshots included, as a Markdown file.

## Troubleshooting

| Problem | Fix |
|---|---|
| Red error bubble in the chat | Gemini Nano isn't ready. Redo [Set up Gemini Nano](#set-up-gemini-nano-once) |
| Shortcut does nothing on a page | Chrome blocks extensions on `chrome://` pages and the Chrome Web Store. Try a normal website |
| Side panel didn't open from the shortcut | Click the Notetaker toolbar icon; the screenshot is waiting there |
| "Conversation is full" banner | Gemini Nano's context is nearly used up. Click **Save** or start a new conversation |

## How it's built

Manifest V3, plain HTML, CSS and JavaScript, no build step. Everything is stored locally in `chrome.storage.local`.

| File | Does |
|---|---|
| `manifest.json` | Permissions, side panel, the `Alt+Shift+S` command |
| `background.js` | Handles the shortcut, opens the side panel, captures and crops the tab |
| `overlay.js` | Dims the page and lets you drag a selection box |
| `panel-bridge.js` | Passes screenshots from the background to the side panel |
| `export.js` | Turns a conversation into Markdown and downloads it |
| `sidepanel.html`, `sidepanel.css`, `sidepanel.js` | Chat, Gemini Nano, ongoing list, database |

The original design spec, team split and demo script are in [SPEC.md](SPEC.md).
