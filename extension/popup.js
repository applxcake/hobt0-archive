// Extension popup script
const API_BASE = 'https://hobt0.tech';

// DOM Elements
const loginSection = document.getElementById('login-section');
const saveSection = document.getElementById('save-section');
const successSection = document.getElementById('success-section');
const authStatus = document.getElementById('auth-status');
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const customTitleInput = document.getElementById('custom-title');
const customSummaryInput = document.getElementById('custom-summary');
const tagsInput = document.getElementById('tags');
const saveBtn = document.getElementById('save-btn');
const loginBtn = document.getElementById('login-btn');
const openArchiveBtn = document.getElementById('open-archive-btn');

let currentTab = null;
let authToken = null;

// Initialize
async function init() {
  // Get current tab info
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  
  if (currentTab) {
    pageTitle.textContent = currentTab.title || 'Untitled';
    pageUrl.textContent = currentTab.url;
  }

  // Check auth status
  const result = await chrome.storage.local.get(['hobt0_token', 'hobt0_user']);
  authToken = result.hobt0_token;
  
  if (authToken) {
    showSaveSection();
  } else {
    showLoginSection();
  }
}

function showLoginSection() {
  loginSection.classList.remove('hidden');
  saveSection.classList.add('hidden');
  successSection.classList.add('hidden');
  authStatus.textContent = 'Not signed in';
}

function showSaveSection() {
  loginSection.classList.add('hidden');
  saveSection.classList.remove('hidden');
  successSection.classList.add('hidden');
  authStatus.textContent = 'Signed in';
  authStatus.classList.add('logged-in');
}

function showSuccessSection() {
  loginSection.classList.add('hidden');
  saveSection.classList.add('hidden');
  successSection.classList.remove('hidden');
}

// Login button
loginBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: `${API_BASE}/login` });
  window.close();
});

// Save button
saveBtn?.addEventListener('click', async () => {
  if (!currentTab?.url) return;
  
  saveBtn.disabled = true;
  const btnText = saveBtn.querySelector('.btn-text');
  const btnLoading = saveBtn.querySelector('.btn-loading');
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');

  try {
    const cardData = {
      url: currentTab.url,
      title: customTitleInput.value.trim() || currentTab.title,
      summary_text: customSummaryInput.value.trim(),
      tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
    };

    const response = await fetch(`${API_BASE}/api/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(cardData),
    });

    if (response.ok) {
      showSuccessSection();
    } else if (response.status === 401) {
      // Token expired
      await chrome.storage.local.remove(['hobt0_token', 'hobt0_user']);
      showLoginSection();
    } else {
      throw new Error('Failed to save');
    }
  } catch (err) {
    console.error('Save error:', err);
    alert('Failed to save. Please try again.');
    saveBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
});

// Open archive button
openArchiveBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: API_BASE });
  window.close();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
