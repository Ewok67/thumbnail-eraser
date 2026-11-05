// Thumbnail Eraser - Popup Script
// Handles the toggle UI and communicates with content script via chrome.scripting

const toggleThumbnails = document.getElementById('toggleThumbnails');
const statusThumbnails = document.getElementById('statusThumbnails');
const toggleShorts = document.getElementById('toggleShorts');
const statusShorts = document.getElementById('statusShorts');
const openBlocklistBtn = document.getElementById('openBlocklistBtn');
const statusUrlBlocker = document.getElementById('statusUrlBlocker');

// Load saved state on popup open
async function loadState() {
  try {
    const { enabled = false, shortsBlocked = true, urlBlockerEnabled = true } = await chrome.storage.sync.get(['enabled', 'shortsBlocked', 'urlBlockerEnabled']);
    toggleThumbnails.checked = enabled;
    toggleShorts.checked = shortsBlocked;
    updateStatusThumbnails(enabled);
    updateStatusShorts(shortsBlocked);
    updateStatusUrlBlocker(urlBlockerEnabled);
  } catch (err) {
    console.error('Failed to load state:', err);
    statusThumbnails.textContent = 'Error loading state';
    statusShorts.textContent = 'Error loading state';
    statusUrlBlocker.textContent = 'Error loading state';
  }
}

// Update status text
function updateStatusThumbnails(enabled) {
  statusThumbnails.textContent = enabled ? 'Active: Showing midpoint frames' : 'Inactive: Showing original thumbnails';
  statusThumbnails.className = 'status' + (enabled ? ' active' : '');
}

function updateStatusShorts(enabled) {
  statusShorts.textContent = enabled ? 'Active: Shorts blocked' : 'Inactive: Shorts visible';
  statusShorts.className = 'status' + (enabled ? ' active' : '');
}

function updateStatusUrlBlocker(enabled) {
  statusUrlBlocker.textContent = enabled ? 'Active: Blocking forbidden words' : 'Inactive: URL blocker off';
  statusUrlBlocker.className = 'status' + (enabled ? ' active' : '');
}

// Save thumbnails state and inject/revert on active tab
async function saveThumbnailsState(enabled) {
  try {
    await chrome.storage.sync.set({ enabled: enabled });
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.id && tab.url?.includes('youtube.com')) {
      // Inject the appropriate function
      if (enabled) {
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
    }
    
    updateStatusThumbnails(enabled);
  } catch (err) {
    console.error('Failed to save thumbnails state:', err);
    // Revert toggle on error
    toggleThumbnails.checked = !enabled;
    statusThumbnails.textContent = 'Error: Could not apply to this page';
  }
}

// Save shorts state and inject/revert on active tab
async function saveShortsState(enabled) {
  try {
    await chrome.storage.sync.set({ shortsBlocked: enabled });
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.id && tab.url?.includes('youtube.com')) {
      // Inject the appropriate function
      if (enabled) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectBlockShorts
        });
      } else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectAllowShorts
        });
      }
    }
    
    updateStatusShorts(enabled);
  } catch (err) {
    console.error('Failed to save shorts state:', err);
    // Revert toggle on error
    toggleShorts.checked = !enabled;
    statusShorts.textContent = 'Error: Could not apply to this page';
  }
}

// Toggle handlers
toggleThumbnails.addEventListener('change', (e) => {
  saveThumbnailsState(e.target.checked);
});

toggleShorts.addEventListener('change', (e) => {
  saveShortsState(e.target.checked);
});

// Open blocklist page
openBlocklistBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('blocklist.html') });
});

// Initialize
loadState();

// Listen for storage changes from other contexts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.enabled) updateStatusThumbnails(changes.enabled.newValue);
  if (changes.shortsBlocked) updateStatusShorts(changes.shortsBlocked.newValue);
  if (changes.urlBlockerEnabled) updateStatusUrlBlocker(changes.urlBlockerEnabled.newValue);
});

// --- Injected functions (must be self-contained, no closures) ---

function injectReplaceThumbnails() {
  // This runs in the page context - dispatch event for content script
  window.dispatchEvent(new CustomEvent('thumbnailEraserStart'));
}

function injectRestoreThumbnails() {
  // This runs in the page context - dispatch event for content script
  window.dispatchEvent(new CustomEvent('thumbnailEraserStop'));
}

function injectBlockShorts() {
  window.dispatchEvent(new CustomEvent('shortsBlockerStart'));
}

function injectAllowShorts() {
  window.dispatchEvent(new CustomEvent('shortsBlockerStop'));
}
