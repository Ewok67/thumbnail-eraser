// Thumbnail Eraser - Popup Script
// Handles the toggle UI and communicates with content script via chrome.scripting

const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');

// Load saved state on popup open
async function loadState() {
  try {
    const { enabled = false } = await chrome.storage.sync.get('enabled');
    toggle.checked = enabled;
    updateStatus(enabled);
  } catch (err) {
    console.error('Failed to load state:', err);
    statusEl.textContent = 'Error loading state';
  }
}

// Update status text
function updateStatus(enabled) {
  statusEl.textContent = enabled ? 'Active: Showing midpoint frames' : 'Inactive: Showing original thumbnails';
  statusEl.className = 'status' + (enabled ? ' active' : '');
}

// Save state and inject/revert on active tab
async function saveState(enabled) {
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
    
    updateStatus(enabled);
  } catch (err) {
    console.error('Failed to save state:', err);
    // Revert toggle on error
    toggle.checked = !enabled;
    statusEl.textContent = 'Error: Could not apply to this page';
  }
}

// Toggle handler
toggle.addEventListener('change', (e) => {
  saveState(e.target.checked);
});

// Initialize
loadState();

// --- Injected functions (must be self-contained, no closures) ---

function injectReplaceThumbnails() {
  // This runs in the page context - dispatch event for content script
  window.dispatchEvent(new CustomEvent('thumbnailEraserStart'));
}

function injectRestoreThumbnails() {
  // This runs in the page context - dispatch event for content script
  window.dispatchEvent(new CustomEvent('thumbnailEraserStop'));
}