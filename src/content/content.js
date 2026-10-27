/**
 * Content Script - Auto Scroll Extension
 * Production-Grade Short-Form Video & Web Auto-Scroller with Niche Filtering.
 */
(function () {
  if (window.__AUTO_SCROLL_INJECTED__) return;
  window.__AUTO_SCROLL_INJECTED__ = true;

  // ==========================================
  // 1. FILTER ENGINE
  // ==========================================

  class FilterEngine {
    constructor(options = {}) {
      this.updateConfig(options);
      this.consecutiveSkips = 0;
      this.maxConsecutiveSkips = options.maxConsecutiveSkips || 15;
      this.skipDelayMs = options.skipDelayMs || 300;
      this.muteWhileSkipping = options.muteWhileSkipping !== false;
      this.lastEvaluation = null;
    }

    updateConfig(options = {}) {
      this.enabled = !!options.enabled;
      this.mode = options.mode || 'disabled'; // 'disabled' | 'whitelist' | 'blacklist'
      this.rawKeywords = Array.isArray(options.keywords) ? options.keywords : [];
      this.rawBlacklist = Array.isArray(options.blacklist) ? options.blacklist : [];
      this.matchTargets = {
        caption: options.matchTargets?.caption !== false,
        hashtags: options.matchTargets?.hashtags !== false,
        audio: options.matchTargets?.audio !== false,
        author: !!options.matchTargets?.author
      };
      if (options.maxConsecutiveSkips) {
        this.maxConsecutiveSkips = parseInt(options.maxConsecutiveSkips, 10) || 15;
      }
      if (options.skipDelayMs) {
        this.skipDelayMs = parseInt(options.skipDelayMs, 10) || 300;
      }
      if (typeof options.muteWhileSkipping === 'boolean') {
        this.muteWhileSkipping = options.muteWhileSkipping;
      }

      this.compiledKeywords = this._compileRules(this.rawKeywords);
      this.compiledBlacklist = this._compileRules(this.rawBlacklist);
    }

    _compileRules(list) {
      if (!list || !list.length) return [];
      return list
        .map(k => (typeof k === 'string' ? k.trim().toLowerCase() : ''))
        .filter(k => k.length > 0)
        .map(raw => {
          const isHashtag = raw.startsWith('#');
          const clean = raw.replace(/^#/, '');
          const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          let regex;
          if (isHashtag) {
            regex = new RegExp(`(?:^|[\\s.,!?_\\-])#${escaped}(?=[\\s.,!?_\\-]|$)`, 'i');
          } else if (clean.includes(' ')) {
            const phraseRegex = clean
              .split(/\s+/)
              .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('\\s+');
            regex = new RegExp(`(?:^|[\\s.,!?_\\-])${phraseRegex}(?=[\\s.,!?_\\-]|$)`, 'i');
          } else {
            regex = new RegExp(`(?:^|[\\s.,!?_\\-])${escaped}(?=[\\s.,!?_\\-]|$)`, 'i');
          }
          return { raw, regex };
        });
    }

    _buildSearchableCorpus(metadata) {
      if (!metadata) return '';
      const parts = [];
      if (this.matchTargets.caption && metadata.caption) parts.push(metadata.caption);
      if (this.matchTargets.hashtags && Array.isArray(metadata.hashtags)) {
        parts.push(metadata.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' '));
      }
      if (this.matchTargets.audio && metadata.audio) parts.push(metadata.audio);
      if (this.matchTargets.author && metadata.author) parts.push(metadata.author);
      if (!parts.length && metadata.fullText) parts.push(metadata.fullText);
      return parts.join(' ').toLowerCase();
    }

    evaluate(metadata) {
      if (!this.enabled || this.mode === 'disabled') {
        this.lastEvaluation = { pass: true, matchedKeyword: null, reason: 'Filter disabled' };
        return this.lastEvaluation;
      }

      const corpus = this._buildSearchableCorpus(metadata);

      // Check Global Blacklist
      if (this.compiledBlacklist.length > 0) {
        for (const rule of this.compiledBlacklist) {
          if (rule.regex.test(corpus)) {
            this.lastEvaluation = {
              pass: false,
              matchedKeyword: rule.raw,
              reason: `Blacklisted: "${rule.raw}"`
            };
            return this.lastEvaluation;
          }
        }
      }

      // Whitelist Mode
      if (this.mode === 'whitelist') {
        if (!this.compiledKeywords.length) {
          this.lastEvaluation = { pass: true, matchedKeyword: null, reason: 'Whitelist empty' };
          return this.lastEvaluation;
        }

        for (const rule of this.compiledKeywords) {
          if (rule.regex.test(corpus)) {
            this.lastEvaluation = {
              pass: true,
              matchedKeyword: rule.raw,
              reason: `Matched: "${rule.raw}"`
            };
            return this.lastEvaluation;
          }
        }

        this.lastEvaluation = {
          pass: false,
          matchedKeyword: null,
          reason: 'No niche keywords matched'
        };
        return this.lastEvaluation;
      }

      // Blacklist-only Mode
      if (this.mode === 'blacklist') {
        for (const rule of this.compiledKeywords) {
          if (rule.regex.test(corpus)) {
            this.lastEvaluation = {
              pass: false,
              matchedKeyword: rule.raw,
              reason: `Filtered: "${rule.raw}"`
            };
            return this.lastEvaluation;
          }
        }
        this.lastEvaluation = { pass: true, matchedKeyword: null, reason: 'No blacklist terms found' };
        return this.lastEvaluation;
      }

      return { pass: true, matchedKeyword: null, reason: 'Default pass' };
    }

    recordSkip() {
      this.consecutiveSkips++;
      const isTripped = this.consecutiveSkips >= this.maxConsecutiveSkips;
      return {
        consecutiveSkips: this.consecutiveSkips,
        max: this.maxConsecutiveSkips,
        isTripped
      };
    }

    recordMatch() {
      this.consecutiveSkips = 0;
    }

    resetCircuit() {
      this.consecutiveSkips = 0;
    }
  }

  // ==========================================
  // 2. BASE ADAPTER
  // ==========================================

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
    getMetadata() {
      return { caption: '', hashtags: [], audio: '', author: '', fullText: '' };
    }
    async waitForMetadata(maxWaitMs = 250) {
      const meta = this.getMetadata();
      if (meta.fullText && meta.fullText.length > 5) return meta;
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

  // ==========================================
  // 3. PLATFORM ADAPTERS
  // ==========================================

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
    getMetadata() {
      const container = document.querySelector('[data-e2e="recommend-list-item-container"]') || document;
      const descEl = container.querySelector('[data-e2e="video-desc"]');
      const caption = descEl ? descEl.innerText.trim() : '';
      const tags = Array.from(container.querySelectorAll('a[href*="/tag/"]')).map(a => a.innerText.trim());
      const audioEl = container.querySelector('[data-e2e="video-music"]');
      const audio = audioEl ? audioEl.innerText.trim() : '';
      return { caption, hashtags: tags, audio, author: '', fullText: `${caption} ${tags.join(' ')} ${audio}` };
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
    getMetadata() {
      const video = this.getVideoElement();
      if (!video) {
        return { caption: '', hashtags: [], audio: '', author: '', fullText: '' };
      }

      const container = video.closest('article') ||
                        video.closest('section') ||
                        video.closest('div[role="presentation"]') ||
                        video.parentElement.parentElement;

      if (!container) {
        return { caption: '', hashtags: [], audio: '', author: '', fullText: '' };
      }

      let author = '';
      const authorEl = container.querySelector('header a[role="link"], a[href^="/"][role="link"]');
      if (authorEl) author = authorEl.innerText.trim().replace(/^@/, '');

      let audio = '';
      const audioEl = container.querySelector('a[href*="/audio/"], [aria-label*="audio" i], [aria-label*="Original audio" i]');
      if (audioEl) audio = audioEl.innerText.trim();

      const hashtags = [];
      const tagLinks = container.querySelectorAll('a[href*="/explore/tags/"]');
      tagLinks.forEach(a => {
        const tag = a.innerText.trim();
        if (tag) hashtags.push(tag.startsWith('#') ? tag : `#${tag}`);
      });

      const captionSelectors = ['h1', 'span[class*="_a9zs"]', 'div[class*="caption"]', 'span[dir="auto"]'];
      const foundTexts = [];
      container.querySelectorAll(captionSelectors.join(',')).forEach(el => {
        if (el.closest('button') || el.closest('[role="button"]') || el.closest('header')) return;
        const t = el.innerText.trim();
        if (t && t.length > 2 && !foundTexts.includes(t)) foundTexts.push(t);
      });

      const caption = foundTexts.join(' ');
      const regexTags = caption.match(/#[a-zA-Z0-9_\u00C0-\u024F]+/g);
      if (regexTags) {
        regexTags.forEach(t => {
          if (!hashtags.includes(t)) hashtags.push(t);
        });
      }

      const fullText = [caption, hashtags.join(' '), audio, author].filter(Boolean).join(' ');
      return { caption, hashtags, audio, author, fullText };
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
    getMetadata() {
      const renderer = document.querySelector('ytd-reel-video-renderer[is-active]') || document;
      const titleEl = renderer.querySelector('h2.title, #headline');
      const caption = titleEl ? titleEl.innerText.trim() : '';
      const tags = Array.from(renderer.querySelectorAll('a[href*="/hashtag/"]')).map(a => a.innerText.trim());
      const authorEl = renderer.querySelector('#channel-name a, yt-formatted-string.ytd-channel-name');
      const author = authorEl ? authorEl.innerText.trim() : '';
      return { caption, hashtags: tags, audio: '', author, fullText: `${caption} ${tags.join(' ')} ${author}` };
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

  // ==========================================
  // 4. PLATFORM MANAGER
  // ==========================================

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

  // ==========================================
  // 5. SCROLL ENGINE (WITH NICHE FILTERING)
  // ==========================================

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
        autoHideOverlay: false,
        filterSettings: {
          enabled: false,
          mode: 'disabled',
          keywords: ['coding', 'ai', 'tech', 'python'],
          blacklist: ['prank', 'gossip', 'drama'],
          maxConsecutiveSkips: 15,
          skipDelayMs: 300,
          muteWhileSkipping: true,
          matchTargets: { caption: true, hashtags: true, audio: true, author: false }
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

    updateSettings(s) {
      if (!s) return;
      this.settings = {
        scrollSpeed: Number.isFinite(s.scrollSpeed) ? s.scrollSpeed : (this.settings.scrollSpeed || 50),
        autoAdvanceDelay: Number.isFinite(s.autoAdvanceDelay) ? s.autoAdvanceDelay : (this.settings.autoAdvanceDelay || 0.5),
        pauseOnHover: typeof s.pauseOnHover === 'boolean' ? s.pauseOnHover : this.settings.pauseOnHover,
        pauseOnComments: typeof s.pauseOnComments === 'boolean' ? s.pauseOnComments : this.settings.pauseOnComments,
        autoUnmute: typeof s.autoUnmute === 'boolean' ? s.autoUnmute : this.settings.autoUnmute,
        loopCount: Number.isFinite(s.loopCount) ? parseInt(s.loopCount, 10) : (this.settings.loopCount || 1),
        autoHideOverlay: typeof s.autoHideOverlay === 'boolean' ? s.autoHideOverlay : this.settings.autoHideOverlay,
        filterSettings: s.filterSettings ? { ...this.settings.filterSettings, ...s.filterSettings } : this.settings.filterSettings
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
      if (adapter) adapter.cleanup();
    }

    toggle() {
      if (this.isRunning) this.stop(); else this.start();
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

        // Trigger Niche Filtering on active video switch
        const currentVideo = adapter.getVideoElement();
        if (currentVideo && currentVideo !== this.lastEvaluatedVideo) {
          this.lastEvaluatedVideo = currentVideo;
          this.evaluateActiveVideo(adapter, currentVideo);
        }

        setTimeout(() => { if (this.isRunning) checkAndAttach(); }, 500);
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
        this.onStatusUpdateCallback({ status: 'evaluating', text: 'Scanning...' });
      }

      // Wait up to 250ms for asynchronous description hydration
      const metadata = await adapter.waitForMetadata(250);

      if (!this.isRunning || adapter.getVideoElement() !== video) {
        return;
      }

      const result = this.filterEngine.evaluate(metadata);

      if (result.pass) {
        // MATCHED
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
            text: result.matchedKeyword ? `🎯 ${result.matchedKeyword}` : '🎯 Matched'
          });
        }
      } else {
        // REJECTED -> SKIP
        this.isSkipping = true;
        const breaker = this.filterEngine.recordSkip();

        if (breaker.isTripped) {
          this.stop();
          if (typeof this.onStatusUpdateCallback === 'function') {
            this.onStatusUpdateCallback({
              status: 'tripped',
              skips: breaker.consecutiveSkips,
              text: `⚠️ Paused (${breaker.consecutiveSkips} skips)`
            });
          }
          return;
        }

        if (typeof this.onStatusUpdateCallback === 'function') {
          this.onStatusUpdateCallback({
            status: 'skipping',
            reason: result.reason,
            skips: breaker.consecutiveSkips,
            text: `⏭️ Skip (${breaker.consecutiveSkips}/${breaker.max})`
          });
        }

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
      if (this.settings.pauseOnComments && adapter.isCommentsOpen()) return;
      if (this.settings.pauseOnHover && this.isMouseHovered) return;

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

  // ==========================================
  // 6. UI CONTROLLER & DRAGGABLE FLOATING HUD
  // ==========================================

  let filterEngine = new FilterEngine();
  let platformManager = new PlatformManager();
  let scrollEngine = new ScrollEngine(platformManager, filterEngine);

  let overlayContainer = null;
  let playBtn = null;
  let statusDot = null;
  let badgeText = null;
  let loopChip = null;
  let nicheChip = null;
  let drawer = null;
  let fadeTimeout = null;

  const PRESETS = {
    tech: ['coding', 'ai', 'tech', 'python', 'developer', '#programming', 'software'],
    fitness: ['gym', 'workout', 'fitness', '#bodybuilding', 'nutrition', 'calisthenics'],
    finance: ['stocks', 'investing', 'finance', 'business', 'money', 'real estate'],
    cooking: ['recipe', 'cooking', 'food', 'chef', 'baking', '#delicious']
  };

  function createOverlayUI(savedPos) {
    if (document.getElementById('autoscroll-overlay-container')) return;
    if (!document.body) return;

    overlayContainer = document.createElement('div');
    overlayContainer.id = 'autoscroll-overlay-container';

    if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
      overlayContainer.style.left = `${savedPos.left}px`;
      overlayContainer.style.top = `${savedPos.top}px`;
      overlayContainer.style.right = 'auto';
      overlayContainer.style.bottom = 'auto';
    }

    overlayContainer.innerHTML = `
      <div class="autoscroll-drawer" id="autoscroll-drawer">
        <div class="autoscroll-drawer-title">
          <span>Auto Scroll Controls</span>
        </div>
        
        <!-- Speed & Delay -->
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

        <!-- Loop Selector -->
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

        <div class="autoscroll-section-divider"></div>

        <!-- Niche Filter Section -->
        <div class="autoscroll-drawer-title">
          <span>🎯 Niche Content Filter</span>
          <input type="checkbox" id="filter-enabled-toggle" style="accent-color:#2ed573; cursor:pointer;">
        </div>

        <div class="autoscroll-filter-modes">
          <button class="autoscroll-filter-mode-btn active" id="mode-whitelist" data-mode="whitelist">Whitelist (Keep Niche)</button>
          <button class="autoscroll-filter-mode-btn" id="mode-blacklist" data-mode="blacklist">Blacklist (Block)</button>
        </div>

        <!-- Quick Presets -->
        <div class="autoscroll-field">
          <div class="autoscroll-field-label">
            <span>Niche Presets:</span>
          </div>
          <div class="autoscroll-presets-container">
            <span class="autoscroll-preset-chip" data-preset="tech">💻 Tech & AI</span>
            <span class="autoscroll-preset-chip" data-preset="fitness">🏋️ Gym</span>
            <span class="autoscroll-preset-chip" data-preset="finance">💰 Finance</span>
            <span class="autoscroll-preset-chip" data-preset="cooking">🍳 Cooking</span>
          </div>
        </div>

        <!-- Keyword Tags -->
        <div class="autoscroll-field">
          <div class="autoscroll-field-label">
            <span>Keywords (Press Enter):</span>
          </div>
          <div class="autoscroll-tags-box" id="tags-box">
            <input type="text" id="keyword-input" class="autoscroll-tag-input" placeholder="+ Add keyword or #tag">
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 2px;">
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
        <span class="autoscroll-niche-chip" id="autoscroll-niche-chip" title="Niche Filter Status">🎯 All</span>
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
    nicheChip = document.getElementById('autoscroll-niche-chip');
    drawer = document.getElementById('autoscroll-drawer');

    // Controls
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

    // Niche chip click opens drawer
    nicheChip.addEventListener('click', () => {
      drawer.classList.add('open');
    });

    // Quick Loop Count cycling
    const loopOptions = [1, 2, 3, 5];
    loopChip.addEventListener('click', () => {
      const current = scrollEngine.settings.loopCount || 1;
      const nextIdx = (loopOptions.indexOf(current) + 1) % loopOptions.length;
      const nextVal = loopOptions[nextIdx];
      updateLoopCount(nextVal);
    });

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

    // Auto-Unmute toggle
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

    // Niche Filter Drawer Handlers
    initNicheFilterUI();

    // Draggable
    initDraggable();

    // Auto-fade
    initAutoHideListener();

    // Status callback
    scrollEngine.onStatusUpdate(handleEngineStatusUpdate);

    updateBadge();
    updateUIState(scrollEngine.isRunning);
    renderNicheChipState();
  }

  function initNicheFilterUI() {
    const filterToggle = document.getElementById('filter-enabled-toggle');
    const modeWhitelist = document.getElementById('mode-whitelist');
    const modeBlacklist = document.getElementById('mode-blacklist');
    const tagsBox = document.getElementById('tags-box');
    const keywordInput = document.getElementById('keyword-input');

    const fs = scrollEngine.settings.filterSettings;
    filterToggle.checked = !!fs.enabled;

    function renderFilterModes() {
      const mode = fs.mode || 'whitelist';
      modeWhitelist.classList.toggle('active', mode === 'whitelist');
      modeBlacklist.classList.toggle('active', mode === 'blacklist');
      modeBlacklist.classList.toggle('blacklist', mode === 'blacklist');
    }

    function renderTags() {
      // Remove existing tags except input
      tagsBox.querySelectorAll('.autoscroll-tag').forEach(t => t.remove());

      const keywords = fs.keywords || [];
      keywords.forEach(kw => {
        const tag = document.createElement('span');
        tag.className = 'autoscroll-tag';
        tag.innerHTML = `<span>${kw}</span><span class="autoscroll-tag-remove" data-kw="${kw}">×</span>`;
        tagsBox.insertBefore(tag, keywordInput);
      });
    }

    filterToggle.addEventListener('change', (e) => {
      fs.enabled = e.target.checked;
      if (fs.enabled && fs.mode === 'disabled') fs.mode = 'whitelist';
      scrollEngine.updateSettings({ filterSettings: fs });
      chrome.storage.sync.set({ filterSettings: fs });
      renderNicheChipState();
    });

    modeWhitelist.addEventListener('click', () => {
      fs.mode = 'whitelist';
      renderFilterModes();
      scrollEngine.updateSettings({ filterSettings: fs });
      chrome.storage.sync.set({ filterSettings: fs });
      renderNicheChipState();
    });

    modeBlacklist.addEventListener('click', () => {
      fs.mode = 'blacklist';
      renderFilterModes();
      scrollEngine.updateSettings({ filterSettings: fs });
      chrome.storage.sync.set({ filterSettings: fs });
      renderNicheChipState();
    });

    // Tag Input
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = keywordInput.value.trim().toLowerCase();
        if (val && !fs.keywords.includes(val)) {
          fs.keywords.push(val);
          keywordInput.value = '';
          renderTags();
          scrollEngine.updateSettings({ filterSettings: fs });
          chrome.storage.sync.set({ filterSettings: fs });
          renderNicheChipState();
        }
      }
    });

    tagsBox.addEventListener('click', (e) => {
      if (e.target.classList.contains('autoscroll-tag-remove')) {
        const kw = e.target.dataset.kw;
        fs.keywords = fs.keywords.filter(k => k !== kw);
        renderTags();
        scrollEngine.updateSettings({ filterSettings: fs });
        chrome.storage.sync.set({ filterSettings: fs });
        renderNicheChipState();
      }
    });

    // Presets
    drawer.querySelectorAll('.autoscroll-preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.preset;
        if (PRESETS[key]) {
          fs.enabled = true;
          filterToggle.checked = true;
          fs.mode = 'whitelist';
          fs.keywords = [...PRESETS[key]];
          renderFilterModes();
          renderTags();
          scrollEngine.updateSettings({ filterSettings: fs });
          chrome.storage.sync.set({ filterSettings: fs });
          renderNicheChipState();
        }
      });
    });

    renderFilterModes();
    renderTags();
  }

  function renderNicheChipState() {
    if (!nicheChip) return;
    const fs = scrollEngine.settings.filterSettings;
    nicheChip.classList.remove('skipping', 'tripped');

    if (!fs.enabled || fs.mode === 'disabled') {
      nicheChip.textContent = '🎯 All';
      nicheChip.style.display = 'inline-block';
    } else if (fs.mode === 'whitelist') {
      const count = (fs.keywords || []).length;
      nicheChip.textContent = count ? `🎯 Niche (${count})` : '🎯 Whitelist';
      nicheChip.style.display = 'inline-block';
    } else if (fs.mode === 'blacklist') {
      nicheChip.textContent = '🛡️ Blocklist';
      nicheChip.style.display = 'inline-block';
    }
  }

  function handleEngineStatusUpdate(info) {
    if (!nicheChip || !statusDot) return;

    if (info.status === 'evaluating') {
      nicheChip.textContent = info.text;
      statusDot.className = 'autoscroll-status-dot active';
    } else if (info.status === 'matched') {
      nicheChip.className = 'autoscroll-niche-chip';
      nicheChip.textContent = info.text;
      statusDot.className = 'autoscroll-status-dot matched';
      setTimeout(() => renderNicheChipState(), 3000);
    } else if (info.status === 'skipping') {
      nicheChip.className = 'autoscroll-niche-chip skipping';
      nicheChip.textContent = info.text;
      statusDot.className = 'autoscroll-status-dot skipping';
    } else if (info.status === 'tripped') {
      nicheChip.className = 'autoscroll-niche-chip tripped';
      nicheChip.textContent = info.text;
      statusDot.className = 'autoscroll-status-dot tripped';
      updateUIState(false);
    }
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
    'autoHideOverlay', 'widgetPosition', 'filterSettings'
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
        autoHideOverlay: scrollEngine.settings.autoHideOverlay,
        filterSettings: scrollEngine.settings.filterSettings
      });
    } else if (request.action === 'UPDATE_SETTINGS') {
      scrollEngine.updateSettings(request.settings);
      if (loopChip && request.settings.loopCount) loopChip.textContent = `${request.settings.loopCount}x`;
      renderNicheChipState();
      sendResponse({ success: true });
    }
    return true;
  });

})();
