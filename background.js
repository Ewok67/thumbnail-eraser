// Thumbnail Eraser — Background Service Worker
// Manages badge, context menu, and initial state.

const STORAGE_KEY = 'thumbnailEraserEnabled';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'thumbnailEraserToggle',
    title: 'Toggle Thumbnail Eraser',
    contexts: ['all']
  });
  updateBadge();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'thumbnailEraserToggle') {
    toggleState(tab);
  }
});

chrome.action.onClicked.addListener((tab) => {
  // Only fires when no default_popup is set; kept for completeness.
  toggleState(tab);
});

async function toggleState(tab) {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const newState = !result[STORAGE_KEY];
  await chrome.storage.sync.set({ [STORAGE_KEY]: newState });
  updateBadge();

  if (tab && tab.url && /youtube\.com/.test(tab.url)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: newState ? 'start' : 'stop' });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: newState ? injectReplace : injectRestore
      });
    }
  }
}

async function updateBadge() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const enabled = result[STORAGE_KEY] === true;
  chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#ff0000' : '#888888' });
}

// Listen for storage changes (e.g., from options page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    updateBadge();
  }
});

// Fallback injection functions
function injectReplace() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStart'));
}

function injectRestore() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStop'));
}
