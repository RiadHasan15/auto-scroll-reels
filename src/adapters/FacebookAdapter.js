/**
 * Facebook Reels Platform Adapter
 */
class FacebookAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'facebook';
    this.name = 'FB Reels';
  }

  static matches(url) {
    return url.includes('facebook.com/reel') ||
           url.includes('facebook.com/reels') ||
           (url.includes('facebook.com/watch') && document.querySelector('[aria-label*="Reel"]'));
  }

  getVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    return videos.find(v => {
      const rect = v.getBoundingClientRect();
      return rect.top >= -50 && rect.top <= window.innerHeight / 2 && rect.height > 200;
    }) || videos[0];
  }

  isCommentsOpen() {
    return !!(
      document.querySelector('[data-pagelet="ReelsComments"]') ||
      document.querySelector('[aria-label="Write a comment..."]') ||
      document.querySelector('[aria-label="Leave a comment"]')
    );
  }

  scrollToNext() {
    // Strategy 1: Click next reel button
    const nextBtn = document.querySelector('[aria-label="Next Reel"]') ||
                    document.querySelector('[aria-label="Next video"]') ||
                    document.querySelector('div[aria-label="Next"]');
    if (nextBtn) {
      nextBtn.click();
      return;
    }

    // Strategy 2: Keyboard & Wheel event
    const eventInit = { key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));

    // Strategy 3: Window scroll
    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
  }

  scrollToPrevious() {
    const prevBtn = document.querySelector('[aria-label="Previous Reel"]') ||
                    document.querySelector('[aria-label="Previous video"]');
    if (prevBtn) {
      prevBtn.click();
      return;
    }

    const eventInit = { key: 'ArrowUp', keyCode: 38, code: 'ArrowUp', bubbles: true, cancelable: true };
    (document.activeElement || document.body || window).dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
  }
}
