// MV3 service worker. Polls the server every minute (via chrome.alarms — service
// workers can't hold long-lived connections reliably) for "your turn" status,
// updates the action badge, and fires a notification when it's our turn.
import { storage } from '../shared/storage';

const API = 'http://localhost:3001';
const POLL_NAME = 'uno-poll';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_NAME, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== POLL_NAME) return;
  try {
    const jwt = await storage.get('uno_jwt');
    if (!jwt) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const res = await fetch(`${API}/me/active-game`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { yourTurn?: boolean; gameId?: string };
    if (data.yourTurn) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#00FF88' });
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'UNO ONCHAIN',
        message: "It's your turn!",
      });
    } else if (data.gameId) {
      await chrome.action.setBadgeText({ text: '·' });
      await chrome.action.setBadgeBackgroundColor({ color: '#FF4444' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    /* swallow — extension polls again next interval */
  }
});
