/**
 * Main Auto-Scroll Engine
 * Orchestrates continuous smooth scrolling, video end auto-advance,
 * and production-grade niche filtering & fast-skipping.
 */
class ScrollEngine {
  constructor(platformManager, filterEngine = null) {
    this.platformManager = platformManager;
    this.filterEngine = filterEngine || new FilterEngine();
    this.isRunning = false;
    this.isSkipping = false;
    this.lastEvaluatedVideo = null;
    this.onStatusUpdateCallback = null;

    this.settings = {
      scrollSpeed: 50,
      autoAdvanceDelay: 0.5,
      pauseOnHover: false,
      pauseOnComments: true,
      autoUnmute: false,
      loopCount: 1,
      filterSettings: {
        enabled: false,
        mode: 'disabled',
        keywords: [],
        blacklist: [],
        maxConsecutiveSkips: 15,
        skipDelayMs: 300,
        muteWhileSkipping: true
      }
    };

    this.animationFrameId = null;
    this.lastTimestamp = null;
    this.userInteracting = false;
    this.interactionTimeout = null;
    this.isMouseHovered = false;

    this.initInteractionListeners();
  }

  onStatusUpdate(callback) {
    this.onStatusUpdateCallback = callback;
  }

  updateSettings(newSettings) {
    if (!newSettings) return;
    this.settings = {
      scrollSpeed: Number.isFinite(newSettings.scrollSpeed) ? newSettings.scrollSpeed : (this.settings.scrollSpeed || 50),
      autoAdvanceDelay: Number.isFinite(newSettings.autoAdvanceDelay) ? newSettings.autoAdvanceDelay : (this.settings.autoAdvanceDelay || 0.5),
      pauseOnHover: typeof newSettings.pauseOnHover === 'boolean' ? newSettings.pauseOnHover : this.settings.pauseOnHover,
      pauseOnComments: typeof newSettings.pauseOnComments === 'boolean' ? newSettings.pauseOnComments : this.settings.pauseOnComments,
      autoUnmute: typeof newSettings.autoUnmute === 'boolean' ? newSettings.autoUnmute : this.settings.autoUnmute,
      loopCount: Number.isFinite(newSettings.loopCount) ? parseInt(newSettings.loopCount, 10) : (this.settings.loopCount || 1),
      filterSettings: newSettings.filterSettings ? { ...this.settings.filterSettings, ...newSettings.filterSettings } : this.settings.filterSettings
    };

    if (this.filterEngine) {
      this.filterEngine.updateConfig(this.settings.filterSettings);
    }

    const adapter = this.platformManager.getActiveAdapter();
    if (adapter) {
      if (typeof adapter.setLoopCount === 'function') adapter.setLoopCount(this.settings.loopCount);
      if (typeof adapter.setAutoUnmute === 'function') adapter.setAutoUnmute(this.settings.autoUnmute);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isSkipping = false;
    this.lastEvaluatedVideo = null;
    this.filterEngine.resetCircuit();

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
    this.isSkipping = false;
    chrome.storage.sync.set({ isEnabled: false });

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const adapter = this.platformManager.getActiveAdapter();
    if (adapter) {
      adapter.cleanup();
    }
  }

  toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
    return this.isRunning;
  }

  startVideoEndObserve() {
    const adapter = this.platformManager.getActiveAdapter();
    if (!adapter) return;

    const checkAndAttach = () => {
      if (!this.isRunning) return;

      adapter.observeVideoEnded(() => {
        this.handleVideoEnded();
      });

      // Check for active video switch to trigger Niche Filter evaluation
      const currentVideo = adapter.getVideoElement();
      if (currentVideo && currentVideo !== this.lastEvaluatedVideo) {
        this.lastEvaluatedVideo = currentVideo;
        this.evaluateActiveVideo(adapter, currentVideo);
      }

      setTimeout(() => {
        if (this.isRunning) checkAndAttach();
      }, 500);
    };

    checkAndAttach();
  }

  async evaluateActiveVideo(adapter, video) {
    if (!this.isRunning || !this.filterEngine.enabled || this.filterEngine.mode === 'disabled') {
      return;
    }

    const originalMuted = video.muted;
    if (this.filterEngine.muteWhileSkipping) {
      video.muted = true;
    }

    if (typeof this.onStatusUpdateCallback === 'function') {
      this.onStatusUpdateCallback({ status: 'evaluating', text: 'Scanning reel...' });
    }

    // Wait up to 250ms for asynchronous React description hydration
    const metadata = await adapter.waitForMetadata(250);

    // Abort if user scrolled away or stopped while evaluating
    if (!this.isRunning || adapter.getVideoElement() !== video) {
      return;
    }

    const result = this.filterEngine.evaluate(metadata);

    if (result.pass) {
      // MATCHED! Keep video playing
      this.filterEngine.recordMatch();
      this.isSkipping = false;

      if (this.settings.autoUnmute) {
        adapter.unmuteVideo();
      } else {
        video.muted = originalMuted;
      }

      if (typeof this.onStatusUpdateCallback === 'function') {
        this.onStatusUpdateCallback({
          status: 'matched',
          keyword: result.matchedKeyword,
          text: result.matchedKeyword ? `🎯 Matched: ${result.matchedKeyword}` : '🎯 Niche matched'
        });
      }
    } else {
      // REJECTED -> SKIP!
      this.isSkipping = true;
      const breaker = this.filterEngine.recordSkip();

      if (breaker.isTripped) {
        // Circuit breaker tripped! Halt to prevent infinite scrolling
        this.stop();
        if (typeof this.onStatusUpdateCallback === 'function') {
          this.onStatusUpdateCallback({
            status: 'tripped',
            skips: breaker.consecutiveSkips,
            text: `⚠️ Paused: ${breaker.consecutiveSkips} skips without match`
          });
        }
        return;
      }

      if (typeof this.onStatusUpdateCallback === 'function') {
        this.onStatusUpdateCallback({
          status: 'skipping',
          reason: result.reason,
          skips: breaker.consecutiveSkips,
          text: `⏭️ Skipping non-niche (${breaker.consecutiveSkips}/${breaker.max})`
        });
      }

      // Paced skip execution
      setTimeout(() => {
        if (this.isRunning && this.isSkipping) {
          adapter.scrollToNext();
        }
      }, this.filterEngine.skipDelayMs);
    }
  }

  handleVideoEnded() {
    if (!this.isRunning || this.isSkipping) return;

    const adapter = this.platformManager.getActiveAdapter();

    if (this.settings.pauseOnComments && adapter.isCommentsOpen()) {
      return;
    }

    if (this.settings.pauseOnHover && this.isMouseHovered) {
      return;
    }

    const delayMs = (this.settings.autoAdvanceDelay ?? 0.5) * 1000;

    setTimeout(() => {
      if (this.isRunning && !this.isSkipping) {
        adapter.scrollToNext();
      }
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
        this.stop();
        this.start();
        return;
      }

      if (!this.userInteracting && (!this.settings.pauseOnHover || !this.isMouseHovered)) {
        const speed = this.settings.scrollSpeed || 50;
        const pixelsToScroll = speed * delta;
        if (Number.isFinite(pixelsToScroll) && pixelsToScroll > 0) {
          window.scrollBy(0, pixelsToScroll);
        }
      }

      this.animationFrameId = requestAnimationFrame(scrollStep);
    };

    this.animationFrameId = requestAnimationFrame(scrollStep);
  }

  initInteractionListeners() {
    const handleUserAction = () => {
      if (!this.isRunning) return;
      this.userInteracting = true;

      clearTimeout(this.interactionTimeout);
      this.interactionTimeout = setTimeout(() => {
        this.userInteracting = false;
      }, 2000);
    };

    window.addEventListener('wheel', handleUserAction, { passive: true });
    window.addEventListener('touchmove', handleUserAction, { passive: true });

    document.addEventListener('mouseenter', () => { this.isMouseHovered = true; }, true);
    document.addEventListener('mouseleave', () => { this.isMouseHovered = false; }, true);
  }
}
