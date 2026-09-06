/**
 * Content Script - Auto Scroll Extension
 */
(function () {
  if (window.__AUTO_SCROLL_INJECTED__) return;
  window.__AUTO_SCROLL_INJECTED__ = true;

  // --- 1. Base Adapter ---
  class BaseAdapter {
    constructor() {
      this.id = 'generic';
      this.name = 'Web Page';
      this.videoEndCallback = null;
      this.currentVideo = null;
      this.lastTime = 0;
      this.hasTriggeredForCurrentLoop = false;
      this.currentLoopCount = 0;
      this.targetLoopCount = 1;
      this.autoUnmute = false;

      this.boundHandleTimeUpdate = this.handleTimeUpdate.bind(this);
      this.boundHandleVideoEnded = this.handleVideoEnded.bind(this);
    }
    static matches(url) { return false; }
    setLoopCount(count) { this.targetLoopCount = Math.max(1, parseInt(count, 10) || 1); }
    setAutoUnmute(enabled) {
      this.autoUnmute = !!enabled;
      if (this.autoUnmute && this.currentVideo) this.unmuteVideo();
    }
    unmuteVideo() {
      const video = this.getVideoElement();
      if (video) { video.muted = false; video.volume = 1.0; }
    }
    getVideoElement() {
      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) return null;
      const playing = videos.find(v => !v.paused && v.currentTime > 0);
      if (playing) return playing;
      return videos.find(v => {
        const rect = v.getBoundingClientRect();
        return rect.height > 100 && rect.top >= -rect.height / 2 && rect.top <= window.innerHeight;
      }) || videos[0];
    }
    isCommentsOpen() { return false; }
    scrollToNext() { window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' }); }
    scrollToPrevious() { window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' }); }
    observeVideoEnded(callback) {
      this.videoEndCallback = callback;
      this.attachVideoListener();
    }
    attachVideoListener() {
      const video = this.getVideoElement();
      if (video && video !== this.currentVideo) {
        if (this.currentVideo) {
          this.currentVideo.removeEventListener('ended', this.boundHandleVideoEnded);
          this.currentVideo.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
        }
        this.currentVideo = video;
        this.lastTime = 0;
        this.hasTriggeredForCurrentLoop = false;
        this.currentLoopCount = 0;

        if (this.autoUnmute) {
          setTimeout(() => this.unmuteVideo(), 300);
        }

        this.currentVideo.addEventListener('ended', this.boundHandleVideoEnded);
        this.currentVideo.addEventListener('timeupdate', this.boundHandleTimeUpdate);
      }
    }
    checkAndTriggerAdvance() {
      this.currentLoopCount++;
      if (this.currentLoopCount >= this.targetLoopCount) {
        this.currentLoopCount = 0;
        if (typeof this.videoEndCallback === 'function') {
          this.videoEndCallback();
        }
      }
    }
    handleTimeUpdate() {
      if (!this.currentVideo) return;
      const duration = this.currentVideo.duration;
      const currentTime = this.currentVideo.currentTime;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const nearEnd = (duration - currentTime) <= 0.45;
      const loopWrapped = (this.lastTime > duration - 1.0) && (currentTime < 0.5);

      if ((nearEnd || loopWrapped) && !this.hasTriggeredForCurrentLoop) {
        this.hasTriggeredForCurrentLoop = true;
        this.checkAndTriggerAdvance();
      }

      if (currentTime < duration - 1.0 && currentTime > 0.5) {
        this.hasTriggeredForCurrentLoop = false;
      }

      this.lastTime = currentTime;
    }
    handleVideoEnded() {
      if (!this.hasTriggeredForCurrentLoop) {
        this.hasTriggeredForCurrentLoop = true;
        this.checkAndTriggerAdvance();
      }
    }
    cleanup() {
      if (this.currentVideo) {
        this.currentVideo.removeEventListener('ended', this.boundHandleVideoEnded);
        this.currentVideo.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
        this.currentVideo = null;
      }
      this.hasTriggeredForCurrentLoop = false;
      this.currentLoopCount = 0;
    }
  }

  // --- 2. Platform Adapters ---

  class TikTokAdapter extends BaseAdapter {
    constructor() { super(); this.id = 'tiktok'; this.name = 'TikTok'; }
    static matches(url) { return url.includes('tiktok.com'); }
    unmuteVideo() {
      super.unmuteVideo();
      const muteBtn = document.querySelector('[data-e2e="video-sound-mute"], [aria-label*="unmute" i]');
      if (muteBtn) muteBtn.click();
    }
    getVideoElement() {
      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) return null;
      return videos.find(v => !v.paused && v.readyState > 2) || videos[0];
    }
    isCommentsOpen() {
      return !!(document.querySelector('[data-e2e="comment-list"]') || document.querySelector('[class*="CommentContainer"]'));
    }
    scrollToNext() {
      const nextBtn = document.querySelector('[data-e2e="arrow-right"]') || document.querySelector('[aria-label="Next video"]') || document.querySelector('button[class*="ButtonControlDown"]');
      if (nextBtn) { nextBtn.click(); return; }
      const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', which: 40, bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true }));
    }
    scrollToPrevious() {
      const prevBtn = document.querySelector('[data-e2e="arrow-left"]') || document.querySelector('[aria-label="Previous video"]');
      if (prevBtn) { prevBtn.click(); return; }
      const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', which: 38, bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    }
  }

  class InstagramAdapter extends BaseAdapter {
    constructor() { super(); this.id = 'instagram'; this.name = 'IG Reels'; }
    static matches(url) {
      return url.includes('instagram.com/reels') ||
             url.includes('instagram.com/reel') ||
             (url.includes('instagram.com') && !!document.querySelector('a[href*="/reels/"][aria-current="page"], [aria-label*="Reels"]'));
    }
    unmuteVideo() {
      super.unmuteVideo();
      const muteSvg = document.querySelector('svg[aria-label="Audio is muted"], svg[aria-label="Muted"]');
      if (muteSvg) {
        const btn = muteSvg.closest('button') || muteSvg.closest('div[role="button"]');
        if (btn) btn.click();
      }
    }
    getVideoElement() {
      const videos = Array.from(document.querySelectorAll('main video, video')).filter(v => {
        const rect = v.getBoundingClientRect();
        return rect.width > 150 && rect.height > 150;
      });
      if (!videos.length) return null;
      const playing = videos.find(v => !v.paused && v.currentTime > 0);
      if (playing) return playing;
      const center = window.innerHeight / 2;
      let closest = videos[0];
      let minDist = Infinity;
      for (const v of videos) {
        const rect = v.getBoundingClientRect();
        const vCenter = rect.top + rect.height / 2;
        const dist = Math.abs(vCenter - center);
        if (dist < minDist) { minDist = dist; closest = v; }
      }
      return closest;
    }
    isCommentsOpen() {
      const commentInput = document.querySelector('form textarea[aria-label*="comment" i], form textarea[placeholder*="comment" i], textarea[placeholder*="Add a comment" i]');
      if (commentInput) {
        const rect = commentInput.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
      return false;
    }
    scrollToNext() {
      const currentVideo = this.getVideoElement();
      const videos = Array.from(document.querySelectorAll('main video, video')).filter(v => {
        const r = v.getBoundingClientRect();
        return r.width > 150 && r.height > 150;
      });
      let nextElement = null;
      if (currentVideo) {
        const curIndex = videos.indexOf(currentVideo);
        if (curIndex !== -1 && curIndex + 1 < videos.length) {
          nextElement = videos[curIndex + 1];
        } else {
          const curTop = currentVideo.getBoundingClientRect().top;
          nextElement = videos.find(v => v.getBoundingClientRect().top > curTop + 100);
        }
      }
      if (nextElement) {
        const target = nextElement.closest('article') || nextElement.closest('section') || nextElement;
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
      }
      let scrollContainer = null;
      let el = currentVideo ? currentVideo.parentElement : document.querySelector('main');
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflow + style.overflowY) || (style.scrollSnapType && style.scrollSnapType !== 'none')) {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }
      const scrollHeight = window.innerHeight || 800;
      if (scrollContainer && scrollContainer.scrollBy) {
        scrollContainer.scrollBy({ top: scrollHeight, behavior: 'smooth' });
      } else {
        const main = document.querySelector('main') || document.documentElement;
        main.scrollBy({ top: scrollHeight, behavior: 'smooth' });
        window.scrollBy({ top: scrollHeight, behavior: 'smooth' });
      }
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true, composed: true, view: window
      });
      if (currentVideo) currentVideo.dispatchEvent(keyEvent);
      if (scrollContainer && scrollContainer.dispatchEvent) scrollContainer.dispatchEvent(keyEvent);
      document.dispatchEvent(keyEvent);
      window.dispatchEvent(keyEvent);
      const wheelEvent = new WheelEvent('wheel', { deltaY: scrollHeight, bubbles: true, cancelable: true, composed: true, view: window });
      if (scrollContainer && scrollContainer.dispatchEvent) scrollContainer.dispatchEvent(wheelEvent);
      window.dispatchEvent(wheelEvent);
    }
    scrollToPrevious() {
      const currentVideo = this.getVideoElement();
      const videos = Array.from(document.querySelectorAll('main video, video')).filter(v => {
        const r = v.getBoundingClientRect();
        return r.width > 150 && r.height > 150;
      });
      let prevElement = null;
      if (currentVideo) {
        const curIndex = videos.indexOf(currentVideo);
        if (curIndex > 0) {
          prevElement = videos[curIndex - 1];
        } else {
          const curTop = currentVideo.getBoundingClientRect().top;
          prevElement = videos.slice().reverse().find(v => v.getBoundingClientRect().top < curTop - 100);
        }
      }
      if (prevElement) {
        const target = prevElement.closest('article') || prevElement.closest('section') || prevElement;
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
      }
      let scrollContainer = null;
      let el = currentVideo ? currentVideo.parentElement : document.querySelector('main');
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflow + style.overflowY) || (style.scrollSnapType && style.scrollSnapType !== 'none')) {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }
      const scrollHeight = window.innerHeight || 800;
      if (scrollContainer && scrollContainer.scrollBy) {
        scrollContainer.scrollBy({ top: -scrollHeight, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: -scrollHeight, behavior: 'smooth' });
      }
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true, composed: true, view: window
      });
      if (currentVideo) currentVideo.dispatchEvent(keyEvent);
      if (scrollContainer && scrollContainer.dispatchEvent) scrollContainer.dispatchEvent(keyEvent);
      document.dispatchEvent(keyEvent);
      window.dispatchEvent(keyEvent);
    }
  }

  class FacebookAdapter extends BaseAdapter {
    constructor() { super(); this.id = 'facebook'; this.name = 'FB Reels'; }
    static matches(url) {
      return url.includes('facebook.com/reel') || url.includes('facebook.com/reels') || (url.includes('facebook.com/watch') && document.querySelector('[aria-label*="Reel"]'));
    }
    getVideoElement() {
      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) return null;
      return videos.find(v => {
        const rect = v.getBoundingClientRect();
        return rect.top >= -50 && rect.top <= window.innerHeight / 2;
      }) || videos[0];
    }
    isCommentsOpen() {
      return !!(document.querySelector('[data-pagelet="ReelsComments"]') || document.querySelector('form textarea[aria-label*="comment" i]'));
    }
    scrollToNext() {
      const nextBtn = document.querySelector('[aria-label="Next Reel"]') || document.querySelector('[aria-label="Next video"]');
      if (nextBtn) { nextBtn.click(); return; }
      const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
      window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
    }
    scrollToPrevious() {
      const prevBtn = document.querySelector('[aria-label="Previous Reel"]') || document.querySelector('[aria-label="Previous video"]');
      if (prevBtn) { prevBtn.click(); return; }
      const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    }
  }

  class YouTubeAdapter extends BaseAdapter {
    constructor() { super(); this.id = 'youtube'; this.name = 'YT Shorts'; }
    static matches(url) { return url.includes('youtube.com/shorts'); }
    unmuteVideo() {
      super.unmuteVideo();
      const muteBtn = document.querySelector('#volume-button button, ytd-reel-video-renderer[is-active] #volume-button button, button[aria-label*="Unmute" i]');
      if (muteBtn && (muteBtn.getAttribute('aria-label') || '').toLowerCase().includes('unmute')) {
        muteBtn.click();
      }
    }
    getVideoElement() {
      const activeRenderer = document.querySelector('ytd-reel-video-renderer[is-active]') || document.querySelector('ytd-reel-video-renderer');
      if (activeRenderer) {
        const v = activeRenderer.querySelector('video');
        if (v) return v;
      }
      return document.querySelector('video');
    }
    isCommentsOpen() {
      const commentsPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]');
      if (commentsPanel && commentsPanel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') return true;
      return !!(document.querySelector('ytd-comments#comments:not([hidden])'));
    }
    scrollToNext() {
      const nextBtn = document.querySelector('#navigation-button-down button') || document.querySelector('ytd-reel-video-renderer[is-active] #navigation-button-down button');
      if (nextBtn) { nextBtn.click(); return; }
      const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
    }
    scrollToPrevious() {
      const prevBtn = document.querySelector('#navigation-button-up button') || document.querySelector('ytd-reel-video-renderer[is-active] #navigation-button-up button');
      if (prevBtn) { prevBtn.click(); return; }
      const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', bubbles: true, cancelable: true };
      (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    }
  }

  class GenericAdapter extends BaseAdapter {
    constructor() { super(); this.id = 'generic'; this.name = 'Web Page'; }
    static matches(url) { return true; }
  }

  // --- 3. Platform Manager ---
  class PlatformManager {
    constructor() {
      this.adapters = [TikTokAdapter, InstagramAdapter, FacebookAdapter, YouTubeAdapter, GenericAdapter];
      this.activeAdapter = null;
      this.onPlatformChangeCallback = null;
      this.initUrlObserver();
    }
    detectPlatform() {
      const url = window.location.href;
      const MatchedClass = this.adapters.find(A => A.id !== 'generic' && A.matches(url)) || GenericAdapter;
      if (!this.activeAdapter || this.activeAdapter.constructor !== MatchedClass) {
        if (this.activeAdapter) this.activeAdapter.cleanup();
        this.activeAdapter = new MatchedClass();
        if (typeof this.onPlatformChangeCallback === 'function') {
          this.onPlatformChangeCallback(this.activeAdapter);
        }
      }
      return this.activeAdapter;
    }
    getActiveAdapter() {
      return this.activeAdapter || this.detectPlatform();
    }
    onPlatformChange(cb) { this.onPlatformChangeCallback = cb; }
    initUrlObserver() {
      let lastUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          this.detectPlatform();
        }
      }, 1000);
    }
  }

  // --- 4. Scroll Engine ---
  class ScrollEngine {
    constructor(platformManager) {
      this.platformManager = platformManager;
      this.isRunning = false;
      this.settings = {
        scrollSpeed: 50,
        autoAdvanceDelay: 0.5,
        pauseOnHover: false,
        pauseOnComments: true,
        autoUnmute: false,
        loopCount: 1,
        autoHideOverlay: false
      };
      this.animationFrameId = null;
      this.lastTimestamp = null;
      this.userInteracting = false;
      this.interactionTimeout = null;
      this.isMouseHovered = false;
      this.initInteractionListeners();
    }
    updateSettings(s) {
      if (!s) return;
      this.settings = {
        scrollSpeed: Number.isFinite(s.scrollSpeed) ? s.scrollSpeed : (this.settings.scrollSpeed || 50),
        autoAdvanceDelay: Number.isFinite(s.autoAdvanceDelay) ? s.autoAdvanceDelay : (this.settings.autoAdvanceDelay || 0.5),
        pauseOnHover: typeof s.pauseOnHover === 'boolean' ? s.pauseOnHover : this.settings.pauseOnHover,
        pauseOnComments: typeof s.pauseOnComments === 'boolean' ? s.pauseOnComments : this.settings.pauseOnComments,
        autoUnmute: typeof s.autoUnmute === 'boolean' ? s.autoUnmute : this.settings.autoUnmute,
        loopCount: Number.isFinite(s.loopCount) ? parseInt(s.loopCount, 10) : (this.settings.loopCount || 1),
        autoHideOverlay: typeof s.autoHideOverlay === 'boolean' ? s.autoHideOverlay : this.settings.autoHideOverlay
      };
      const adapter = this.platformManager.getActiveAdapter();
      if (adapter) {
        if (typeof adapter.setLoopCount === 'function') adapter.setLoopCount(this.settings.loopCount);
        if (typeof adapter.setAutoUnmute === 'function') adapter.setAutoUnmute(this.settings.autoUnmute);
      }
    }
    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      chrome.storage.sync.set({ isEnabled: true });
      const adapter = this.platformManager.getActiveAdapter();
      if (adapter.id === 'generic') {
        this.startContinuousScroll();
      } else {
        if (typeof adapter.setLoopCount === 'function') adapter.setLoopCount(this.settings.loopCount);
        if (typeof adapter.setAutoUnmute === 'function') adapter.setAutoUnmute(this.settings.autoUnmute);
        this.startVideoEndObserve();
      }
    }
    stop() {
      this.isRunning = false;
      chrome.storage.sync.set({ isEnabled: false });
      if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
      const adapter = this.platformManager.getActiveAdapter();
      if (adapter) adapter.cleanup();
    }
    toggle() {
      if (this.isRunning) this.stop(); else this.start();
      return this.isRunning;
    }
    startVideoEndObserve() {
      const checkAndAttach = () => {
        if (!this.isRunning) return;
        const adapter = this.platformManager.getActiveAdapter();
        adapter.observeVideoEnded(() => this.handleVideoEnded());
        setTimeout(() => { if (this.isRunning) checkAndAttach(); }, 1000);
      };
      checkAndAttach();
    }
    handleVideoEnded() {
      if (!this.isRunning) return;
      const adapter = this.platformManager.getActiveAdapter();
      if (this.settings.pauseOnComments && adapter.isCommentsOpen()) return;
      if (this.settings.pauseOnHover && this.isMouseHovered) return;
      const delayMs = (this.settings.autoAdvanceDelay ?? 0.5) * 1000;
      setTimeout(() => {
        if (this.isRunning) adapter.scrollToNext();
      }, delayMs);
    }
    startContinuousScroll() {
      this.lastTimestamp = performance.now();
      const scrollStep = (timestamp) => {
        if (!this.isRunning) return;
        const delta = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        const adapter = this.platformManager.getActiveAdapter();
        if (adapter.id !== 'generic') {
          this.stop(); this.start(); return;
        }
        if (!this.userInteracting && (!this.settings.pauseOnHover || !this.isMouseHovered)) {
          const speed = this.settings.scrollSpeed || 50;
          const px = speed * delta;
          if (Number.isFinite(px) && px > 0) window.scrollBy(0, px);
        }
        this.animationFrameId = requestAnimationFrame(scrollStep);
      };
      this.animationFrameId = requestAnimationFrame(scrollStep);
    }
    initInteractionListeners() {
      const handleAction = () => {
        if (!this.isRunning) return;
        this.userInteracting = true;
        clearTimeout(this.interactionTimeout);
        this.interactionTimeout = setTimeout(() => { this.userInteracting = false; }, 2000);
      };
      window.addEventListener('wheel', handleAction, { passive: true });
      window.addEventListener('touchmove', handleAction, { passive: true });
      document.addEventListener('mouseenter', () => { this.isMouseHovered = true; }, true);
      document.addEventListener('mouseleave', () => { this.isMouseHovered = false; }, true);
    }
  }

  // --- 5. UI Controller & Draggable Overlay ---

  let platformManager = new PlatformManager();
  let scrollEngine = new ScrollEngine(platformManager);

  let overlayContainer = null;
  let playBtn = null;
  let statusDot = null;
  let badgeText = null;
  let loopChip = null;
  let drawer = null;
  let fadeTimeout = null;

  function createOverlayUI(savedPos) {
    if (document.getElementById('autoscroll-overlay-container')) return;
    if (!document.body) return;

    overlayContainer = document.createElement('div');
    overlayContainer.id = 'autoscroll-overlay-container';

    // Restore saved drag position if available
    if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
      overlayContainer.style.left = `${savedPos.left}px`;
      overlayContainer.style.top = `${savedPos.top}px`;
      overlayContainer.style.right = 'auto';
      overlayContainer.style.bottom = 'auto';
    }

    overlayContainer.innerHTML = `
      <div class="autoscroll-drawer" id="autoscroll-drawer">
        <div class="autoscroll-drawer-title">Auto Scroll Controls</div>
        
        <div class="autoscroll-field">
          <div class="autoscroll-field-label">
            <span>Scroll Speed</span>
            <span id="speed-val">50 px/s</span>
          </div>
          <input type="range" id="speed-slider" class="autoscroll-slider" min="10" max="300" value="50">
        </div>

        <div class="autoscroll-field">
          <div class="autoscroll-field-label">
            <span>Video Delay</span>
            <span id="delay-val">0.5s</span>
          </div>
          <input type="range" id="delay-slider" class="autoscroll-slider" min="0" max="5" step="0.5" value="0.5">
        </div>

        <div class="autoscroll-field">
          <div class="autoscroll-field-label">
            <span>Loop Video Count</span>
          </div>
          <div class="autoscroll-loop-row">
            <button class="autoscroll-loop-btn active" data-loop="1">1x</button>
            <button class="autoscroll-loop-btn" data-loop="2">2x</button>
            <button class="autoscroll-loop-btn" data-loop="3">3x</button>
            <button class="autoscroll-loop-btn" data-loop="5">5x</button>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 4px;">
          <span>Auto-Unmute Videos</span>
          <input type="checkbox" id="unmute-drawer-toggle" style="accent-color:#3742fa; cursor:pointer;">
        </div>
      </div>

      <div class="autoscroll-pill" id="autoscroll-pill">
        <div class="autoscroll-drag-handle" id="autoscroll-drag" title="Drag to move">⋮⋮</div>
        <div class="autoscroll-badge">
          <span class="autoscroll-status-dot" id="autoscroll-dot"></span>
          <span id="autoscroll-badge-text">Web</span>
        </div>
        <span class="autoscroll-loop-chip" id="autoscroll-loop-chip" title="Click to change loop count">1x</span>
        <button class="autoscroll-btn" id="autoscroll-prev-btn" title="Previous">▲</button>
        <button class="autoscroll-btn autoscroll-play-btn" id="autoscroll-play-btn" title="Toggle Auto Scroll (Alt+S)">▶</button>
        <button class="autoscroll-btn" id="autoscroll-next-btn" title="Next">▼</button>
        <button class="autoscroll-btn" id="autoscroll-settings-btn" title="Settings">⚙</button>
      </div>
    `;

    document.body.appendChild(overlayContainer);

    playBtn = document.getElementById('autoscroll-play-btn');
    statusDot = document.getElementById('autoscroll-dot');
    badgeText = document.getElementById('autoscroll-badge-text');
    loopChip = document.getElementById('autoscroll-loop-chip');
    drawer = document.getElementById('autoscroll-drawer');

    // Button event listeners
    playBtn.addEventListener('click', () => {
      const active = scrollEngine.toggle();
      updateUIState(active);
    });

    document.getElementById('autoscroll-next-btn').addEventListener('click', () => {
      platformManager.getActiveAdapter().scrollToNext();
    });

    document.getElementById('autoscroll-prev-btn').addEventListener('click', () => {
      platformManager.getActiveAdapter().scrollToPrevious();
    });

    document.getElementById('autoscroll-settings-btn').addEventListener('click', () => {
      drawer.classList.toggle('open');
    });

    // Quick Loop Count cycling from pill chip
    const loopOptions = [1, 2, 3, 5];
    loopChip.addEventListener('click', () => {
      const current = scrollEngine.settings.loopCount || 1;
      const nextIdx = (loopOptions.indexOf(current) + 1) % loopOptions.length;
      const nextVal = loopOptions[nextIdx];
      updateLoopCount(nextVal);
    });

    // Loop buttons in drawer
    drawer.querySelectorAll('.autoscroll-loop-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.loop, 10);
        updateLoopCount(val);
      });
    });

    function updateLoopCount(val) {
      scrollEngine.updateSettings({ loopCount: val });
      chrome.storage.sync.set({ loopCount: val });
      if (loopChip) loopChip.textContent = `${val}x`;
      drawer.querySelectorAll('.autoscroll-loop-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.loop, 10) === val);
      });
    }

    // Auto-Unmute toggle in drawer
    const unmuteToggle = document.getElementById('unmute-drawer-toggle');
    unmuteToggle.checked = !!scrollEngine.settings.autoUnmute;
    unmuteToggle.addEventListener('change', (e) => {
      scrollEngine.updateSettings({ autoUnmute: e.target.checked });
      chrome.storage.sync.set({ autoUnmute: e.target.checked });
    });

    // Sliders
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      speedVal.textContent = `${val} px/s`;
      scrollEngine.updateSettings({ scrollSpeed: val });
      chrome.storage.sync.set({ scrollSpeed: val });
    });

    const delaySlider = document.getElementById('delay-slider');
    const delayVal = document.getElementById('delay-val');
    delaySlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      delayVal.textContent = `${val}s`;
      scrollEngine.updateSettings({ autoAdvanceDelay: val });
      chrome.storage.sync.set({ autoAdvanceDelay: val });
    });

    // Drag-and-drop mechanism
    initDraggable();

    // Auto-hide / fade listener
    initAutoHideListener();

    updateBadge();
    updateUIState(scrollEngine.isRunning);
    if (loopChip) loopChip.textContent = `${scrollEngine.settings.loopCount || 1}x`;
  }

  function initDraggable() {
    const dragHandle = document.getElementById('autoscroll-drag');
    if (!dragHandle) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = overlayContainer.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      overlayContainer.style.bottom = 'auto';
      overlayContainer.style.right = 'auto';
      overlayContainer.style.left = `${origLeft}px`;
      overlayContainer.style.top = `${origTop}px`;
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = origLeft + dx;
        let newTop = origTop + dy;

        // Clamp inside window boundaries
        const w = overlayContainer.offsetWidth;
        const h = overlayContainer.offsetHeight;
        newLeft = Math.max(10, Math.min(window.innerWidth - w - 10, newLeft));
        newTop = Math.max(10, Math.min(window.innerHeight - h - 10, newTop));

        overlayContainer.style.left = `${newLeft}px`;
        overlayContainer.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Save position
        const rect = overlayContainer.getBoundingClientRect();
        chrome.storage.sync.set({
          widgetPosition: { left: Math.round(rect.left), top: Math.round(rect.top) }
        });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  function initAutoHideListener() {
    const resetFadeTimer = () => {
      if (!overlayContainer) return;
      overlayContainer.classList.remove('autoscroll-faded');
      clearTimeout(fadeTimeout);

      if (scrollEngine.settings.autoHideOverlay) {
        fadeTimeout = setTimeout(() => {
          if (overlayContainer && !drawer.classList.contains('open')) {
            overlayContainer.classList.add('autoscroll-faded');
          }
        }, 3000);
      }
    };

    window.addEventListener('mousemove', resetFadeTimer, { passive: true });
    resetFadeTimer();
  }

  function updateBadge() {
    const adapter = platformManager.detectPlatform();
    if (badgeText) {
      badgeText.textContent = adapter.name;
    }
  }

  function updateUIState(isRunning) {
    if (playBtn) {
      if (isRunning) {
        playBtn.textContent = '❚❚';
        playBtn.classList.add('active');
        statusDot.classList.add('active');
      } else {
        playBtn.textContent = '▶';
        playBtn.classList.remove('active');
        statusDot.classList.remove('active');
      }
    }
  }

  function safeInitOverlay(pos) {
    if (document.body) {
      createOverlayUI(pos);
    } else {
      document.addEventListener('DOMContentLoaded', () => createOverlayUI(pos));
    }
  }

  chrome.storage.sync.get([
    'scrollSpeed', 'autoAdvanceDelay', 'showOverlay', 'pauseOnHover',
    'pauseOnComments', 'isEnabled', 'autoUnmute', 'loopCount',
    'autoHideOverlay', 'widgetPosition'
  ], (res) => {
    if (res) {
      scrollEngine.updateSettings(res);
      if (res.showOverlay !== false) {
        safeInitOverlay(res.widgetPosition);
      }
      if (res.isEnabled === true) {
        scrollEngine.start();
        updateUIState(true);
      }
    } else {
      safeInitOverlay();
    }
  });

  platformManager.onPlatformChange((newAdapter) => {
    updateBadge();
    if (scrollEngine.isRunning) {
      scrollEngine.stop();
      scrollEngine.start();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TOGGLE_AUTO_SCROLL') {
      const isRunning = scrollEngine.toggle();
      updateUIState(isRunning);
      sendResponse({ isRunning, platform: platformManager.getActiveAdapter().name });
    } else if (request.action === 'GET_STATUS') {
      sendResponse({
        isRunning: scrollEngine.isRunning,
        platform: platformManager.getActiveAdapter().name,
        adapterId: platformManager.getActiveAdapter().id,
        loopCount: scrollEngine.settings.loopCount,
        autoUnmute: scrollEngine.settings.autoUnmute,
        autoHideOverlay: scrollEngine.settings.autoHideOverlay
      });
    } else if (request.action === 'UPDATE_SETTINGS') {
      scrollEngine.updateSettings(request.settings);
      if (loopChip && request.settings.loopCount) loopChip.textContent = `${request.settings.loopCount}x`;
      sendResponse({ success: true });
    }
    return true;
  });

})();
