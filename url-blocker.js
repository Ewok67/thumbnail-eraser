// URL Blocker - Content Script
// Checks current URL against forbidden word list and redirects to google.com if match found

(() => {
  'use strict';

  const STORAGE_KEY = 'forbiddenWords';
  const DEFAULT_WORDS = [
    'casino', 'gambling', 'betting', 'poker', 'slots',
    'malware', 'phishing', 'scam', 'fraud',
    'adult', 'porn', 'xxx', 'sex',
    'drugs', 'cocaine', 'heroin', 'meth'
  ];

  let forbiddenWords = [...DEFAULT_WORDS];
  let enabled = true;

  // Load settings from storage
  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get([STORAGE_KEY, 'urlBlockerEnabled']);
      if (stored[STORAGE_KEY] && Array.isArray(stored[STORAGE_KEY])) {
        forbiddenWords = stored[STORAGE_KEY].filter(w => w && w.trim());
      }
      enabled = stored.urlBlockerEnabled !== false; // default true
    } catch (e) {
      console.error('[URL Blocker] Failed to load settings:', e);
    }
  }

  // Check if URL contains any forbidden word
  function checkUrl(url) {
    if (!enabled || !forbiddenWords.length) return null;
    
    const lowerUrl = url.toLowerCase();
    for (const word of forbiddenWords) {
      const cleanWord = word.toLowerCase().trim();
      if (cleanWord && lowerUrl.includes(cleanWord)) {
        return cleanWord;
      }
    }
    return null;
  }

  // Redirect to google.com
  function redirectToGoogle(matchedWord) {
    console.log(`[URL Blocker] Blocked navigation: matched "${matchedWord}"`);
    window.location.replace('https://www.google.com/search?q=blocked+' + encodeURIComponent(matchedWord));
  }

  // Main check function
  function checkAndRedirect() {
    const matched = checkUrl(window.location.href);
    if (matched) {
      redirectToGoogle(matched);
    }
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    
    if (changes[STORAGE_KEY]) {
      const newWords = changes[STORAGE_KEY].newValue;
      if (Array.isArray(newWords)) {
        forbiddenWords = newWords.filter(w => w && w.trim());
      }
      checkAndRedirect();
    }
    
    if (changes.urlBlockerEnabled) {
      enabled = changes.urlBlockerEnabled.newValue !== false;
      if (enabled) checkAndRedirect();
    }
  });

  // Initial load and check
  loadSettings().then(() => {
    checkAndRedirect();
  });

  // Also check on SPA navigation (for SPAs that change URL without reload)
  let lastUrl = window.location.href;
  const urlCheckInterval = setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      checkAndRedirect();
    }
  }, 500);

  window.addEventListener('popstate', () => {
    checkAndRedirect();
  });

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    clearInterval(urlCheckInterval);
  });
})();