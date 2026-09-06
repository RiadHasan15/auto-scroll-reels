document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-options');
  const statusMsg = document.getElementById('status-msg');

  const defaultLoop = document.getElementById('default-loop');
  const defaultUnmute = document.getElementById('default-unmute');
  const defaultAutoHide = document.getElementById('default-autohide');

  const tiktokCheck = document.getElementById('plat-tiktok');
  const instagramCheck = document.getElementById('plat-instagram');
  const facebookCheck = document.getElementById('plat-facebook');
  const youtubeCheck = document.getElementById('plat-youtube');
  const genericCheck = document.getElementById('plat-generic');

  chrome.storage.sync.get({
    loopCount: 1,
    autoUnmute: false,
    autoHideOverlay: false,
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

    const p = res.enabledPlatforms || {};
    tiktokCheck.checked = p.tiktok !== false;
    instagramCheck.checked = p.instagram !== false;
    facebookCheck.checked = p.facebook !== false;
    youtubeCheck.checked = p.youtube !== false;
    genericCheck.checked = p.generic !== false;
  });

  saveBtn.addEventListener('click', () => {
    const settings = {
      loopCount: parseInt(defaultLoop.value, 10),
      autoUnmute: defaultUnmute.checked,
      autoHideOverlay: defaultAutoHide.checked,
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
