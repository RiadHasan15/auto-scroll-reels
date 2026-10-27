/**
 * FilterEngine - Production-Grade Niche Filtering & Fast-Skip Decision Engine
 * Implements word-boundary tokenization, hashtag resolution, and safety circuit-breaker.
 */
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

  /**
   * Compiles string keywords into resilient RegExp rules with word boundaries.
   * Prevents false-positives (e.g. 'ai' matching 'hair' or 'email').
   */
  _compileRules(list) {
    if (!list || !list.length) return [];

    return list
      .map(k => (typeof k === 'string' ? k.trim().toLowerCase() : ''))
      .filter(k => k.length > 0)
      .map(raw => {
        const isHashtag = raw.startsWith('#');
        const clean = raw.replace(/^#/, '');

        // Escape special regex characters
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let regex;
        if (isHashtag) {
          // Matches #hashtag with punctuation or whitespace boundary
          regex = new RegExp(`(?:^|[\\s.,!?_\\-])#${escaped}(?=[\\s.,!?_\\-]|$)`, 'i');
        } else if (clean.includes(' ')) {
          // Multi-word phrase matching with flexible whitespace
          const phraseRegex = clean
            .split(/\s+/)
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+');
          regex = new RegExp(`(?:^|[\\s.,!?_\\-])${phraseRegex}(?=[\\s.,!?_\\-]|$)`, 'i');
        } else {
          // Exact single word boundary match (supports English and Unicode symbols)
          regex = new RegExp(`(?:^|[\\s.,!?_\\-])${escaped}(?=[\\s.,!?_\\-]|$)`, 'i');
        }

        return { raw, regex };
      });
  }

  /**
   * Build searchable string based on matchTargets configuration
   */
  _buildSearchableCorpus(metadata) {
    if (!metadata) return '';
    const parts = [];

    if (this.matchTargets.caption && metadata.caption) {
      parts.push(metadata.caption);
    }
    if (this.matchTargets.hashtags && Array.isArray(metadata.hashtags)) {
      parts.push(metadata.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' '));
    }
    if (this.matchTargets.audio && metadata.audio) {
      parts.push(metadata.audio);
    }
    if (this.matchTargets.author && metadata.author) {
      parts.push(metadata.author);
    }

    // Fallback to fullText if specific parts are empty
    if (!parts.length && metadata.fullText) {
      parts.push(metadata.fullText);
    }

    return parts.join(' ').toLowerCase();
  }

  /**
   * Evaluates metadata against current filtering rules.
   * @param {Object} metadata - { caption, hashtags, audio, author, fullText }
   * @returns {Object} - { pass: boolean, matchedKeyword: string|null, reason: string }
   */
  evaluate(metadata) {
    if (!this.enabled || this.mode === 'disabled') {
      this.lastEvaluation = { pass: true, matchedKeyword: null, reason: 'Filter disabled' };
      return this.lastEvaluation;
    }

    const corpus = this._buildSearchableCorpus(metadata);

    // 1. Check Global Blacklist first (always disqualifies if matched)
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

    // 2. Mode: Whitelist (only allow matching niche keywords)
    if (this.mode === 'whitelist') {
      if (!this.compiledKeywords.length) {
        // Whitelist enabled with no keywords = allow everything
        this.lastEvaluation = { pass: true, matchedKeyword: null, reason: 'Whitelist empty' };
        return this.lastEvaluation;
      }

      for (const rule of this.compiledKeywords) {
        if (rule.regex.test(corpus)) {
          this.lastEvaluation = {
            pass: true,
            matchedKeyword: rule.raw,
            reason: `Matched niche: "${rule.raw}"`
          };
          return this.lastEvaluation;
        }
      }

      // No whitelist keyword found
      this.lastEvaluation = {
        pass: false,
        matchedKeyword: null,
        reason: 'No niche keywords matched'
      };
      return this.lastEvaluation;
    }

    // 3. Mode: Blacklist-only mode
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

  // --- Circuit Breaker ---

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
