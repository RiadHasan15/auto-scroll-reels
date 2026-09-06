# 📜 Auto Scroll - Shorts, Reels & Web Scroller

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Browser-Chrome%20|%20Edge%20|%20Brave%20|%20Opera-blue)](https://www.google.com/chrome/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Hands-free vertical video browsing and smooth web page scrolling.** Automatically advances to the next video when the current one finishes on **YouTube Shorts**, **Instagram Reels**, **TikTok**, and **Facebook Reels**, or smoothly autoscrolls articles and documentation.

---

## 🌟 Features

* 🎬 **Auto-Advance Video Feeds**: Detects video completion and automatically scrolls to the next video on TikTok, Instagram Reels, YouTube Shorts, and Facebook Reels.
* 🔊 **Auto-Unmute**: Automatically unmutes video audio on page load, eliminating the default muted playback on Instagram and TikTok.
* 🔁 **Custom Loop Selector (1x, 2x, 3x, 5x)**: Watch tutorials, recipes, or dance clips multiple times before automatically moving to the next reel.
* 🖐️ **Draggable Floating Controller**: Modern glassmorphic pill widget that can be placed anywhere on screen with position memory across tabs and browser restarts.
* 👻 **Auto-Hide Inactivity Mode**: The floating widget smoothly fades to 22% opacity when your mouse is idle so it never covers your content.
* 💬 **Smart Pause on Comments**: Automatically pauses auto-advance while reading or typing comments.
* 🖱️ **Pause on Hover & Interaction**: Halts scrolling whenever you move your mouse or scroll manually, resuming automatically after a 2-second delay.
* 📜 **Smooth Web Reading Scroller**: High-FPS continuous scrolling for news articles, blogs, and documentation with adjustable speed (10–300 px/s).
* ⚡ **Global Keyboard Shortcut**: Toggle auto-scroll instantly using <kbd>Alt</kbd> + <kbd>S</kbd> (or <kbd>Option</kbd> + <kbd>S</kbd> on macOS).

---

## 🌐 Supported Platforms

| Platform | URL Pattern | Navigation Method | Auto-Unmute | Comments Detection |
| :--- | :--- | :--- | :---: | :---: |
| **YouTube Shorts** | `youtube.com/shorts/*` | Native button & key dispatch | ✅ | ✅ |
| **Instagram Reels** | `instagram.com/reels/*` | Native snap scroll & element targeting | ✅ | ✅ |
| **TikTok** | `tiktok.com/*` | Next button & ArrowDown dispatch | ✅ | ✅ |
| **Facebook Reels** | `facebook.com/reel/*` | Snap container & key dispatch | ✅ | ✅ |
| **Generic Web** | *All other URLs* | 60 FPS `requestAnimationFrame` | N/A | N/A |

---

## 🏗️ Architecture & Extensibility

The extension is designed around an extensible **Adapter Pattern**. Adding support for a new video feed or custom site requires creating a standalone adapter inheriting from `BaseAdapter`.

```
Auto-scroll/
├── manifest.json              # Chrome Manifest V3 configuration
├── background.js              # Service worker for shortcuts & storage defaults
├── src/
│   ├── core/
│   │   ├── BaseAdapter.js     # Abstract base class for platform adapters
│   │   ├── PlatformManager.js # Auto-detects active platform & handles SPA routing
│   │   └── ScrollEngine.js    # Loop counter, time tracking & scroll loop
│   ├── adapters/
│   │   ├── InstagramAdapter.js# Instagram Reels scroll & DOM handlers
│   │   ├── TikTokAdapter.js   # TikTok scroll & DOM handlers
│   │   ├── YouTubeAdapter.js  # YouTube Shorts scroll & DOM handlers
│   │   ├── FacebookAdapter.js # Facebook Reels scroll & DOM handlers
│   │   └── GenericAdapter.js  # Smooth fallback reading scroller
│   └── content/
│       ├── content.js         # Injected script combining engine and UI
│       └── overlay.css        # Glassmorphic draggable widget styling
├── popup/
│   ├── popup.html             # Toolbar popup interface
│   ├── popup.css
│   └── popup.js
└── options/
    ├── options.html           # Advanced options & platform selector
    └── options.js
```

### Adding a New Platform Adapter
To add support for a new platform (e.g. Reddit, Twitter/X):

```javascript
import BaseAdapter from '../core/BaseAdapter.js';

class NewPlatformAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'newplatform';
    this.name = 'New Platform';
  }

  static matches(url) {
    return url.includes('example.com/videos');
  }

  getVideoElement() {
    return document.querySelector('video');
  }

  scrollToNext() {
    // Implement platform-specific scroll action
    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
  }
}
```

---

## 🚀 Installation & Local Setup

### For Chrome, Brave, Edge & Opera:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/RiadHasan15/auto-scroll-reels.git
   ```
2. Open your browser's extension manager:
   * **Chrome / Brave**: `chrome://extensions`
   * **Edge**: `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right or left sidebar).
4. Click **Load unpacked**.
5. Select the cloned `Auto-scroll` folder.
6. Navigate to [Instagram Reels](https://www.instagram.com/reels/) or [YouTube Shorts](https://www.youtube.com/shorts/) and click **▶** or press <kbd>Alt</kbd> + <kbd>S</kbd>!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>S</kbd> (Windows/Linux) | Toggle Auto-Scroll ON / OFF |
| <kbd>Option</kbd> + <kbd>S</kbd> (macOS) | Toggle Auto-Scroll ON / OFF |

*Shortcuts can be customized in your browser at `chrome://extensions/shortcuts`.*

---

## 🛡️ Privacy Policy

* **100% Client-Side**: All functionality runs entirely within your local browser.
* **No Telemetry / Data Collection**: Zero analytics, trackers, or remote servers.
* **Open Source**: The complete code is transparent and auditable.

---

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for details on submitting pull requests and suggestions.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

**Developed with ❤️ by [Riad Hasan](https://github.com/RiadHasan15)**
