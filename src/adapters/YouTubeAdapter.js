/**
 * YouTube Shorts Platform Adapter
 */
class YouTubeAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'youtube';
    this.name = 'YT Shorts';
  }

  static matches(url) {
    return url.includes('youtube.com/shorts');
  }

  unmuteVideo() {
    super.unmuteVideo();
    const muteBtn = document.querySelector('#volume-button button, ytd-reel-video-renderer[is-active] #volume-button button, button[aria-label*="Unmute" i]');
    if (muteBtn && (muteBtn.getAttribute('aria-label') || '').toLowerCase().includes('unmute')) {
      muteBtn.click();
    }
  }

  getVideoElement() {
    const activeRenderer = document.querySelector('ytd-reel-video-renderer[is-active]') ||
                           document.querySelector('ytd-reel-video-renderer');
    if (activeRenderer) {
      const video = activeRenderer.querySelector('video');
      if (video) return video;
    }
    return document.querySelector('video');
  }

  isCommentsOpen() {
    const commentsPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]');
    if (commentsPanel && commentsPanel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
      return true;
    }
    return !!(document.querySelector('ytd-comments#comments:not([hidden])'));
  }

  scrollToNext() {
    const nextBtn = document.querySelector('#navigation-button-down button') ||
                    document.querySelector('ytd-reel-video-renderer[is-active] #navigation-button-down button');
    if (nextBtn) {
      nextBtn.click();
      return;
    }

    const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
  }

  scrollToPrevious() {
    const prevBtn = document.querySelector('#navigation-button-up button') ||
                    document.querySelector('ytd-reel-video-renderer[is-active] #navigation-button-up button');
    if (prevBtn) {
      prevBtn.click();
      return;
    }

    const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
  }
}
