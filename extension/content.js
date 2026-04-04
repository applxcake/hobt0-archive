// Content script for hobt0 extension
// This runs on every page to communicate with the web app

// Listen for messages from the web app
window.addEventListener('message', async (event) => {
  // Only accept messages from the same origin
  if (event.origin !== 'https://hobt0.tech') return;
  
  if (event.data.type === 'EXTENSION_AUTH') {
    // Send auth token to extension
    try {
      await chrome.runtime.sendMessage({
        type: 'AUTH_TOKEN',
        token: event.data.token,
        user: event.data.user,
      });
    } catch (err) {
      console.error('Failed to send auth to extension:', err);
    }
  }
});
