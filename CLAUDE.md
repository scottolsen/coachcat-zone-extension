# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V4) that adds a weekly power zone distribution panel to the CoachCat cycling training app (app.fascat.ai). The extension fetches the user's training data and FTP from the FasCat API and displays time-in-zone statistics.

## Development

**Loading the extension:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

**Testing changes:** After modifying files, click the refresh icon on the extension card in `chrome://extensions/`, then reload the CoachCat app page.

## Architecture

The extension uses a content script injection pattern:

- **content.js** - Content script that runs on app.fascat.ai. Creates a floating toggle button and injects `injected.js` into the page context (required to access the page's IndexedDB for Firebase auth tokens).

- **injected.js** - Runs in page context (not extension context). Retrieves Firebase auth token from IndexedDB, fetches user FTP from `/threshold` endpoint and weekly time-in-zone data from `/app/v1/training/report/tiz-weekly`, then renders a floating panel with zone distribution bars.

- **styles.css** - Styles for the floating panel and toggle button. Dark theme matching CoachCat's UI.

## Key Implementation Details

- Zone configuration (percentages of FTP) is defined in `ZONE_CONFIG` in injected.js
- Firebase token is retrieved from `firebaseLocalStorageDb` IndexedDB
- Week calculation starts on Monday (ISO week format)
- Panel shows relative bar widths (longest zone = 100%)
