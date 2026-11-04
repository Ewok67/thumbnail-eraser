// Thumbnail Eraser - Content Script
// Replaces YouTube thumbnails with HIGH-QUALITY midpoint frames from the video
// Blocks YouTube Shorts
// Based on honest-thumbnails approach: maxres1/2/3.jpg (1280x720) and hq1/2/3.jpg (480x360)

(() => {
  'use strict';

  const DEFAULTS = { 
    enabled: false, 
    frame: 2,           // frame: 1=early(25%), 2=mid(50%), 3=late(75%)
    shortsBlocked: true // Block Shorts by default
  };
  const ORIGIN = 'https://i.ytimg.com';

  // Match YouTube thumbnail URLs: //i.ytimg.com/vi/VIDEO_ID/NAME.jpg or webp
  // Also handles i1.ytimg.com, i2.ytimg.com, etc. and vi_webp
  const THUMB_RE = /^(?:https?:)?\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(\w+)\.(?:jpg|webp)/;
  
  // Auto-generated frame names we should NOT replace (already midpoint frames)
  const AUTO_FRAME_RE = /^(?:hq|mq|sd|maxres|oar|hq720_)?[123]$/;
  
  // Extract URL from CSS background-image: url("...")
  const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/;
  
  // YouTube serves 120x90 grey placeholder for missing frames
  const PLACEHOLDER_WIDTH = 120;

  let settings = { ...DEFAULTS };
  const cache = new Map(); // "videoId:frame" -> Promise<url | null>
  let shortsObserver = null;

  // ---- Frame Resolution ----
  function probe(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // REQUIRED for cross-origin naturalWidth
      img.onload = () => resolve(img.naturalWidth > PLACEHOLDER_WIDTH);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function resolveFrame(videoId, frame) {
    const key = `${videoId}:${frame}`;
    let promise = cache.get(key);
    if (!promise) {
      promise = (async () => {
        // Try HD first, then fallback to HQ
        for (const name of [`maxres${frame}`, `hq${frame}`]) {
          const url = `${ORIGIN}/vi/${videoId}/${name}.jpg`;
          if (await probe(url)) return url;
        }
        return null;
      })();
      cache.set(key, promise);
    }
    return promise;
  }

  function parseThumb(url) {
    const m = url && THUMB_RE.exec(url);
    if (!m || AUTO_FRAME_RE.test(m[2])) return null;
    return m[1]; // videoId
  }

  // ---- <img> thumbnails ----
  function processImg(img) {
    const src = img.getAttribute('src') || '';
    if (img.dataset.teHonest && src === img.dataset.teHonest) return; // already ours

    // New src from YouTube - forget any state from previous swap
    delete img.dataset.teHonest;
    delete img.dataset.teHonestSrcset;

    const videoId = parseThumb(src);
    if (!videoId) {
      delete img.dataset.teHonestOrig;
      return;
    }

    img.dataset.teHonestOrig = src;
    const frame = settings.frame;
    
    resolveFrame(videoId, frame).then((url) => {
      if (!url || !settings.enabled || settings.frame !== frame) return;
      if (img.getAttribute('src') !== src) return; // recycled while probing
      
      img.dataset.teHonest = url; // mark before setting src so observer skips it
      if (img.hasAttribute('srcset')) {
        img.dataset.teHonestSrcset = img.getAttribute('srcset');
        img.removeAttribute('srcset');
      }
      img.src = url;
    });
  }

  function restoreSrcset(img) {
    if (img.dataset.teHonestSrcset !== undefined) {
      img.setAttribute('srcset', img.dataset.teHonestSrcset);
      delete img.dataset.teHonestSrcset;
    }
  }

  // ---- background-image thumbnails (player poster, end-screen wall) ----
  function processBg(el) {
    const style = el.getAttribute('style');
    if (!style || !style.includes('ytimg.com')) return;
    
    const bg = el.style.backgroundImage;
    const m = bg && CSS_URL_RE.exec(bg);
    if (!m) return;
    
    const current = m[1];
    if (el.dataset.teHonestBg && current === el.dataset.teHonestBg) return; // already ours

    delete el.dataset.teHonestBg;
    const videoId = parseThumb(current);
    if (!videoId) {
      delete el.dataset.teHonestBgOrig;
      return;
    }

    el.dataset.teHonestBgOrig = bg;
    const frame = settings.frame;
    
    resolveFrame(videoId, frame).then((url) => {
      if (!url || !settings.enabled || settings.frame !== frame) return;
      if (el.style.backgroundImage !== bg) return;
      
      el.dataset.teHonestBg = url;
      el.style.backgroundImage = `url("${url}")`;
    });
  }

  // ---- Shorts Blocking ----
  const SHORTS_SELECTORS = [
    // Shelves/carousels
    'ytd-reel-shelf-renderer',
    'ytd-reel-item-renderer',
    'ytd-rich-shelf-renderer:has(a[href*="/shorts/"])',
    'grid-shelf-view-model',
    
    // Individual video renderers with Shorts links
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
    'ytd-video-preview:has(a[href*="/shorts/"])',
    
    // Sidebar tabs
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
    'ytd-guide-entry-renderer a[title="Shorts"]',
    
    // Chips/filter bar
    'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"])',
    '#chips > yt-chip-cloud-renderer:nth-child(2)',
  ].join(', ');

  const SHORTS_LINK_SELECTOR = 'a[href*="/shorts/"]';

  function removeShortsElements(root = document) {
    if (!settings.shortsBlocked) return;
    
    let removedCount = 0;
    
    // Remove main Shorts containers
    for (const selector of SHORTS_SELECTORS.split(', ')) {
      try {
        const elements = root.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && el.isConnected) {
            // For grid-shelf-view-model, check if it's actually Shorts
            if (selector === 'grid-shelf-view-model') {
              const header = el.querySelector('yt-section-header-view-model yt-shelf-header-layout h2 > span');
              if (!header || header.textContent.trim() !== 'Shorts') return;
            }
            el.remove();
            removedCount++;
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Remove individual Shorts videos by link
    try {
      const shortsLinks = root.querySelectorAll(SHORTS_LINK_SELECTOR);
      shortsLinks.forEach(link => {
        if (!link.href || !link.href.includes('/shorts/')) return;
        
        // Find the video container
        const container = link.closest(
          'ytd-video-renderer, ytd-compact-video-renderer, ' +
          'ytd-rich-item-renderer, ytd-reel-item-renderer, ' +
          'ytd-grid-video-renderer, ytd-video-preview'
        );
        
        if (container && container.isConnected && container.offsetParent !== null) {
          container.style.display = 'none';
          container.dataset.teShortsHidden = 'true';
          removedCount++;
        } else if (link.offsetParent !== null && link.style.display !== 'none') {
          // Fallback: hide the link itself
          link.style.display = 'none';
          link.dataset.teShortsHidden = 'true';
          removedCount++;
        }
      });
    } catch (e) {
      // Ignore
    }
    
    if (removedCount > 0) {
      console.log(`[Thumbnail Eraser] Hidden ${removedCount} Shorts elements`);
    }
  }

  function restoreShortsElements() {
    // Restore hidden containers
    for (const el of document.querySelectorAll('[data-te-shorts-hidden]')) {
      if (el.isConnected) {
        el.style.display = '';
        delete el.dataset.teShortsHidden;
      }
    }
    // Restore hidden links
    for (const link of document.querySelectorAll('a[data-te-shorts-hidden]')) {
      if (link.isConnected) {
        link.style.display = '';
        delete link.dataset.teShortsHidden;
      }
    }
  }

  function checkAndRedirectShorts() {
    if (!settings.shortsBlocked) return false;
    
    if (window.location.pathname.startsWith('/shorts/') || window.location.pathname === '/shorts') {
      console.log('[Thumbnail Eraser] Redirecting from Shorts page');
      window.location.replace('https://www.youtube.com/');
      return true;
    }
    return false;
  }

  // ---- Scanning & Observing ----
  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.tagName === 'IMG') processImg(root);
    else if (root.getAttribute?.('style')) processBg(root);
    
    // Scan all img with ytimg.com/vi in src
    for (const img of root.querySelectorAll('img[src*="ytimg.com/vi"]')) processImg(img);
    // Scan all elements with ytimg.com/vi in style
    for (const el of root.querySelectorAll('[style*="ytimg.com/vi"]')) processBg(el);
    
    // Scan for Shorts
    removeShortsElements(root);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (m.attributeName === 'src') {
          if (m.target.tagName === 'IMG') processImg(m.target);
        } else if (m.attributeName === 'style') {
          processBg(m.target);
        }
      } else if (m.type === 'childList') {
        for (const node of m.addedNodes) scan(node);
      }
    }
  });

  function startShortsObserver() {
    if (shortsObserver) return;
    
    shortsObserver = new MutationObserver(() => {
      if (settings.shortsBlocked) removeShortsElements();
    });
    
    shortsObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
    });
  }

  function stopShortsObserver() {
    if (shortsObserver) {
      shortsObserver.disconnect();
      shortsObserver = null;
    }
  }

  function revertAll() {
    // Restore <img> elements
    for (const img of document.querySelectorAll('img[data-te-honest-orig]')) {
      const ours = img.dataset.teHonest;
      const orig = img.dataset.teHonestOrig;
      delete img.dataset.teHonest;
      delete img.dataset.teHonestOrig;
      restoreSrcset(img);
      if (ours && img.getAttribute('src') === ours) img.src = orig;
    }
    // Restore background-image elements
    for (const el of document.querySelectorAll('[data-te-honest-bg-orig]')) {
      const ours = el.dataset.teHonestBg;
      const orig = el.dataset.teHonestBgOrig;
      delete el.dataset.teHonestBg;
      delete el.dataset.teHonestBgOrig;
      if (ours && el.style.backgroundImage.includes(ours)) el.style.backgroundImage = orig;
    }
    // Restore Shorts
    restoreShortsElements();
  }

  function start() {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'style'],
    });
    startShortsObserver();
    
    if (settings.enabled) scan(document);
    if (settings.shortsBlocked) {
      checkAndRedirectShorts();
      removeShortsElements();
    }
  }

  // ---- DNR Rule Management ----
  async function setShortsBlocking(enabled) {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabled ? ['shorts_redirect_rules'] : [],
        disableRulesetIds: enabled ? [] : ['shorts_redirect_rules']
      });
    } catch (e) {
      console.error('[Thumbnail Eraser] Failed to update DNR rules:', e);
    }
  }

  // ---- Storage & Events ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    
    let needsRescan = false;
    let needsShortsUpdate = false;
    
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        settings[key] = newValue ?? DEFAULTS[key];
        if (key === 'enabled' || key === 'frame') needsRescan = true;
        if (key === 'shortsBlocked') needsShortsUpdate = true;
      }
    }
    
    if (needsRescan) {
      revertAll();
      if (settings.enabled) scan(document);
    }
    
    if (needsShortsUpdate) {
      setShortsBlocking(settings.shortsBlocked);
      if (settings.shortsBlocked) {
        checkAndRedirectShorts();
        removeShortsElements();
        startShortsObserver();
      } else {
        restoreShortsElements();
        stopShortsObserver();
      }
    }
  });

  // Listen for popup toggle via CustomEvent
  window.addEventListener('thumbnailEraserStart', () => {
    settings.enabled = true;
    chrome.storage.sync.set({ enabled: true });
    scan(document);
  });
  
  window.addEventListener('thumbnailEraserStop', () => {
    settings.enabled = false;
    chrome.storage.sync.set({ enabled: false });
    revertAll();
  });

  window.addEventListener('shortsBlockerStart', () => {
    settings.shortsBlocked = true;
    chrome.storage.sync.set({ shortsBlocked: true });
    setShortsBlocking(true);
    checkAndRedirectShorts();
    removeShortsElements();
    startShortsObserver();
  });
  
  window.addEventListener('shortsBlockerStop', () => {
    settings.shortsBlocked = false;
    chrome.storage.sync.set({ shortsBlocked: false });
    setShortsBlocking(false);
    restoreShortsElements();
    stopShortsObserver();
  });

  // Handle SPA navigation for Shorts redirect
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (settings.shortsBlocked) checkAndRedirectShorts();
    }
  }, 500);

  window.addEventListener('popstate', () => {
    if (settings.shortsBlocked) checkAndRedirectShorts();
  });

  // Initialize
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    start();
    setShortsBlocking(settings.shortsBlocked);
  });
})();
