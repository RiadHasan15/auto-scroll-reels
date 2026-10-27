// Background Service Worker for Auto Scroll Extension

const DEFAULT_SETTINGS = {
  isEnabled: false,
  scrollSpeed: 50, // px per sec for generic pages
  autoAdvanceDelay: 0.5, // seconds after video end before scroll
  pauseOnHover: false,
  pauseOnComments: true,
  showOverlay: true,
  autoUnmute: false,
  loopCount: 1,
  autoHideOverlay: false,
  widgetPosition: null,
  filterSettings: {
    enabled: false,
    mode: 'whitelist',
    keywords: ['coding', 'ai', 'tech', 'python'],
    blacklist: ['prank', 'gossip', 'drama'],
    maxConsecutiveSkips: 15,
    skipDelayMs: 300,
    muteWhileSkipping: true,
    matchTargets: {
      caption: true,
      hashtags: true,
      audio: true,
      author: false
    }
  },
  enabledPlatforms: {
    tiktok: true,
    instagram: true,
    facebook: true,
    youtube: true,
    generic: true
  }
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.sync.set(stored);
  });
});

// Command hotkey listener
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-scroll') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_AUTO_SCROLL' });
      }
    });
  }
});

// Relay messages between popup/content script if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_SETTINGS') {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      sendResponse(settings);
    });
    return true;
  }
});
