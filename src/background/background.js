import { CalendarService } from '../utils/calendar.js';
import { StorageService } from '../utils/storage.js';
import { getWeekDates, calculateProgress } from '../utils/helpers.js';

const calendarService = new CalendarService();
const storageService = new StorageService();

// Set up alarm to check progress periodically
chrome.alarms.create('checkProgress', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkProgress') {
    await updateBadge();
  }
});

// Update badge when extension starts
chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
});

// Update badge when installed
chrome.runtime.onInstalled.addListener(async () => {
  await updateBadge();
});

async function updateBadge() {
  try {
    const token = await storageService.get('authToken');
    if (!token) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const roles = await storageService.get('roles') || [];
    if (roles.length === 0) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const { start, end } = getWeekDates();
    const events = await calendarService.getEvents(start, end);

    // Count total screenings
    let totalCurrent = 0;
    let totalTarget = 0;

    roles.forEach(role => {
      totalTarget += role.weeklyTarget;

      events.forEach(event => {
        const title = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const combined = `${title} ${description}`;

        const matches = role.searchTerms.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          totalCurrent++;
        }
      });
    });

    const progress = calculateProgress(totalCurrent, totalTarget);

    // Update badge
    const remaining = totalTarget - totalCurrent;
    chrome.action.setBadgeText({ text: remaining > 0 ? remaining.toString() : '✓' });

    // Set badge color based on progress
    if (progress >= 80) {
      chrome.action.setBadgeBackgroundColor({ color: '#00c853' }); // Green
    } else if (progress >= 50) {
      chrome.action.setBadgeBackgroundColor({ color: '#ffc107' }); // Yellow
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#ff5252' }); // Red
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff5252' });
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getScreeningData') {
    getScreeningData().then(data => sendResponse(data));
    return true;
  }
});

async function getScreeningData() {
  try {
    const roles = await storageService.get('roles') || [];
    const { start, end } = getWeekDates();
    const events = await calendarService.getEvents(start, end);

    const screenings = {};
    roles.forEach(role => {
      screenings[role.name] = 0;
    });

    events.forEach(event => {
      const title = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const combined = `${title} ${description}`;

      roles.forEach(role => {
        const matches = role.searchTerms.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          screenings[role.name]++;
        }
      });
    });

    return { roles, screenings, events };
  } catch (error) {
    console.error('Failed to get screening data:', error);
    return { roles: [], screenings: {}, events: [] };
  }
}
