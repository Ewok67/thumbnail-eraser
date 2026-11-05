// Blocklist Manager - Popup Script
// Manages the forbidden words list

const STORAGE_KEY = 'forbiddenWords';
const ENABLED_KEY = 'urlBlockerEnabled';

const wordInput = document.getElementById('wordInput');
const addBtn = document.getElementById('addBtn');
const wordList = document.getElementById('wordList');
const emptyState = document.getElementById('emptyState');
const enabledToggle = document.getElementById('enabledToggle');
const wordCount = document.getElementById('wordCount');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

let words = [];

// Load words from storage
async function loadWords() {
  try {
    const stored = await chrome.storage.sync.get([STORAGE_KEY, ENABLED_KEY]);
    if (stored[STORAGE_KEY] && Array.isArray(stored[STORAGE_KEY])) {
      words = stored[STORAGE_KEY].filter(w => w && w.trim());
    }
    enabledToggle.checked = stored[ENABLED_KEY] !== false;
    renderList();
  } catch (e) {
    console.error('Failed to load words:', e);
  }
}

// Save words to storage
async function saveWords() {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: words });
    renderList();
  } catch (e) {
    console.error('Failed to save words:', e);
  }
}

// Render the word list
function renderList() {
  wordList.innerHTML = '';
  
  if (words.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    words.forEach((word, index) => {
      const li = document.createElement('li');
      li.className = 'word-item';
      li.innerHTML = `
        <span class="word-text">${escapeHtml(word)}</span>
        <div class="word-actions">
          <button class="icon-btn edit" data-index="${index}" title="Edit">✏️</button>
          <button class="icon-btn delete" data-index="${index}" title="Delete">🗑️</button>
        </div>
      `;
      wordList.appendChild(li);
    });
  }
  wordCount.textContent = `${words.length} word${words.length !== 1 ? 's' : ''}`;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add word
function addWord() {
  const word = wordInput.value.trim().toLowerCase();
  if (!word) return;
  if (words.includes(word)) {
    alert('Word already exists');
    return;
  }
  words.push(word);
  wordInput.value = '';
  saveWords();
}

// Delete word
function deleteWord(index) {
  words.splice(index, 1);
  saveWords();
}

// Edit word
function editWord(index) {
  const newWord = prompt('Edit word:', words[index]);
  if (newWord !== null) {
    const trimmed = newWord.trim().toLowerCase();
    if (trimmed && !words.includes(trimmed)) {
      words[index] = trimmed;
      saveWords();
    } else if (words.includes(trimmed)) {
      alert('Word already exists');
    }
  }
}

// Toggle enabled
enabledToggle.addEventListener('change', async (e) => {
  await chrome.storage.sync.set({ [ENABLED_KEY]: e.target.checked });
});

// Add button
addBtn.addEventListener('click', addWord);
wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addWord();
});

// Event delegation for edit/delete
wordList.addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const index = parseInt(btn.dataset.index, 10);
  if (btn.classList.contains('delete')) {
    deleteWord(index);
  } else if (btn.classList.contains('edit')) {
    editWord(index);
  }
});

// Export
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(words, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'forbidden-words.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Import
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (Array.isArray(imported)) {
      const newWords = imported
        .filter(w => typeof w === 'string')
        .map(w => w.trim().toLowerCase())
        .filter(w => w && !words.includes(w));
      words.push(...newWords);
      await saveWords();
      alert(`Imported ${newWords.length} new words`);
    } else {
      alert('Invalid file format');
    }
  } catch (err) {
    alert('Failed to import: ' + err.message);
  }
  importFile.value = '';
});

// Initialize
loadWords();