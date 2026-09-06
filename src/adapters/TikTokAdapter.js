/**
 * TikTok Platform Adapter
 */
class TikTokAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'tiktok';
    this.name = 'TikTok';
  }

  static matches(url) {
    return url.includes('tiktok.com');
  }

  unmuteVideo() {
    super.unmuteVideo();
    const muteBtn = document.querySelector('[data-e2e="video-sound-mute"], [aria-label*="unmute" i]');
    if (muteBtn) {
      muteBtn.click();
    }
  }

  getVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    return videos.find(v => !v.paused && v.readyState > 2) || videos[0];
  }

  isCommentsOpen() {
    return !!(
      document.querySelector('[data-e2e="comment-list"]') ||
      document.querySelector('[class*="DivCommentListContainer"]') ||
      document.querySelector('[class*="CommentContainer"]')
    );
  }

  scrollToNext() {
    const nextBtn = document.querySelector('[data-e2e="arrow-right"]') ||
                    document.querySelector('[aria-label="Next video"]') ||
                    document.querySelector('button[class*="ButtonControlDown"]');
    if (nextBtn) {
      nextBtn.click();
      return;
    }

    const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', which: 40, bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true }));
  }

  scrollToPrevious() {
    const prevBtn = document.querySelector('[data-e2e="arrow-left"]') ||
                    document.querySelector('[aria-label="Previous video"]') ||
                    document.querySelector('button[class*="ButtonControlUp"]');
    if (prevBtn) {
      prevBtn.click();
      return;
    }

    const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', which: 38, bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true }));
  }
}
