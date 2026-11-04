// Thumbnail Eraser - Background Service Worker
// Handles context menus, badge updates, and icon state

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for quick toggle
  chrome.contextMenus.create({
    id: 'toggleMidpointThumbnails',
    title: 'Toggle Midpoint Thumbnails',
    contexts: ['all'],
    documentUrlPatterns: ['*://*.youtube.com/*']
  });

  // Set initial badge
  updateBadge(false);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'toggleMidpointThumbnails' && tab?.id) {
    try {
      const { enabled = false } = await chrome.storage.sync.get('enabled');
      const newState = !enabled;
      
      await chrome.storage.sync.set({ enabled: newState });
      updateBadge(newState);
      
      // Inject into the tab
      if (newState) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectReplaceThumbnails
        });
      } else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectRestoreThumbnails
        });
      }
    } catch (err) {
      console.error('[Thumbnail Eraser] Context menu toggle failed:', err);
    }
  }
});

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) {
    updateBadge(changes.enabled.newValue);
  }
});

// Update badge text based on state
function updateBadge(enabled) {
  chrome.action.setBadgeText({
    text: enabled ? 'ON' : ''
  });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? '#ff0000' : '#333'
  });
}

// Injected functions for context menu
function injectReplaceThumbnails() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStart'));
}

function injectRestoreThumbnails() {
  window.dispatchEvent(new CustomEvent('thumbnailEraserStop'));
}

// Handle tab updates to sync badge
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
    try {
      const { enabled = false } = await chrome.storage.sync.get('enabled');
      updateBadge(enabled);
    } catch (err) {
      // Ignore
    }
  }
});