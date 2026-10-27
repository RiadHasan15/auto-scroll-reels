/**
 * Abstract Base Class for Platform Adapters
 */
class BaseAdapter {
  constructor() {
    this.id = 'generic';
    this.name = 'Generic Web Page';
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

  static matches(url) {
    return false;
  }

  setLoopCount(count) {
    this.targetLoopCount = Math.max(1, parseInt(count, 10) || 1);
  }

  setAutoUnmute(enabled) {
    this.autoUnmute = !!enabled;
    if (this.autoUnmute && this.currentVideo) {
      this.unmuteVideo();
    }
  }

  unmuteVideo() {
    const video = this.getVideoElement();
    if (video) {
      video.muted = false;
      video.volume = 1.0;
    }
  }

  getVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    
    const playing = videos.find(v => !v.paused && v.currentTime > 0);
    if (playing) return playing;

    return videos.find(v => {
      const rect = v.getBoundingClientRect();
      return rect.height > 100 && rect.top >= -rect.height / 2 && rect.top <= window.innerHeight;
    }) || videos[0];
  }

  isCommentsOpen() {
    return false;
  }

  getMetadata() {
    return {
      caption: '',
      hashtags: [],
      audio: '',
      author: '',
      fullText: ''
    };
  }

  async waitForMetadata(maxWaitMs = 250) {
    const meta = this.getMetadata();
    if (meta.fullText && meta.fullText.length > 5) {
      return meta;
    }
    const start = Date.now();
    return new Promise(resolve => {
      const interval = setInterval(() => {
        const m = this.getMetadata();
        if ((m.fullText && m.fullText.length > 5) || Date.now() - start >= maxWaitMs) {
          clearInterval(interval);
          resolve(m);
        }
      }, 50);
    });
  }

  scrollToNext() {
    window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
  }

  scrollToPrevious() {
    window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
  }

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
    console.log(`[Auto-Scroll] Loop completed: ${this.currentLoopCount}/${this.targetLoopCount}`);

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

    // Detect near-end (within 0.45s) or loop wrap-around
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
