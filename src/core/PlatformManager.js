/**
 * Platform Manager - Auto Detection & Adapter Registry
 */
class PlatformManager {
  constructor() {
    this.adapters = [];
    this.activeAdapter = null;
    this.onPlatformChangeCallback = null;
    this.currentUrl = window.location.href;
    
    this.initUrlObserver();
  }

  /**
   * Register a new platform adapter
   * @param {typeof BaseAdapter} AdapterClass 
   */
  registerAdapter(AdapterClass) {
    this.adapters.push(AdapterClass);
  }

  /**
   * Automatically detect and instantiate matching adapter for current URL
   * @returns {BaseAdapter}
   */
  detectPlatform() {
    const url = window.location.href;
    
    // Find matching adapter class (excluding GenericAdapter fallback initially)
    const MatchedClass = this.adapters.find(Adapter => Adapter.id !== 'generic' && Adapter.matches(url)) ||
                         this.adapters.find(Adapter => Adapter.id === 'generic');

    if (!this.activeAdapter || this.activeAdapter.constructor !== MatchedClass) {
      if (this.activeAdapter) {
        this.activeAdapter.cleanup();
      }
      this.activeAdapter = new MatchedClass();
      
      if (typeof this.onPlatformChangeCallback === 'function') {
        this.onPlatformChangeCallback(this.activeAdapter);
      }
    }

    return this.activeAdapter;
  }

  /**
   * Get currently active platform adapter instance
   * @returns {BaseAdapter}
   */
  getActiveAdapter() {
    if (!this.activeAdapter) {
      return this.detectPlatform();
    }
    return this.activeAdapter;
  }

  /**
   * Set callback listener for platform changes
   * @param {Function} callback 
   */
  onPlatformChange(callback) {
    this.onPlatformChangeCallback = callback;
  }

  /**
   * Observer for SPA navigation changes (TikTok, IG, YT, FB use dynamic routing)
   */
  initUrlObserver() {
    let lastUrl = window.location.href;

    // Polling / MutationObserver for SPA URL changes
    const checkUrl = () => {
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        this.detectPlatform();
      }
    };

    setInterval(checkUrl, 1000);

    window.addEventListener('popstate', checkUrl);
  }
}
