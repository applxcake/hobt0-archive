// Background service worker for hobt0 extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('hobt0 extension installed');
});

// Listen for auth token from web app
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTH_TOKEN') {
    chrome.storage.local.set({
      hobt0_token: request.token,
      hobt0_user: request.user,
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // This only fires if no popup is defined in manifest
  // With popup defined, this won't trigger
});
