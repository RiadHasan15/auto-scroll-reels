/**
 * Instagram Reels Platform Adapter
 */
class InstagramAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'instagram';
    this.name = 'IG Reels';
  }

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

    // 1. Prioritize currently playing video
    const playing = videos.find(v => !v.paused && v.currentTime > 0);
    if (playing) return playing;

    // 2. Otherwise find video closest to viewport vertical center
    const center = window.innerHeight / 2;
    let closest = videos[0];
    let minDist = Infinity;
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const vCenter = rect.top + rect.height / 2;
      const dist = Math.abs(vCenter - center);
      if (dist < minDist) {
        minDist = dist;
        closest = v;
      }
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
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    });

    if (currentVideo) currentVideo.dispatchEvent(keyEvent);
    if (scrollContainer && scrollContainer.dispatchEvent) scrollContainer.dispatchEvent(keyEvent);
    document.dispatchEvent(keyEvent);
    window.dispatchEvent(keyEvent);

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: scrollHeight,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    });
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
      key: 'ArrowUp',
      code: 'ArrowUp',
      keyCode: 38,
      which: 38,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    });

    if (currentVideo) currentVideo.dispatchEvent(keyEvent);
    if (scrollContainer && scrollContainer.dispatchEvent) scrollContainer.dispatchEvent(keyEvent);
    document.dispatchEvent(keyEvent);
    window.dispatchEvent(keyEvent);
  }
}
