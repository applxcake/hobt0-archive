# hobt0 Browser Extension

One-click save any webpage to your hobt0 knowledge archive.

## Features

- **One-click archiving** - Save any webpage with a single click
- **Quick notes** - Add your own summary/tags before saving
- **Auto-capture** - Page title and URL captured automatically
- **Dark theme** - Matches hobt0 cyberpunk aesthetic

## Installation

### Chrome/Edge/Brave

1. Download the extension folder
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension` folder

### Firefox

1. Download and zip the extension folder
2. Open `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `manifest.json`

## Development

The extension communicates with the main hobt0 app via:
- **Content Script** - Injects into pages to capture data
- **Background Worker** - Handles auth token storage
- **Popup** - User interface for saving

## API Endpoints Used

- `POST /api/cards` - Save new card (requires Bearer token)
- Web app sends auth token via `window.postMessage`

## Build

No build step required - vanilla JS/CSS/HTML.

## Icons

Extension requires these icon sizes in the `extension/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)  
- `icon128.png` (128x128)

Create these from the main app logo.
