import { CalendarService } from '../utils/calendar.js';
import { StorageService } from '../utils/storage.js';
import { getWeekDates, calculateProgress } from '../utils/helpers.js';
import { calculateRequiredOutreach, calculateWeeklyTargets, generateSundayPlan, DEFAULT_RATES } from '../utils/funnel.js';

const calendarService = new CalendarService();
const storageService = new StorageService();

// Set up alarms
chrome.runtime.onInstalled.addListener(async () => {
  await setupAlarms();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarms();
  await updateBadge();
});

async function setupAlarms() {
  // Clear existing alarms
  await chrome.alarms.clearAll();

  const settings = await storageService.get('settings') || { notifications: {}, notificationTimes: {} };
  const times = settings.notificationTimes || {};

  // Check progress every 30 minutes
  chrome.alarms.create('checkProgress', { periodInMinutes: 30 });

  // Morning briefing (default 9 AM)
  if (settings.notifications?.morning !== false) {
    const morningHour = times.morningHour ?? 9;
    const morning = getNextAlarmTime(morningHour, 0);
    chrome.alarms.create('morningBriefing', { when: morning, periodInMinutes: 1440 });
  }

  // Weekly report (default Friday 5 PM)
  if (settings.notifications?.weekly !== false) {
    const weeklyDay = times.weeklyDay ?? 5;
    const weeklyHour = times.weeklyHour ?? 17;
    const weekly = getNextDayAlarmTime(weeklyDay, weeklyHour, 0);
    chrome.alarms.create('weeklyReport', { when: weekly, periodInMinutes: 10080 });
  }

  // Outreach plan (default Sunday 6 PM)
  if (settings.notifications?.sunday !== false) {
    const sundayDay = times.sundayDay ?? 0;
    const sundayHour = times.sundayHour ?? 18;
    const sunday = getNextDayAlarmTime(sundayDay, sundayHour, 0);
    chrome.alarms.create('sundayPlan', { when: sunday, periodInMinutes: 10080 });
  }
}

function getNextAlarmTime(hour, minute) {
  const now = new Date();
  const alarm = new Date(now);
  alarm.setHours(hour, minute, 0, 0);

  if (alarm <= now) {
    alarm.setDate(alarm.getDate() + 1);
  }

  return alarm.getTime();
}

function getNextDayAlarmTime(targetDay, hour, minute) {
  const now = new Date();
  const alarm = new Date(now);
  const dayOfWeek = alarm.getDay();
  let daysUntil = (targetDay - dayOfWeek + 7) % 7;

  // If it's today, check if time has passed
  if (daysUntil === 0) {
    alarm.setHours(hour, minute, 0, 0);
    if (alarm <= now) {
      daysUntil = 7;
    }
  }

  alarm.setDate(alarm.getDate() + daysUntil);
  alarm.setHours(hour, minute, 0, 0);

  return alarm.getTime();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'checkProgress':
      await updateBadge();
      break;
    case 'morningBriefing':
      await sendMorningBriefing();
      break;
    case 'weeklyReport':
      await sendWeeklyReport();
      break;
    case 'sundayPlan':
      await sendSundayPlan();
      break;
  }
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

    const settings = await storageService.get('settings') || {};
    const { start, end } = getWeekDates();
    const events = await calendarService.getEvents(start, end);

    // Count screenings
    let totalCurrent = 0;
    let totalTarget = 0;
    const keywords = settings.screenKeywords || ['screen', 'interview'];

    roles.forEach(role => {
      const rates = role.conversionRates || DEFAULT_RATES;
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      totalTarget += Math.ceil(funnel.screens / 4);

      events.forEach(event => {
        const title = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const combined = `${title} ${description}`;

        const isScreen = keywords.some(kw => combined.includes(kw.toLowerCase()));
        if (!isScreen) return;

        const matches = role.searchTerms?.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          totalCurrent++;
        }
      });
    });

    const progress = calculateProgress(totalCurrent, totalTarget);
    const remaining = Math.max(0, totalTarget - totalCurrent);

    chrome.action.setBadgeText({ text: remaining > 0 ? remaining.toString() : '✓' });

    if (progress >= 80) {
      chrome.action.setBadgeBackgroundColor({ color: '#00c853' });
    } else if (progress >= 50) {
      chrome.action.setBadgeBackgroundColor({ color: '#ffc107' });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#ff5252' });
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff5252' });
  }
}

async function sendMorningBriefing() {
  try {
    const roles = await storageService.get('roles') || [];
    if (roles.length === 0) return;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dayName = dayNames[today.getDay()];

    // Skip weekends
    if (today.getDay() === 0 || today.getDay() === 6) return;

    let totalOutreach = 0;
    roles.forEach(role => {
      const rates = role.conversionRates || DEFAULT_RATES;
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      const weeklyTargets = calculateWeeklyTargets(funnel.outreach);
      totalOutreach += Math.ceil(weeklyTargets.weekly / 5);
    });

    chrome.notifications.create('morningBriefing', {
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: `Good morning! Happy ${dayName}`,
      message: `Today's target: ${totalOutreach} total outreach across ${roles.length} roles. Let's hit those goals!`,
      priority: 2
    });
  } catch (error) {
    console.error('Failed to send morning briefing:', error);
  }
}

async function sendWeeklyReport() {
  try {
    const roles = await storageService.get('roles') || [];
    const settings = await storageService.get('settings') || {};
    const { start, end } = getWeekDates();
    const events = await calendarService.getEvents(start, end);

    let totalScreens = 0;
    let totalTarget = 0;
    const keywords = settings.screenKeywords || ['screen', 'interview'];

    roles.forEach(role => {
      const rates = role.conversionRates || DEFAULT_RATES;
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      totalTarget += Math.ceil(funnel.screens / 4);

      events.forEach(event => {
        const title = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const combined = `${title} ${description}`;

        const isScreen = keywords.some(kw => combined.includes(kw.toLowerCase()));
        if (!isScreen) return;

        const matches = role.searchTerms?.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          totalScreens++;
        }
      });
    });

    const progress = Math.round((totalScreens / totalTarget) * 100);
    let message = '';

    if (progress >= 100) {
      message = `Amazing week! You completed ${totalScreens} screens (${progress}% of goal). Keep it up!`;
    } else if (progress >= 80) {
      message = `Great week! ${totalScreens}/${totalTarget} screens (${progress}%). Almost hit your target!`;
    } else {
      message = `Week complete: ${totalScreens}/${totalTarget} screens (${progress}%). Let's push harder next week!`;
    }

    chrome.notifications.create('weeklyReport', {
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: '📊 Weekly Performance Report',
      message,
      priority: 2
    });

    // Record weekly data for learning
    await recordWeeklyHistoricalData(roles, events, keywords);
  } catch (error) {
    console.error('Failed to send weekly report:', error);
  }
}

async function sendSundayPlan() {
  try {
    const roles = await storageService.get('roles') || [];
    if (roles.length === 0) return;

    let totalOutreach = 0;
    const focusRoles = [];

    roles.forEach(role => {
      const rates = role.conversionRates || DEFAULT_RATES;
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      const weeklyTargets = calculateWeeklyTargets(funnel.outreach);
      totalOutreach += weeklyTargets.weekly;

      focusRoles.push({
        name: role.name,
        outreach: weeklyTargets.weekly
      });
    });

    // Sort by outreach needed
    focusRoles.sort((a, b) => b.outreach - a.outreach);
    const topRole = focusRoles[0];

    chrome.notifications.create('sundayPlan', {
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: '📋 Next Week Outreach Plan',
      message: `Total: ${totalOutreach} outreach needed. Focus on ${topRole.name} (${topRole.outreach} messages). Sunday prep = Monday success!`,
      priority: 2
    });
  } catch (error) {
    console.error('Failed to send Sunday plan:', error);
  }
}

async function recordWeeklyHistoricalData(roles, events, keywords) {
  try {
    const weekKey = new Date().toISOString().slice(0, 10);
    let historicalData = await storageService.get('historicalData') || [];

    roles.forEach(role => {
      let screens = 0;

      events.forEach(event => {
        const title = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const combined = `${title} ${description}`;

        const isScreen = keywords.some(kw => combined.includes(kw.toLowerCase()));
        if (!isScreen) return;

        const matches = role.searchTerms?.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          screens++;
        }
      });

      historicalData.push({
        week: weekKey,
        role: role.name,
        screens,
        outreach: 0, // Would need manual input or ATS integration
        responses: 0,
        passedScreens: 0,
        offers: 0,
        hires: 0
      });
    });

    // Keep last 12 weeks per role
    const maxEntries = 12 * roles.length;
    if (historicalData.length > maxEntries) {
      historicalData = historicalData.slice(-maxEntries);
    }

    await storageService.set('historicalData', historicalData);
  } catch (error) {
    console.error('Failed to record historical data:', error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'updateAlarms') {
    setupAlarms().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getScreeningData') {
    getScreeningData().then(data => sendResponse(data));
    return true;
  }
});

async function getScreeningData() {
  try {
    const roles = await storageService.get('roles') || [];
    const settings = await storageService.get('settings') || {};
    const { start, end } = getWeekDates();
    const events = await calendarService.getEvents(start, end);
    const keywords = settings.screenKeywords || ['screen', 'interview'];

    const screenings = {};
    roles.forEach(role => {
      screenings[role.name] = 0;
    });

    events.forEach(event => {
      const title = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const combined = `${title} ${description}`;

      const isScreen = keywords.some(kw => combined.includes(kw.toLowerCase()));
      if (!isScreen) return;

      roles.forEach(role => {
        const matches = role.searchTerms?.some(term =>
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
