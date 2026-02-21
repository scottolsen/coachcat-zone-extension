# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that adds a weekly power zone distribution panel to the CoachCat cycling training app (app.fascat.ai). The extension fetches the user's training data and FTP from the FasCat API and displays time-in-zone statistics.

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
- The CoachCat app is a Flutter web app — DOM is rendered on a canvas, so standard DOM queries won't find app content. Use the FasCat API or Flutter semantics tree instead.

## FasCat API Endpoints

Base URL: `https://api.fascatapi.com`
Auth: `Authorization: Bearer <firebase_token>` header on all requests.

- **`GET /threshold`** — Returns user's FTP. Response: `{ success: true, result: { ftp: <number> } }`

- **`GET /app/v1/training/report/tiz-weekly?weekStart=YYYY-MM-DD&today=YYYY-MM-DD`** — Time-in-zone data for a week. Returns `{ activities: [{ powerZones: { "1": seconds, "2": seconds, ... } }] }`

- **`GET /app/v1/training/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD`** — Training calendar for a date range. Returns:
  ```json
  { "days": [{
      "date": "YYYY-MM-DD",
      "workouts": [{
        "id": number, "title": string, "type": string,
        "duration": "HH:MM:SS" | null, "ots": number | null,
        "summary": string, "steps": []
      }],
      "activities": [{
        "id": string, "title": string, "activityType": string,
        "time": seconds, "distance": meters, "elevation": meters,
        "ots": number, "avgPower": number, "avgHeartRate": number,
        "avgCadence": number, "provider": "ZWIFT" | string
      }],
      "recipes": [], "notes": []
  }] }
  ```
  - `workouts` = prescribed/planned training from the coaching plan
  - `activities` = completed rides synced from Zwift/devices
