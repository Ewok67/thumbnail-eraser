// Thumbnail Eraser - Content Script
// Replaces YouTube thumbnails with HIGH-QUALITY midpoint frames from the video
// Based on honest-thumbnails approach: maxres1/2/3.jpg (1280x720) and hq1/2/3.jpg (480x360)

(() => {
  'use strict';

  const DEFAULTS = { enabled: false, frame: 2 }; // frame: 1=early(25%), 2=mid(50%), 3=late(75%)
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

  // ---- Scanning & Observing ----
  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.tagName === 'IMG') processImg(root);
    else if (root.getAttribute?.('style')) processBg(root);
    
    // Scan all img with ytimg.com/vi in src
    for (const img of root.querySelectorAll('img[src*="ytimg.com/vi"]')) processImg(img);
    // Scan all elements with ytimg.com/vi in style
    for (const el of root.querySelectorAll('[style*="ytimg.com/vi"]')) processBg(el);
  }

  const observer = new MutationObserver((mutations) => {
    if (!settings.enabled) return;
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
  }

  function start() {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'style'],
    });
    if (settings.enabled) scan(document);
  }

  // ---- Storage & Events ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = newValue ?? DEFAULTS[key];
    }
    revertAll();
    if (settings.enabled) scan(document);
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

  // Initialize
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    start();
  });
})();
