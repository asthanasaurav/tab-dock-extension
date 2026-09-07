# Tab Dock

Chrome extension — a slim dock for your open tabs, grouped by app (Gmail, Calendar, Docs, Drive, …) with pinned positions.

**Version 1.0.0**

## Features

- **Icon rail** (44px) — hover for instant tab list, click to pin a group open
- **Panel mode** — full 280px dock with search and inline expandable groups
- Pin apps to fixed order (Gmail #1, Calendar #2 by default)
- Left or right side, optional push-page layout
- Expand / collapse all, click outside to dismiss
- Accordion: one expanded group at a time (unless expand-all)

## Install locally

### 1. Get the code

```bash
git clone https://github.com/asthanasaurav/tab-dock-extension.git
cd tab-dock-extension
```

Or use your local folder:

`/Users/saasthan/Cursor/tab-dock-extension`

### 2. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (must contain `manifest.json`)

### 3. Use it

- The dock appears on the **right** by default on every page
- Click **⚙** at the bottom for settings (layout, position, pins)
- Click the toolbar icon to show/hide the dock

## Settings

| Setting | Options |
|---------|---------|
| Layout | **Icons** (slim rail) or **Panel** (full dock + search) |
| Position | Left / Right |
| Push page content | Shift page instead of overlaying |
| Show pinned when empty | Keep Gmail/Calendar slots when no tabs open |

## Reload after changes

1. `chrome://extensions` → **Reload** on Tab Dock
2. Refresh open browser tabs

## Project structure

```
tab-dock-extension/
├── manifest.json
├── background.js
├── content/
│   ├── dock.js
│   └── dock.css
├── lib/
│   ├── apps.js
│   ├── groupTabs.js
│   └── shortcuts.js   # (planned)
└── icons/
```

## Permissions

- **tabs** — read and switch open tabs
- **storage** — save pins and settings locally

No data is sent to any server.

## License

MIT
