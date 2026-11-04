# Thumbnail Eraser

A Chrome/Edge extension that replaces YouTube's clickbait thumbnails with real frames from the middle of each video, and blocks YouTube Shorts.

## Features

### 🎬 Midpoint Thumbnails
- Replaces uploader-chosen thumbnails with auto-generated frames from ~25% / 50% / 75% through the video
- Uses YouTube's high-quality frames: `maxres1/2/3.jpg` (1280×720) and `hq1/2/3.jpg` (480×360)
- Works on homepage, search results, channel pages, watch-page sidebar, and embedded players
- Toggle on/off via popup or context menu

### 🚫 Shorts Blocker
- Removes Shorts shelves from homepage and search results
- Hides Shorts tab in sidebar (both collapsed and expanded)
- Hides Shorts filter chip
- Hides individual Shorts videos in grids/feeds
- Redirects direct `/shorts/` URLs to YouTube homepage
- Toggle on/off via popup or context menu

## Installation

### From Source (Developer Mode)
1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `Thumbnail Eraser` folder

## Usage

Click the extension icon in the toolbar to open the popup:

- **Midpoint Frames** — Toggle thumbnails on/off
- **Block Shorts** — Toggle Shorts blocking on/off

Or right-click anywhere on YouTube → **Toggle Midpoint Thumbnails** / **Toggle Shorts Blocker**

## How It Works

### Thumbnails
YouTube automatically saves three still frames per video at roughly 25% / 50% / 75%:
| Frame | HD (maxres) | Always Available (hq) |
|-------|-------------|----------------------|
| 1 (early) | `maxres1.jpg` 1280×720 | `hq1.jpg` 480×360 |
| 2 (middle) | `maxres2.jpg` 1280×720 | `hq2.jpg` 480×360 |
| 3 (late) | `maxres3.jpg` 1280×720 | `hq3.jpg` 480×360 |

The extension probes for the HD version first, falls back to HQ, and caches results per video.

### Shorts Blocking
- **Network level**: Declarative Net Request rules redirect `/shorts/*` → `/`
- **DOM level**: MutationObserver removes Shorts shelves, sidebar tabs, chips, and individual videos
- **SPA level**: `popstate` listener + URL polling catches client-side navigation to Shorts

## Privacy

- No accounts, no analytics, no tracking
- Only loads images from YouTube's own `i.ytimg.com` CDN
- Stores only your toggle settings (`enabled`, `shortsBlocked`, `frame`) in `chrome.storage.sync`
- Runs only on `youtube.com` domains

## Technical Details

- **Manifest V3** (service worker background, declarativeNetRequest)
- **Content script** runs at `document_idle` with `all_frames: true`
- **MutationObserver** watches `attributes` (src, style) + `childList` for SPA updates
- **DNR static rules** for instant `/shorts/` URL redirects
- **CustomEvent bridge** between popup/background and content script

## License

MIT © 2024