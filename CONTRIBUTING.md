# Contributing to Auto Scroll

Thank you for your interest in contributing to **Auto Scroll**! This document provides guidelines for reporting bugs, proposing new features, and submitting code contributions.

---

## 🛠️ Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/auto-scroll-extension.git
   cd auto-scroll-extension
   ```
2. Load the unpacked extension in Chrome / Edge (`chrome://extensions`).
3. Make your changes in `src/`.
4. Run syntax verification:
   ```bash
   npm run check
   ```

---

## 🌐 Adding New Platform Adapters

We welcome support for additional platforms (e.g. Reddit, X/Twitter, Twitch clips, Pinterest).

### Steps:
1. Create a new adapter file in `src/adapters/` (e.g. `RedditAdapter.js`) extending `BaseAdapter`.
2. Implement:
   - `static matches(url)`: URL regex or domain matching logic.
   - `getVideoElement()`: Returns the active video HTML element on screen.
   - `scrollToNext()`: Triggers navigation to the next video item.
   - `isCommentsOpen()`: Returns boolean if comment panel is open.
   - `unmuteVideo()`: (Optional) Triggers native unmute toggle.
3. Register the new adapter in `PlatformManager.js` and `content.js`.
4. Test thoroughly on the target site.

---

## 📝 Submitting a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feature/new-platform-support
   ```
2. Commit your changes with clear, descriptive messages:
   ```bash
   git commit -m "feat(adapters): add Reddit video feed adapter"
   ```
3. Push to your fork and submit a Pull Request.

---

## 🐛 Reporting Bugs

If you find a bug or a broken platform selector:
1. Open an issue on GitHub.
2. Include your browser version and OS.
3. Provide the URL of the reel/short where the issue occurred.
4. Describe expected vs. actual behavior.
