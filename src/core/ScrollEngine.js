/**
 * Main Auto-Scroll Engine
 */
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
      loopCount: 1
    };

    this.animationFrameId = null;
    this.lastTimestamp = null;
    this.userInteracting = false;
    this.interactionTimeout = null;
    this.isMouseHovered = false;

    this.initInteractionListeners();
  }

  updateSettings(newSettings) {
    if (!newSettings) return;
    this.settings = {
      scrollSpeed: Number.isFinite(newSettings.scrollSpeed) ? newSettings.scrollSpeed : (this.settings.scrollSpeed || 50),
      autoAdvanceDelay: Number.isFinite(newSettings.autoAdvanceDelay) ? newSettings.autoAdvanceDelay : (this.settings.autoAdvanceDelay || 0.5),
      pauseOnHover: typeof newSettings.pauseOnHover === 'boolean' ? newSettings.pauseOnHover : this.settings.pauseOnHover,
      pauseOnComments: typeof newSettings.pauseOnComments === 'boolean' ? newSettings.pauseOnComments : this.settings.pauseOnComments,
      autoUnmute: typeof newSettings.autoUnmute === 'boolean' ? newSettings.autoUnmute : this.settings.autoUnmute,
      loopCount: Number.isFinite(newSettings.loopCount) ? parseInt(newSettings.loopCount, 10) : (this.settings.loopCount || 1)
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

      setTimeout(() => {
        if (this.isRunning) checkAndAttach();
      }, 1000);
    };

    checkAndAttach();
  }

  handleVideoEnded() {
    if (!this.isRunning) return;

    const adapter = this.platformManager.getActiveAdapter();

    if (this.settings.pauseOnComments && adapter.isCommentsOpen()) {
      return;
    }

    if (this.settings.pauseOnHover && this.isMouseHovered) {
      return;
    }

    const delayMs = (this.settings.autoAdvanceDelay ?? 0.5) * 1000;

    setTimeout(() => {
      if (this.isRunning) {
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
