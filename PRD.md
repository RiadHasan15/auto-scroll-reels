# Product Requirements Document (PRD): Modular Short-Video & Web Auto-Scroll Extension

## 1. Overview
**Auto-Scroll** is a modular browser extension (Manifest V3) designed to automatically scroll videos and web pages hands-free. It features an extensible platform adapter architecture that automatically detects short-video feeds (TikTok, Instagram Reels, Facebook Reels, YouTube Shorts) as well as regular web pages, auto-advancing when videos finish playing or at customizable intervals.

## 2. Platform Detection & Adapter Architecture
The extension uses an **Adapter Pattern** for site detection and action handling. Adding new platform support requires creating a simple adapter implementing `BasePlatformAdapter`.

### Supported Platforms:
1. **TikTok** (`tiktok.com/foryou`, `tiktok.com/@...`)
   - Detects video end events & automatically triggers Next Video scroll/keypress (`ArrowDown`).
2. **Instagram Reels** (`instagram.com/reels/`, `instagram.com/reel/`)
   - Tracks current reel video element and simulates next reel navigation (`ArrowDown` or container scroll).
3. **Facebook Reels** (`facebook.com/reel/`, `facebook.com/watch/`)
   - Detects FB reel container and auto-scrolls when reel ends.
4. **YouTube Shorts** (`youtube.com/shorts/`)
   - Detects YouTube Shorts player and scrolls down upon video completion.
5. **Generic Web Page Mode** (Fallback)
   - Continuous high-FPS smooth scrolling for standard articles, news, and long docs.

## 3. Core Features & Smart Behaviors
1. **Auto-Platform Recognition**:
   - Automatically detects current platform based on URL patterns and DOM signatures (including Single Page Application dynamic navigation changes).
2. **Video Completion Listener**:
   - Hooks into `<video>` HTML5 elements to trigger scrolling when video `ended` event fires, or after a custom delay/loop count.
3. **Smart Pause Controls**:
   - **Pause when Comments Drawer is open** (so user can read/reply without getting scrolled away).
   - **Pause on Hover or User Input**: Temporarily halts auto-scroll when user moves mouse or interacts with controls.
4. **Control Overlay & Popup UI**:
   - Floating Control Pill (Play/Pause, Skip Next/Prev, Auto-Advance Toggle, Speed/Delay Slider).
   - Popup menu to enable/disable specific platforms, toggle auto-play, and configure hotkeys (`Alt + S`).

## 4. Architecture & Technical Design
```
src/
├── manifest.json
├── background/
│   └── background.js           # Extension service worker & hotkey listener
├── core/
│   ├── BaseAdapter.js          # Abstract base class for platform adapters
│   ├── PlatformManager.js      # Platform detection & adapter registry
│   └── ScrollEngine.js         # Video end listener & smooth scroll engine
├── adapters/
│   ├── TikTokAdapter.js        # TikTok specific DOM & scroll logic
│   ├── InstagramAdapter.js     # IG Reels specific DOM & scroll logic
│   ├── FacebookAdapter.js      # FB Reels specific DOM & scroll logic
│   ├── YouTubeAdapter.js       # YT Shorts specific DOM & scroll logic
│   └── GenericAdapter.js       # Fallback article continuous scroll
├── content/
│   ├── content.js              # Injected script initializing PlatformManager
│   └── overlay.css             # Floating controller widget UI styles
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── options/
    ├── options.html
    └── options.js
```

## 5. Extensibility Standard (Adding New Platforms)
Developers can add a new platform by extending `BaseAdapter`:
```javascript
class NewPlatformAdapter extends BaseAdapter {
  static name = 'NewPlatform';
  static match(url) { return url.includes('example.com/reels'); }
  getVideoElement() { return document.querySelector('video'); }
  scrollToNext() { /* dispatch arrow key or scroll event */ }
}
```
