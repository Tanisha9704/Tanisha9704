/**
 * Content script that runs on the UNO website. Its only job is to expose a tiny
 * window message bridge so the popup can pull a fresh JWT after sign-in.
 *
 * The popup invokes `chrome.scripting.executeScript` directly (see Popup.tsx)
 * to read localStorage, so this content script is mostly reserved for future
 * features (e.g. a "play in extension" button injected on the site).
 */
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'UNO_GET_TOKEN') return;
  const token = localStorage.getItem('uno_jwt');
  window.postMessage({ type: 'UNO_TOKEN_RESPONSE', token }, '*');
});
