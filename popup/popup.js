document.addEventListener('DOMContentLoaded', () => {
  const mainBtn = document.getElementById('main-toggle-btn');
  const toggleIcon = document.getElementById('toggle-icon');
  const toggleText = document.getElementById('toggle-text');
  const platformChip = document.getElementById('platform-chip');

  const speedRange = document.getElementById('speed-range');
  const speedVal = document.getElementById('speed-val');
  const delayRange = document.getElementById('delay-range');
  const delayVal = document.getElementById('delay-val');

  const loopBtnGroup = document.getElementById('loop-btn-group');
  const toggleUnmute = document.getElementById('toggle-unmute');
  const toggleAutoHide = document.getElementById('toggle-autohide');
  const toggleComments = document.getElementById('toggle-comments');
  const toggleHover = document.getElementById('toggle-hover');
  const toggleOverlay = document.getElementById('toggle-overlay');

  const openOptions = document.getElementById('open-options');

  let currentLoopCount = 1;

  // Load active tab status
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          platformChip.textContent = 'Web Page';
          return;
        }
        platformChip.textContent = res.platform || 'Web Page';
        updateBtnState(res.isRunning);
      });
    }
  });

  // Load saved settings
  chrome.storage.sync.get({
    scrollSpeed: 50,
    autoAdvanceDelay: 0.5,
    pauseOnComments: true,
    pauseOnHover: false,
    showOverlay: true,
    autoUnmute: false,
    loopCount: 1,
    autoHideOverlay: false
  }, (s) => {
    speedRange.value = s.scrollSpeed;
    speedVal.textContent = `${s.scrollSpeed} px/s`;

    delayRange.value = s.autoAdvanceDelay;
    delayVal.textContent = `${s.autoAdvanceDelay} sec`;

    currentLoopCount = s.loopCount || 1;
    updateLoopButtons(currentLoopCount);

    toggleUnmute.checked = !!s.autoUnmute;
    toggleAutoHide.checked = !!s.autoHideOverlay;
    toggleComments.checked = s.pauseOnComments;
    toggleHover.checked = s.pauseOnHover;
    toggleOverlay.checked = s.showOverlay;
  });

  // Main Play/Pause toggle
  mainBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_AUTO_SCROLL' }, (res) => {
          if (res) {
            updateBtnState(res.isRunning);
            if (res.platform) platformChip.textContent = res.platform;
          }
        });
      }
    });
  });

  function updateBtnState(isRunning) {
    if (isRunning) {
      mainBtn.classList.add('running');
      toggleIcon.textContent = '❚❚';
      toggleText.textContent = 'Stop Auto-Scroll';
    } else {
      mainBtn.classList.remove('running');
      toggleIcon.textContent = '▶';
      toggleText.textContent = 'Start Auto-Scroll';
    }
  }

  function updateLoopButtons(val) {
    loopBtnGroup.querySelectorAll('.loop-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.loop, 10) === val);
    });
  }

  // Loop count button click
  loopBtnGroup.querySelectorAll('.loop-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = parseInt(e.target.dataset.loop, 10);
      currentLoopCount = val;
      updateLoopButtons(val);
      saveAndSyncSettings();
    });
  });

  function saveAndSyncSettings() {
    const settings = {
      scrollSpeed: parseInt(speedRange.value, 10),
      autoAdvanceDelay: parseFloat(delayRange.value),
      loopCount: currentLoopCount,
      autoUnmute: toggleUnmute.checked,
      autoHideOverlay: toggleAutoHide.checked,
      pauseOnComments: toggleComments.checked,
      pauseOnHover: toggleHover.checked,
      showOverlay: toggleOverlay.checked
    };

    chrome.storage.sync.set(settings);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'UPDATE_SETTINGS', settings });
      }
    });
  }

  speedRange.addEventListener('input', (e) => {
    speedVal.textContent = `${e.target.value} px/s`;
    saveAndSyncSettings();
  });

  delayRange.addEventListener('input', (e) => {
    delayVal.textContent = `${e.target.value} sec`;
    saveAndSyncSettings();
  });

  toggleUnmute.addEventListener('change', saveAndSyncSettings);
  toggleAutoHide.addEventListener('change', saveAndSyncSettings);
  toggleComments.addEventListener('change', saveAndSyncSettings);
  toggleHover.addEventListener('change', saveAndSyncSettings);
  toggleOverlay.addEventListener('change', saveAndSyncSettings);

  openOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
