# AI Test Case Designer Chrome Extension

This is a local-first Chrome extension MVP.

The extension does not require the project backend for normal use. Users configure their own OpenAI-compatible API key in the extension options page, and the extension calls that model service directly from the browser.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this extension folder.

5. Open extension options and configure:

   - API Key
   - Base URL
   - Model

6. Click the extension icon to open the side panel.

## Local Debug Launcher

Run this script to start a dedicated debug browser and open the extension UI:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-chrome-dev.ps1
```

The launcher prefers Chrome for Testing because newer branded Chrome builds may ignore the `--load-extension` command-line flag. If Chrome for Testing is not installed, the script falls back to regular Chrome and opens `chrome://extensions` for manual loading.

## Data and Key Handling

- API Key is stored in `chrome.storage.local`.
- Chat history and generated cases are stored in `chrome.storage.local`.
- The extension sends requirement text only to the model endpoint configured by the user.
- No user data is sent to the plugin author.

## Current MVP Flow

```text
User types requirement
  -> Side panel reads local model settings
  -> Side panel calls user's OpenAI-compatible /chat/completions endpoint
  -> Model returns assistant message and optional test cases
  -> Side panel renders the chat reply and test case table
  -> User exports CSV / JSON / Markdown
```

## Current Capabilities

- Codex-like chat side panel.
- User-owned API Key and model settings.
- Multi-turn message history in the current session.
- AI-style clarification when the requirement is too vague.
- Structured test case table when enough information is available.
- Export CSV, JSON, Markdown.
- Save recent generated sessions in extension local storage.

## Intentionally Not Included

- Backend service dependency.
- Reading current page DOM.
- Jira / ZenTao integration.
- File upload parsing inside the extension.
- Knowledge base / RAG.
- Screenshot OCR.
- Platform write-back.
