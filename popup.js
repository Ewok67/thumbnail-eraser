// Thumbnail Eraser — Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');

  // Load saved state
  const result = await chrome.storage.sync.get({ enabled: false });
  toggle.checked = result.enabled;
  status.textContent = result.enabled ? 'On — highest quality per video' : 'Off';

  // Handle toggle
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    await chrome.storage.sync.set({ enabled });
    status.textContent = enabled ? 'On — highest quality per video' : 'Off';

    // Find active YouTube tab and send command
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /youtube\.com/.test(tab.url)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: enabled ? 'start' : 'stop' });
      } catch {
        // Content script not yet loaded — inject directly
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: enabled ? injectReplace : injectRestore
        });
      }
    }
  });
});

// Serialized functions for executeScript fallback
function injectReplace() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStart'));
}

function injectRestore() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStop'));
}
