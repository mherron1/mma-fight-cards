# Fight Cards — prototype

A mobile-first, swipeable combat-sports event viewer with a 3D cube transition.

## Run locally

Because the app loads `data/events.json` with `fetch()`, serve the folder over HTTP instead of opening `index.html` directly.

### Option A: VS Code Live Server
1. Open this folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html`.
4. Choose **Open with Live Server**.

### Option B: Python
From this folder, run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project structure

- `index.html` — application shell
- `css/styles.css` — mobile layout and fight-card styling
- `js/app.js` — loads the JSON and starts the app
- `js/cube.js` — cube geometry, swipe handling and rapid-swipe queue
- `js/fight-cards.js` — renders event data into fight-card HTML
- `data/events.json` — sample event database
- `manifest.json` — PWA manifest
- `service-worker.js` — basic same-origin offline caching

## Editing event data

Edit `data/events.json`. Each event has metadata and a `fights` array. Set `start_time` to an ISO 8601 date-time with a timezone offset (for example, `"2026-11-14T20:00:00-08:00"`) to show a countdown beside the event date and location. The sample start times are illustrative. The first fight marked `main_event` is used as the featured matchup. Up to four additional fights are shown beneath it.

Fighter image paths are optional. Add images under `images/fighters/` and set the corresponding `image` property, for example:

```json
"image": "images/fighters/alex-morgan.jpg"
```

All event and fighter information currently included is fictional placeholder data.

## Notes

- The app is designed for portrait mobile screens.
- The cube has four physical sides; it reuses those sides to display any number of events.
- The service worker is registered on HTTP/HTTPS hosting. For production, increment `CACHE_NAME` when publishing updated assets and consider a more robust update strategy.
- A valid 192x192 and 512x512 app icon should be added to `manifest.json` before public PWA distribution.

\n## Appearance\n\nUse the LIGHT / DARK control in the top-right corner to switch themes. The app remembers your choice on that device. The accent colour is red in both themes.\n