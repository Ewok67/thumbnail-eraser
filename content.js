// Thumbnail Eraser — Content Script
// Replaces YouTube thumbnails with the highest-quality frame available for each video.
// SPA-aware: watches for navigation and DOM mutations.

const REPLACEMENT_URL = 'https://i.ytimg.com/vi/default/default.jpg';
const STORAGE_KEY = 'thumbnailEraserEnabled';

let enabled = false;
let observer = null;
let urlObserver = null;
let lastUrl = window.location.href;

// Extract video ID from URL or page state
function getVideoId() {
  const url = new URL(window.location.href);
  if (url.pathname.includes('/watch')) {
    return url.searchParams.get('v');
  }
  if (url.pathname.includes('/embed/')) {
    return url.pathname.split('/')[2];
  }
  if (url.pathname.includes('/shorts/')) {
    return url.pathname.split('/')[2];
  }
  if (url.hostname === 'youtu.be') {
    return url.pathname.slice(1);
  }
  // Try meta tag
  const meta = document.querySelector('meta[itemprop="videoId"]');
  if (meta) return meta.getAttribute('content');
  // Try ytInitialPlayerResponse in script tags
  const scripts = document.querySelectorAll('script');
  for (const s of scripts) {
    const m = s.textContent.match(/"videoId"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

// Find all YouTube thumbnail images
function findThumbnails() {
  const imgs = Array.from(document.querySelectorAll('img'));
  return imgs.filter(img => {
    const src = img.src || img.getAttribute('src') || '';
    return src.includes('i.ytimg.com/vi/');
  });
}

// Replace thumbnails
function replaceThumbnails() {
  if (!enabled) return;
  const imgs = findThumbnails();
  for (const img of imgs) {
    if (!img.dataset.thumbnailEraserOriginal) {
      img.dataset.thumbnailEraserOriginal = img.src || '';
      if (img.srcset) {
        img.dataset.thumbnailEraserSrcset = img.srcset;
        img.srcset = '';
      }
      const vid = getVideoId();
      if (vid) {
        // Per-video fallback chain: maxres → sd → hq → mq
        const bases = [
          `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${vid}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`
        ];
        let idx = 0;
        const tryNext = () => {
          if (idx < bases.length) {
            img.src = bases[idx++];
          }
        };
        tryNext();
        img.onerror = tryNext;
      } else {
        img.src = REPLACEMENT_URL;
      }
    }
  }
}

// Restore original thumbnails
function restoreThumbnails() {
  const imgs = document.querySelectorAll('img[data-thumbnail-eraser-original]');
  for (const img of imgs) {
    if (img.dataset.thumbnailEraserOriginal) {
      img.src = img.dataset.thumbnailEraserOriginal;
      delete img.dataset.thumbnailEraserOriginal;
    }
    if (img.dataset.thumbnailEraserSrcset) {
      img.srcset = img.dataset.thumbnailEraserSrcset;
      delete img.dataset.thumbnailEraserSrcset;
    }
  }
}

// Start observers
function startObservers() {
  if (observer) return;
  // DOM mutation observer — catches new thumbnails as they load
  observer = new MutationObserver(() => {
    if (enabled) replaceThumbnails();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset']
  });

  // URL change observer — catches SPA navigations via popstate + polling fallback
  let urlCheckInterval = null;
  const checkUrl = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (enabled) {
        restoreThumbnails();
        setTimeout(replaceThumbnails, 300);
      }
    }
  };
  window.addEventListener('popstate', checkUrl);
  urlCheckInterval = setInterval(checkUrl, 1000);
  urlObserver = {
    disconnect: () => {
      window.removeEventListener('popstate', checkUrl);
      if (urlCheckInterval) clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
  };
}

// Stop observers
function stopObservers() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
}

// Load state and apply
async function init() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  enabled = result[STORAGE_KEY] === true;
  if (enabled) {
    replaceThumbnails();
    startObservers();
  }
}

// Listen for toggle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start') {
    setEnabled(true);
  } else if (msg.action === 'stop') {
    setEnabled(false);
  }
  sendResponse({ ok: true });
});

// Fallback: listen for custom events from executeScript injection
window.addEventListener('thumbnailEraserStart', () => setEnabled(true));
window.addEventListener('thumbnailEraserStop', () => setEnabled(false));

function setEnabled(state) {
  enabled = state;
  if (enabled) {
    replaceThumbnails();
    startObservers();
  } else {
    restoreThumbnails();
    stopObservers();
  }
}

// Run on load
init();
