document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-options');
  const statusMsg = document.getElementById('status-msg');

  const defaultLoop = document.getElementById('default-loop');
  const defaultUnmute = document.getElementById('default-unmute');
  const defaultAutoHide = document.getElementById('default-autohide');

  const filterModeSelect = document.getElementById('filter-mode-select');
  const filterKeywordsText = document.getElementById('filter-keywords-text');
  const filterBlacklistText = document.getElementById('filter-blacklist-text');
  const filterCircuitBreaker = document.getElementById('filter-circuit-breaker');
  const filterSkipDelay = document.getElementById('filter-skip-delay');
  const filterMuteSkipping = document.getElementById('filter-mute-skipping');

  const tiktokCheck = document.getElementById('plat-tiktok');
  const instagramCheck = document.getElementById('plat-instagram');
  const facebookCheck = document.getElementById('plat-facebook');
  const youtubeCheck = document.getElementById('plat-youtube');
  const genericCheck = document.getElementById('plat-generic');

  let loadedFilterSettings = {
    enabled: false,
    mode: 'disabled',
    keywords: ['coding', 'ai', 'tech', 'python'],
    blacklist: ['prank', 'gossip', 'drama'],
    maxConsecutiveSkips: 15,
    skipDelayMs: 300,
    muteWhileSkipping: true,
    matchTargets: { caption: true, hashtags: true, audio: true, author: false }
  };

  chrome.storage.sync.get({
    loopCount: 1,
    autoUnmute: false,
    autoHideOverlay: false,
    filterSettings: loadedFilterSettings,
    enabledPlatforms: {
      tiktok: true,
      instagram: true,
      facebook: true,
      youtube: true,
      generic: true
    }
  }, (res) => {
    defaultLoop.value = String(res.loopCount || 1);
    defaultUnmute.checked = !!res.autoUnmute;
    defaultAutoHide.checked = !!res.autoHideOverlay;

    if (res.filterSettings) {
      loadedFilterSettings = { ...loadedFilterSettings, ...res.filterSettings };
    }

    filterModeSelect.value = loadedFilterSettings.mode || 'disabled';
    filterKeywordsText.value = (loadedFilterSettings.keywords || []).join(', ');
    filterBlacklistText.value = (loadedFilterSettings.blacklist || []).join(', ');
    filterCircuitBreaker.value = loadedFilterSettings.maxConsecutiveSkips || 15;
    filterSkipDelay.value = loadedFilterSettings.skipDelayMs || 300;
    filterMuteSkipping.checked = loadedFilterSettings.muteWhileSkipping !== false;

    const p = res.enabledPlatforms || {};
    tiktokCheck.checked = p.tiktok !== false;
    instagramCheck.checked = p.instagram !== false;
    facebookCheck.checked = p.facebook !== false;
    youtubeCheck.checked = p.youtube !== false;
    genericCheck.checked = p.generic !== false;
  });

  saveBtn.addEventListener('click', () => {
    const mode = filterModeSelect.value;
    const keywords = filterKeywordsText.value
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
    const blacklist = filterBlacklistText.value
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    const filterSettings = {
      ...loadedFilterSettings,
      enabled: mode !== 'disabled',
      mode: mode,
      keywords: keywords,
      blacklist: blacklist,
      maxConsecutiveSkips: parseInt(filterCircuitBreaker.value, 10) || 15,
      skipDelayMs: parseInt(filterSkipDelay.value, 10) || 300,
      muteWhileSkipping: filterMuteSkipping.checked
    };

    const settings = {
      loopCount: parseInt(defaultLoop.value, 10),
      autoUnmute: defaultUnmute.checked,
      autoHideOverlay: defaultAutoHide.checked,
      filterSettings: filterSettings,
      enabledPlatforms: {
        tiktok: tiktokCheck.checked,
        instagram: instagramCheck.checked,
        facebook: facebookCheck.checked,
        youtube: youtubeCheck.checked,
        generic: genericCheck.checked
      }
    };

    chrome.storage.sync.set(settings, () => {
      statusMsg.textContent = 'Settings saved successfully!';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 2500);
    });
  });
});
