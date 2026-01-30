import { CalendarService } from '../utils/calendar.js';
import { StorageService } from '../utils/storage.js';
import { getWeekDates, calculateProgress, getStatusClass, getDaysRemaining, getRequiredDailyRate } from '../utils/helpers.js';
import {
  calculateRequiredOutreach,
  calculateWeeklyTargets,
  calculateOutreachDistribution,
  getWeeksRemainingInMonth,
  getWorkDaysRemainingInWeek,
  calculateProgressToPlan,
  generateMorningBriefing,
  DEFAULT_RATES
} from '../utils/funnel.js';
import {
  parseJobDescription,
  generateSearchQueries,
  buildSearchUrl,
  QUICK_SEARCHES
} from '../utils/sourcing.js';

class PopupApp {
  constructor() {
    this.calendarService = new CalendarService();
    this.storageService = new StorageService();
    this.isAuthenticated = false;
    this.roles = [];
    this.screenings = {};
    this.settings = {};
    this.currentTab = 'dashboard';
    this.editingRoleIndex = -1;
    this.monthlyData = {};
    this.historicalData = [];
    this.sourcingData = {};
    this.outreachLog = [];
    this.generatedSearches = [];

    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.checkAuth();
    await this.loadData();
    this.render();
  }

  bindElements() {
    // Auth
    this.authSection = document.getElementById('authSection');
    this.authButton = document.getElementById('authButton');

    // Tabs
    this.tabNav = document.getElementById('tabNav');
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.dashboardTab = document.getElementById('dashboardTab');
    this.weeklyTab = document.getElementById('weeklyTab');
    this.monthlyTab = document.getElementById('monthlyTab');

    // Dashboard elements
    this.briefingContent = document.getElementById('briefingContent');
    this.todayScreens = document.getElementById('todayScreens');
    this.weekProgress = document.getElementById('weekProgress');
    this.monthProgress = document.getElementById('monthProgress');
    this.outreachTargets = document.getElementById('outreachTargets');
    this.settingsButton = document.getElementById('settingsButton');

    // Weekly elements
    this.weekLabel = document.getElementById('weekLabel');
    this.weekStatus = document.getElementById('weekStatus');
    this.rolesList = document.getElementById('rolesList');
    this.totalScreenings = document.getElementById('totalScreenings');
    this.totalOutreach = document.getElementById('totalOutreach');
    this.overallProgress = document.getElementById('overallProgress');

    // Monthly elements
    this.monthLabel = document.getElementById('monthLabel');
    this.monthTarget = document.getElementById('monthTarget');
    this.planMessage = document.getElementById('planMessage');
    this.monthlyRoles = document.getElementById('monthlyRoles');

    // Settings
    this.settingsSection = document.getElementById('settingsSection');
    this.closeSettings = document.getElementById('closeSettings');
    this.monthlyHireTarget = document.getElementById('monthlyHireTarget');
    this.rolesConfig = document.getElementById('rolesConfig');
    this.addRoleBtn = document.getElementById('addRoleBtn');
    this.screenKeywords = document.getElementById('screenKeywords');
    this.morningNotif = document.getElementById('morningNotif');
    this.morningTime = document.getElementById('morningTime');
    this.weeklyNotif = document.getElementById('weeklyNotif');
    this.weeklyDay = document.getElementById('weeklyDay');
    this.weeklyTime = document.getElementById('weeklyTime');
    this.sundayNotif = document.getElementById('sundayNotif');
    this.sundayDay = document.getElementById('sundayDay');
    this.sundayTime = document.getElementById('sundayTime');
    this.saveSettings = document.getElementById('saveSettings');
    this.cancelSettings = document.getElementById('cancelSettings');

    // Role Modal
    this.roleModal = document.getElementById('roleModal');
    this.roleModalTitle = document.getElementById('roleModalTitle');
    this.closeRoleModal = document.getElementById('closeRoleModal');
    this.roleName = document.getElementById('roleName');
    this.roleHireTarget = document.getElementById('roleHireTarget');
    this.roleSearchTerms = document.getElementById('roleSearchTerms');
    this.rateResponse = document.getElementById('rateResponse');
    this.rateInterest = document.getElementById('rateInterest');
    this.rateScreen = document.getElementById('rateScreen');
    this.ratePassThrough = document.getElementById('ratePassThrough');
    this.rateOffer = document.getElementById('rateOffer');
    this.rateAccept = document.getElementById('rateAccept');
    this.calculatedOutreach = document.getElementById('calculatedOutreach');
    this.deleteRole = document.getElementById('deleteRole');
    this.saveRole = document.getElementById('saveRole');

    // Sourcing Tab
    this.sourcingTab = document.getElementById('sourcingTab');
    this.sourcingRole = document.getElementById('sourcingRole');
    this.jdInput = document.getElementById('jdInput');
    this.parseJdBtn = document.getElementById('parseJdBtn');
    this.templateBtns = document.querySelectorAll('.template-btn');
    this.locationInput = document.getElementById('locationInput');
    this.excludeOtw = document.getElementById('excludeOtw');
    this.searchResults = document.getElementById('searchResults');
    this.searchList = document.getElementById('searchList');
    this.outreachCount = document.getElementById('outreachCount');
    this.logOutreachBtn = document.getElementById('logOutreachBtn');

    // Outreach Modal
    this.outreachModal = document.getElementById('outreachModal');
    this.closeOutreachModal = document.getElementById('closeOutreachModal');
    this.outreachRole = document.getElementById('outreachRole');
    this.outreachNumber = document.getElementById('outreachNumber');
    this.outreachNotes = document.getElementById('outreachNotes');
    this.saveOutreach = document.getElementById('saveOutreach');
  }

  bindEvents() {
    // Auth
    this.authButton.addEventListener('click', () => this.authenticate());

    // Tabs
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Settings
    this.settingsButton.addEventListener('click', () => this.showSettings());
    this.closeSettings.addEventListener('click', () => this.hideSettings());
    this.saveSettings.addEventListener('click', () => this.saveSettingsData());
    this.cancelSettings.addEventListener('click', () => this.hideSettings());
    this.addRoleBtn.addEventListener('click', () => this.openRoleModal(-1));

    // Role Modal
    this.closeRoleModal.addEventListener('click', () => this.closeRoleModalHandler());
    this.saveRole.addEventListener('click', () => this.saveRoleData());
    this.deleteRole.addEventListener('click', () => this.deleteRoleData());

    // Rate inputs - recalculate on change
    const rateInputs = [
      this.rateResponse, this.rateInterest, this.rateScreen,
      this.ratePassThrough, this.rateOffer, this.rateAccept
    ];
    rateInputs.forEach(input => {
      input.addEventListener('input', () => this.updateOutreachPreview());
    });

    // Sourcing
    this.parseJdBtn.addEventListener('click', () => this.generateSearches());
    this.templateBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.useTemplate(e.target.dataset.template));
    });

    // Outreach logging
    this.logOutreachBtn.addEventListener('click', () => this.openOutreachModal());
    this.closeOutreachModal.addEventListener('click', () => this.closeOutreachModalHandler());
    this.saveOutreach.addEventListener('click', () => this.saveOutreachData());
  }

  async checkAuth() {
    try {
      const token = await this.storageService.get('authToken');
      this.isAuthenticated = !!token;
    } catch (error) {
      console.error('Auth check failed:', error);
      this.isAuthenticated = false;
    }
  }

  async authenticate() {
    try {
      this.authButton.innerHTML = '<span>⏳</span> Connecting...';
      this.authButton.disabled = true;

      const token = await chrome.identity.getAuthToken({ interactive: true });
      await this.storageService.set('authToken', token.token);
      this.isAuthenticated = true;

      await this.loadData();
      this.render();
    } catch (error) {
      console.error('Authentication failed:', error);
      this.authButton.innerHTML = '<span>🚀</span> Connect Calendar';
      this.authButton.disabled = false;
      alert('Failed to connect to Google Calendar. Please try again.');
    }
  }

  async loadData() {
    if (!this.isAuthenticated) return;

    try {
      // Load settings
      this.settings = await this.storageService.get('settings') || {
        monthlyHireTarget: 5,
        screenKeywords: ['screen', 'phone screen', 'interview', 'screening'],
        notifications: { morning: true, weekly: true, sunday: true }
      };

      // Load roles with conversion rates
      this.roles = await this.storageService.get('roles') || this.getDefaultRoles();

      // Load historical data for learning
      this.historicalData = await this.storageService.get('historicalData') || [];

      // Load monthly tracking data
      const currentMonth = new Date().toISOString().slice(0, 7);
      this.monthlyData = await this.storageService.get(`monthlyData_${currentMonth}`) || {
        outreach: {},
        responses: {},
        screens: {},
        hires: {}
      };

      // Get this week's calendar events
      const { start, end } = getWeekDates();
      const events = await this.calendarService.getEvents(start, end);

      // Count screenings per role
      this.screenings = this.countScreenings(events);
      this.todayScreenings = this.countTodayScreenings(events);

      // Update learned rates based on historical data
      this.updateLearnedRates();

      // Load sourcing data
      this.sourcingData = await this.storageService.get('sourcingData') || {
        searches: [],
        companies: {},
        titles: {},
        skills: {}
      };
      this.outreachLog = await this.storageService.get('outreachLog') || [];
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  getDefaultRoles() {
    return [
      {
        name: 'Software Engineer',
        monthlyHireTarget: 2,
        searchTerms: ['software engineer', 'swe', 'developer', 'eng screen'],
        conversionRates: { ...DEFAULT_RATES }
      },
      {
        name: 'Product Manager',
        monthlyHireTarget: 1,
        searchTerms: ['product manager', 'pm screen', 'product screen'],
        conversionRates: { ...DEFAULT_RATES }
      }
    ];
  }

  countScreenings(events) {
    const counts = {};
    const keywords = this.settings.screenKeywords || ['screen', 'interview'];

    this.roles.forEach(role => {
      counts[role.name] = 0;
    });

    events.forEach(event => {
      const title = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const combined = `${title} ${description}`;

      // Check if it's a screening event
      const isScreen = keywords.some(kw => combined.includes(kw.toLowerCase()));
      if (!isScreen) return;

      // Match to role
      this.roles.forEach(role => {
        const matches = role.searchTerms.some(term =>
          combined.includes(term.toLowerCase())
        );
        if (matches) {
          counts[role.name]++;
        }
      });
    });

    return counts;
  }

  countTodayScreenings(events) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const keywords = this.settings.screenKeywords || ['screen', 'interview'];
    let count = 0;

    events.forEach(event => {
      const eventStart = new Date(event.start?.dateTime || event.start?.date);
      if (eventStart >= today && eventStart < tomorrow) {
        const title = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const combined = `${title} ${description}`;

        if (keywords.some(kw => combined.includes(kw.toLowerCase()))) {
          count++;
        }
      }
    });

    return count;
  }

  // Learning system - update rates based on actual performance
  updateLearnedRates() {
    if (this.historicalData.length < 4) return; // Need at least 4 weeks of data

    this.roles.forEach(role => {
      const roleHistory = this.historicalData.filter(d => d.role === role.name);
      if (roleHistory.length < 4) return;

      // Calculate actual rates from history
      const totals = roleHistory.reduce((acc, week) => {
        acc.outreach += week.outreach || 0;
        acc.responses += week.responses || 0;
        acc.screens += week.screens || 0;
        acc.passedScreens += week.passedScreens || 0;
        acc.offers += week.offers || 0;
        acc.hires += week.hires || 0;
        return acc;
      }, { outreach: 0, responses: 0, screens: 0, passedScreens: 0, offers: 0, hires: 0 });

      // Calculate learned rates (with safeguards)
      if (totals.outreach > 0 && totals.responses > 0) {
        role.learnedRates = {
          responseRate: Math.min(0.5, totals.responses / totals.outreach),
          interestRate: role.conversionRates.interestRate, // Keep manual for now
          screenRate: role.conversionRates.screenRate,
          passThrough: totals.screens > 0 ? totals.passedScreens / totals.screens : role.conversionRates.passThrough,
          offerRate: totals.passedScreens > 0 ? totals.offers / totals.passedScreens : role.conversionRates.offerRate,
          acceptRate: totals.offers > 0 ? totals.hires / totals.offers : role.conversionRates.acceptRate
        };
      }
    });
  }

  // Get effective rates (learned or manual)
  getEffectiveRates(role) {
    if (role.learnedRates && this.historicalData.length >= 4) {
      // Blend learned with manual (70% learned, 30% manual) for stability
      const blend = {};
      Object.keys(DEFAULT_RATES).forEach(key => {
        const learned = role.learnedRates[key] || role.conversionRates[key];
        const manual = role.conversionRates[key];
        blend[key] = (learned * 0.7) + (manual * 0.3);
      });
      return blend;
    }
    return role.conversionRates || DEFAULT_RATES;
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update tab buttons
    this.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Show/hide tab content
    this.dashboardTab.classList.toggle('hidden', tab !== 'dashboard');
    this.weeklyTab.classList.toggle('hidden', tab !== 'weekly');
    this.monthlyTab.classList.toggle('hidden', tab !== 'monthly');
    this.sourcingTab.classList.toggle('hidden', tab !== 'sourcing');

    // Render sourcing tab when switched to
    if (tab === 'sourcing') {
      this.renderSourcing();
    }
  }

  render() {
    if (!this.isAuthenticated) {
      this.authSection.classList.remove('hidden');
      this.tabNav.classList.add('hidden');
      this.dashboardTab.classList.add('hidden');
      this.weeklyTab.classList.add('hidden');
      this.monthlyTab.classList.add('hidden');
      this.sourcingTab.classList.add('hidden');
      this.settingsSection.classList.add('hidden');
      return;
    }

    this.authSection.classList.add('hidden');
    this.tabNav.classList.remove('hidden');
    this.settingsSection.classList.add('hidden');

    this.renderDashboard();
    this.renderWeekly();
    this.renderMonthly();
    this.renderSourcing();
    this.switchTab(this.currentTab);
  }

  renderDashboard() {
    // Morning briefing
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dayName = dayNames[today.getDay()];

    // Calculate what needs to be done today
    const outreachItems = this.roles.map(role => {
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      const weeklyTargets = calculateWeeklyTargets(funnel.outreach);
      const workDaysLeft = getWorkDaysRemainingInWeek() || 1;
      const dailyOutreach = Math.ceil(weeklyTargets.weekly / 5);

      return {
        role: role.name,
        outreach: dailyOutreach,
        screens: this.screenings[role.name] || 0
      };
    });

    this.briefingContent.innerHTML = `
      <div class="briefing-greeting">Happy ${dayName}!</div>
      <div class="briefing-motivation">${this.getMotivation()}</div>
    `;

    // Quick stats
    this.todayScreens.textContent = this.todayScreenings || 0;

    const weeklyProgress = this.calculateWeeklyProgress();
    this.weekProgress.textContent = `${weeklyProgress}%`;

    const monthlyProgress = this.calculateMonthlyProgress();
    this.monthProgress.textContent = `${monthlyProgress}%`;

    // Outreach targets
    this.outreachTargets.innerHTML = outreachItems.map(item => `
      <div class="outreach-item">
        <span class="outreach-role">${item.role}</span>
        <span class="outreach-target">${item.outreach} outreach</span>
      </div>
    `).join('');
  }

  getMotivation() {
    const progress = this.calculateMonthlyProgress();
    if (progress >= 100) return "You've hit your monthly target! Amazing work!";
    if (progress >= 80) return "Almost there! Final push to hit your goals.";
    if (progress >= 50) return "Solid progress. Keep the momentum going!";
    if (progress >= 25) return "Good start. Consistency is key.";
    return "Let's get after it today!";
  }

  calculateWeeklyProgress() {
    let totalCurrent = 0;
    let totalTarget = 0;

    this.roles.forEach(role => {
      totalCurrent += this.screenings[role.name] || 0;
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      totalTarget += Math.ceil(funnel.screens / 4); // Weekly screen target
    });

    return totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  }

  calculateMonthlyProgress() {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedProgress = dayOfMonth / daysInMonth;

    let totalCurrent = 0;
    let totalTarget = 0;

    this.roles.forEach(role => {
      totalCurrent += this.screenings[role.name] || 0; // This should be monthly screens
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      totalTarget += funnel.screens;
    });

    // Adjust for where we should be in the month
    const actualProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;
    return Math.round(actualProgress);
  }

  renderWeekly() {
    // Week label
    const { start, end } = getWeekDates();
    const options = { month: 'short', day: 'numeric' };
    this.weekLabel.textContent = `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;

    // Week status
    const weeklyProgress = this.calculateWeeklyProgress();
    const daysLeft = getDaysRemaining();
    let statusText = 'On Track';
    let statusClass = 'on-track';

    if (weeklyProgress >= 100) {
      statusText = 'Complete!';
      statusClass = 'complete';
    } else if (weeklyProgress < (100 - daysLeft * 15)) {
      statusText = 'Behind';
      statusClass = 'behind';
    }

    this.weekStatus.textContent = statusText;
    this.weekStatus.className = `week-status ${statusClass}`;

    // Role cards
    this.rolesList.innerHTML = this.roles.map((role, index) => {
      const current = this.screenings[role.name] || 0;
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      const weeklyScreenTarget = Math.ceil(funnel.screens / 4);
      const progress = calculateProgress(current, weeklyScreenTarget);
      const statusClass = getStatusClass(progress);

      return `
        <div class="role-card" data-role-index="${index}">
          <div class="role-header">
            <span class="role-name">${role.name}</span>
            <span class="role-count">
              <span class="current">${current}</span>
              <span class="target">/ ${weeklyScreenTarget}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${statusClass}" style="width: ${Math.min(progress, 100)}%"></div>
          </div>
          <div class="role-meta">
            <span class="hire-target">${role.monthlyHireTarget} hire${role.monthlyHireTarget !== 1 ? 's' : ''}/mo</span>
            ${role.learnedRates ? '<span class="learned-badge">AI-tuned</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to role cards
    this.rolesList.querySelectorAll('.role-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.roleIndex);
        this.openRoleModal(index);
      });
    });

    // Summary
    let totalScreens = 0;
    let totalScreenTarget = 0;
    let totalOutreachDone = 0;
    let totalOutreachTarget = 0;

    this.roles.forEach(role => {
      totalScreens += this.screenings[role.name] || 0;
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      totalScreenTarget += Math.ceil(funnel.screens / 4);
      totalOutreachTarget += Math.ceil(funnel.outreach / 4);
      totalOutreachDone += this.monthlyData.outreach?.[role.name] || 0;
    });

    this.totalScreenings.textContent = `${totalScreens} / ${totalScreenTarget}`;
    this.totalOutreach.textContent = `${Math.round(totalOutreachDone / 4)} / ${totalOutreachTarget}`;

    // Progress bar
    const overallProgress = totalScreenTarget > 0 ? (totalScreens / totalScreenTarget) * 100 : 0;
    this.overallProgress.style.width = `${Math.min(overallProgress, 100)}%`;
    this.overallProgress.className = `progress-fill runner ${getStatusClass(overallProgress)}`;
  }

  renderMonthly() {
    // Month label
    const now = new Date();
    this.monthLabel.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Total hire target
    const totalHireTarget = this.roles.reduce((sum, r) => sum + (r.monthlyHireTarget || 0), 0);
    this.monthTarget.textContent = `${totalHireTarget} Hire${totalHireTarget !== 1 ? 's' : ''} Target`;

    // Calculate funnel totals
    let funnelTotals = {
      outreach: { current: 0, target: 0 },
      responses: { current: 0, target: 0 },
      screens: { current: 0, target: 0 },
      finals: { current: 0, target: 0 },
      offers: { current: 0, target: 0 },
      hires: { current: 0, target: 0 }
    };

    this.roles.forEach(role => {
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);

      funnelTotals.outreach.target += funnel.outreach;
      funnelTotals.responses.target += funnel.responses;
      funnelTotals.screens.target += funnel.screens;
      funnelTotals.finals.target += funnel.finals;
      funnelTotals.offers.target += funnel.offers;
      funnelTotals.hires.target += funnel.hires;

      // Current values from tracking
      funnelTotals.outreach.current += this.monthlyData.outreach?.[role.name] || 0;
      funnelTotals.responses.current += this.monthlyData.responses?.[role.name] || 0;
      funnelTotals.screens.current += this.screenings[role.name] || 0;
      funnelTotals.hires.current += this.monthlyData.hires?.[role.name] || 0;
    });

    // Update funnel visualization
    const funnelSteps = ['outreach', 'responses', 'screens', 'finals', 'offers', 'hires'];
    funnelSteps.forEach(step => {
      const fillEl = document.getElementById(`funnel${step.charAt(0).toUpperCase() + step.slice(1)}`);
      const valueEl = document.getElementById(`funnel${step.charAt(0).toUpperCase() + step.slice(1)}Value`);

      if (fillEl && valueEl) {
        const current = funnelTotals[step].current;
        const target = funnelTotals[step].target;
        const progress = target > 0 ? (current / target) * 100 : 0;

        fillEl.style.width = `${Math.min(progress, 100)}%`;
        fillEl.className = `funnel-fill ${getStatusClass(progress)}`;
        valueEl.textContent = `${current} / ${target}`;
      }
    });

    // Progress to plan message
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedProgress = (dayOfMonth / daysInMonth) * 100;
    const actualProgress = this.calculateMonthlyProgress();
    const variance = actualProgress - expectedProgress;

    let planIcon = '📊';
    let planMsg = '';

    if (variance >= 10) {
      planIcon = '🚀';
      planMsg = `You're ${Math.round(variance)}% ahead of pace! Consider raising your targets.`;
    } else if (variance >= 0) {
      planIcon = '✅';
      planMsg = `On track! Keep up the consistent effort.`;
    } else if (variance >= -10) {
      planIcon = '⚠️';
      planMsg = `Slightly behind (${Math.round(Math.abs(variance))}%). A strong week can catch you up.`;
    } else {
      planIcon = '🔥';
      planMsg = `${Math.round(Math.abs(variance))}% behind pace. Focus on high-conversion roles.`;
    }

    document.querySelector('#planStatus .plan-icon').textContent = planIcon;
    this.planMessage.textContent = planMsg;

    // Monthly roles breakdown with recommendations
    const distribution = calculateOutreachDistribution(this.roles);

    this.monthlyRoles.innerHTML = distribution.map(role => {
      const rates = this.getEffectiveRates(role);
      const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, rates);
      const weeksLeft = getWeeksRemainingInMonth();
      const weeklyOutreach = Math.ceil(funnel.outreach / 4);

      return `
        <div class="monthly-role-card">
          <div class="monthly-role-header">
            <span class="monthly-role-name">${role.name}</span>
            <span class="monthly-role-focus">${role.distributionPercent}% focus</span>
          </div>
          <div class="monthly-role-stats">
            <span>Target: ${role.monthlyHireTarget} hire${role.monthlyHireTarget !== 1 ? 's' : ''}</span>
            <span>Outreach: ${weeklyOutreach}/wk</span>
          </div>
          <div class="monthly-role-efficiency">
            Efficiency: ${(role.efficiency * 10000).toFixed(2)}% outreach→hire
          </div>
        </div>
      `;
    }).join('');
  }

  showSettings() {
    this.tabNav.classList.add('hidden');
    this.dashboardTab.classList.add('hidden');
    this.weeklyTab.classList.add('hidden');
    this.monthlyTab.classList.add('hidden');
    this.settingsSection.classList.remove('hidden');

    // Populate settings
    this.monthlyHireTarget.value = this.settings.monthlyHireTarget || 5;
    this.screenKeywords.value = (this.settings.screenKeywords || []).join(', ');

    // Notification toggles
    this.morningNotif.checked = this.settings.notifications?.morning ?? true;
    this.weeklyNotif.checked = this.settings.notifications?.weekly ?? true;
    this.sundayNotif.checked = this.settings.notifications?.sunday ?? true;

    // Notification times
    this.morningTime.value = this.settings.notificationTimes?.morningHour ?? 9;
    this.weeklyDay.value = this.settings.notificationTimes?.weeklyDay ?? 5;
    this.weeklyTime.value = this.settings.notificationTimes?.weeklyHour ?? 17;
    this.sundayDay.value = this.settings.notificationTimes?.sundayDay ?? 0;
    this.sundayTime.value = this.settings.notificationTimes?.sundayHour ?? 18;

    // Render roles config
    this.renderRolesConfig();
  }

  hideSettings() {
    this.settingsSection.classList.add('hidden');
    this.render();
  }

  renderRolesConfig() {
    this.rolesConfig.innerHTML = this.roles.map((role, index) => `
      <div class="role-config-item" data-role-index="${index}">
        <span class="role-config-name">${role.name}</span>
        <span class="role-config-target">${role.monthlyHireTarget} hires/mo</span>
        <span class="role-config-arrow">›</span>
      </div>
    `).join('');

    // Add click handlers to role config items
    this.rolesConfig.querySelectorAll('.role-config-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.roleIndex);
        this.openRoleModal(index);
      });
    });
  }

  openRoleModal(index) {
    this.editingRoleIndex = index;
    this.roleModal.classList.remove('hidden');

    if (index === -1) {
      // New role
      this.roleModalTitle.textContent = 'Add Role';
      this.roleName.value = '';
      this.roleHireTarget.value = 1;
      this.roleSearchTerms.value = '';
      this.rateResponse.value = 15;
      this.rateInterest.value = 60;
      this.rateScreen.value = 80;
      this.ratePassThrough.value = 25;
      this.rateOffer.value = 50;
      this.rateAccept.value = 80;
      this.deleteRole.classList.add('hidden');
    } else {
      // Edit existing role
      const role = this.roles[index];
      this.roleModalTitle.textContent = 'Edit Role';
      this.roleName.value = role.name;
      this.roleHireTarget.value = role.monthlyHireTarget || 1;
      this.roleSearchTerms.value = (role.searchTerms || []).join(', ');

      const rates = role.conversionRates || DEFAULT_RATES;
      this.rateResponse.value = Math.round(rates.responseRate * 100);
      this.rateInterest.value = Math.round(rates.interestRate * 100);
      this.rateScreen.value = Math.round(rates.screenRate * 100);
      this.ratePassThrough.value = Math.round(rates.passThrough * 100);
      this.rateOffer.value = Math.round(rates.offerRate * 100);
      this.rateAccept.value = Math.round(rates.acceptRate * 100);
      this.deleteRole.classList.remove('hidden');
    }

    this.updateOutreachPreview();
  }

  closeRoleModalHandler() {
    this.roleModal.classList.add('hidden');
    this.editingRoleIndex = -1;
  }

  updateOutreachPreview() {
    const rates = {
      responseRate: (parseInt(this.rateResponse.value) || 15) / 100,
      interestRate: (parseInt(this.rateInterest.value) || 60) / 100,
      screenRate: (parseInt(this.rateScreen.value) || 80) / 100,
      passThrough: (parseInt(this.ratePassThrough.value) || 25) / 100,
      offerRate: (parseInt(this.rateOffer.value) || 50) / 100,
      acceptRate: (parseInt(this.rateAccept.value) || 80) / 100
    };

    const funnel = calculateRequiredOutreach(1, rates);
    this.calculatedOutreach.textContent = `~${funnel.outreach} outreach needed`;
  }

  async saveRoleData() {
    const name = this.roleName.value.trim();
    if (!name) {
      alert('Please enter a role name');
      return;
    }

    const roleData = {
      name,
      monthlyHireTarget: parseInt(this.roleHireTarget.value) || 1,
      searchTerms: this.roleSearchTerms.value.split(',').map(s => s.trim()).filter(s => s),
      conversionRates: {
        responseRate: (parseInt(this.rateResponse.value) || 15) / 100,
        interestRate: (parseInt(this.rateInterest.value) || 60) / 100,
        screenRate: (parseInt(this.rateScreen.value) || 80) / 100,
        passThrough: (parseInt(this.ratePassThrough.value) || 25) / 100,
        offerRate: (parseInt(this.rateOffer.value) || 50) / 100,
        acceptRate: (parseInt(this.rateAccept.value) || 80) / 100
      }
    };

    if (this.editingRoleIndex === -1) {
      this.roles.push(roleData);
    } else {
      // Preserve learned rates if they exist
      if (this.roles[this.editingRoleIndex].learnedRates) {
        roleData.learnedRates = this.roles[this.editingRoleIndex].learnedRates;
      }
      this.roles[this.editingRoleIndex] = roleData;
    }

    await this.storageService.set('roles', this.roles);
    this.closeRoleModalHandler();
    this.renderRolesConfig();
  }

  async deleteRoleData() {
    if (this.editingRoleIndex === -1) return;

    if (confirm('Delete this role?')) {
      this.roles.splice(this.editingRoleIndex, 1);
      await this.storageService.set('roles', this.roles);
      this.closeRoleModalHandler();
      this.renderRolesConfig();
    }
  }

  async saveSettingsData() {
    this.settings = {
      monthlyHireTarget: parseInt(this.monthlyHireTarget.value) || 5,
      screenKeywords: this.screenKeywords.value.split(',').map(s => s.trim()).filter(s => s),
      notifications: {
        morning: this.morningNotif.checked,
        weekly: this.weeklyNotif.checked,
        sunday: this.sundayNotif.checked
      },
      notificationTimes: {
        morningHour: parseInt(this.morningTime.value) || 9,
        weeklyDay: parseInt(this.weeklyDay.value) || 5,
        weeklyHour: parseInt(this.weeklyTime.value) || 17,
        sundayDay: parseInt(this.sundayDay.value) || 0,
        sundayHour: parseInt(this.sundayTime.value) || 18
      }
    };

    await this.storageService.set('settings', this.settings);
    await this.storageService.set('roles', this.roles);

    // Update notification alarms
    chrome.runtime.sendMessage({ action: 'updateAlarms', settings: this.settings });

    this.hideSettings();
  }

  // Record weekly data for learning
  async recordWeeklyData(roleData) {
    const weekKey = new Date().toISOString().slice(0, 10);
    this.historicalData.push({
      week: weekKey,
      ...roleData
    });

    // Keep last 12 weeks
    if (this.historicalData.length > 12 * this.roles.length) {
      this.historicalData = this.historicalData.slice(-12 * this.roles.length);
    }

    await this.storageService.set('historicalData', this.historicalData);
    this.updateLearnedRates();
  }

  // ========================================
  // SOURCING METHODS
  // ========================================

  renderSourcing() {
    // Populate role selector
    this.sourcingRole.innerHTML = '<option value="">-- Choose a role --</option>' +
      this.roles.map((role, index) =>
        `<option value="${index}">${role.name}</option>`
      ).join('');

    // Also populate outreach modal role selector
    this.outreachRole.innerHTML = this.roles.map((role, index) =>
      `<option value="${index}">${role.name}</option>`
    ).join('');

    // Update outreach count
    const weekOutreach = this.getWeekOutreachCount();
    this.outreachCount.textContent = `${weekOutreach} this week`;

    // Show learned insights if available
    this.renderSourcingInsights();
  }

  renderSourcingInsights() {
    // This could show insights from past successful searches
    // For now, just update the search results if any
    if (this.generatedSearches.length > 0) {
      this.renderSearchResults();
    }
  }

  generateSearches() {
    const jdText = this.jdInput.value.trim();
    if (!jdText) {
      alert('Please enter a job description or ideal candidate profile');
      return;
    }

    // Parse the JD
    const parsed = parseJobDescription(jdText);

    // Add custom location if provided
    const customLocation = this.locationInput.value.trim();
    if (customLocation && !parsed.locations.includes(customLocation)) {
      parsed.locations.unshift(customLocation);
    }

    // Apply learned preferences
    this.applyLearnedPreferences(parsed);

    // Generate searches
    const options = {
      excludeOpenToWork: this.excludeOtw.checked
    };

    this.generatedSearches = generateSearchQueries(parsed, options);

    // Track this search for learning
    this.trackSearch(parsed);

    // Render results
    this.renderSearchResults();
  }

  useTemplate(templateName) {
    const template = QUICK_SEARCHES[templateName];
    if (!template) return;

    // Build a JD-like text from the template
    const jdText = `Looking for a ${templateName} with experience in ${template.skills.join(', ')}.`;
    this.jdInput.value = jdText;

    // Also set the role selector if matching role exists
    const matchingRoleIndex = this.roles.findIndex(r =>
      r.name.toLowerCase().includes(templateName.toLowerCase())
    );
    if (matchingRoleIndex >= 0) {
      this.sourcingRole.value = matchingRoleIndex;
    }

    // Generate searches
    this.generateSearches();
  }

  applyLearnedPreferences(parsed) {
    // Boost titles/companies that have worked well in the past
    const selectedRoleIndex = parseInt(this.sourcingRole.value);
    if (isNaN(selectedRoleIndex)) return;

    const role = this.roles[selectedRoleIndex];
    if (!role) return;

    const roleSourceData = this.sourcingData.searches?.filter(s => s.role === role.name) || [];
    if (roleSourceData.length < 5) return; // Need some history

    // Find titles with best response rates
    const titleSuccess = {};
    roleSourceData.forEach(search => {
      if (search.titles) {
        search.titles.forEach(title => {
          if (!titleSuccess[title]) titleSuccess[title] = { searches: 0, responses: 0 };
          titleSuccess[title].searches++;
          titleSuccess[title].responses += search.responses || 0;
        });
      }
    });

    // Sort by response rate and add top performers to parsed titles
    const topTitles = Object.entries(titleSuccess)
      .filter(([_, data]) => data.searches >= 2)
      .sort((a, b) => (b[1].responses / b[1].searches) - (a[1].responses / a[1].searches))
      .slice(0, 3)
      .map(([title]) => title);

    // Add learned titles that aren't already included
    topTitles.forEach(title => {
      if (!parsed.titles.includes(title)) {
        parsed.titles.push(title);
      }
    });

    // Similarly for companies
    const companySuccess = {};
    roleSourceData.forEach(search => {
      if (search.companies) {
        search.companies.forEach(company => {
          if (!companySuccess[company]) companySuccess[company] = { searches: 0, responses: 0 };
          companySuccess[company].searches++;
          companySuccess[company].responses += search.responses || 0;
        });
      }
    });

    const topCompanies = Object.entries(companySuccess)
      .filter(([_, data]) => data.searches >= 2)
      .sort((a, b) => (b[1].responses / b[1].searches) - (a[1].responses / a[1].searches))
      .slice(0, 3)
      .map(([company]) => company);

    topCompanies.forEach(company => {
      if (!parsed.companies.includes(company)) {
        parsed.companies.push(company);
      }
    });
  }

  async trackSearch(parsed) {
    const selectedRoleIndex = parseInt(this.sourcingRole.value);
    const roleName = selectedRoleIndex >= 0 ? this.roles[selectedRoleIndex]?.name : 'Unknown';

    const searchRecord = {
      date: new Date().toISOString(),
      role: roleName,
      titles: parsed.titles,
      skills: parsed.skills,
      locations: parsed.locations,
      companies: parsed.companies,
      responses: 0 // Will be updated when outreach is logged
    };

    if (!this.sourcingData.searches) {
      this.sourcingData.searches = [];
    }
    this.sourcingData.searches.push(searchRecord);

    // Keep last 100 searches
    if (this.sourcingData.searches.length > 100) {
      this.sourcingData.searches = this.sourcingData.searches.slice(-100);
    }

    await this.storageService.set('sourcingData', this.sourcingData);
  }

  renderSearchResults() {
    if (this.generatedSearches.length === 0) {
      this.searchResults.classList.add('hidden');
      return;
    }

    this.searchResults.classList.remove('hidden');

    this.searchList.innerHTML = this.generatedSearches.map((search, index) => `
      <div class="search-item" data-index="${index}">
        <div class="search-item-header">
          <span class="search-item-name">${search.name}</span>
          <span class="search-item-type">${search.type}</span>
        </div>
        <div class="search-item-desc">${search.description}</div>
        <div class="search-item-actions">
          <button class="search-btn search-btn-run" data-action="search" data-index="${index}">
            🔍 Search
          </button>
          <button class="search-btn search-btn-copy" data-action="copy" data-index="${index}">
            📋 Copy
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners for search buttons
    this.searchList.querySelectorAll('.search-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        const action = e.target.dataset.action;
        if (action === 'search') {
          this.runSearch(index);
        } else if (action === 'copy') {
          this.copySearch(index);
        }
      });
    });
  }

  runSearch(index) {
    const search = this.generatedSearches[index];
    if (!search) return;

    const url = buildSearchUrl(search.query);
    chrome.tabs.create({ url });
  }

  copySearch(index) {
    const search = this.generatedSearches[index];
    if (!search) return;

    navigator.clipboard.writeText(search.query).then(() => {
      // Show brief feedback
      const btn = this.searchList.querySelectorAll('.search-item')[index]?.querySelector('.search-btn-copy');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = originalText, 1500);
      }
    });
  }

  // ========================================
  // OUTREACH LOGGING
  // ========================================

  openOutreachModal() {
    this.outreachModal.classList.remove('hidden');
    this.outreachNumber.value = 10;
    this.outreachNotes.value = '';

    // Default to selected role in sourcing tab
    const selectedRoleIndex = parseInt(this.sourcingRole.value);
    if (selectedRoleIndex >= 0) {
      this.outreachRole.value = selectedRoleIndex;
    }
  }

  closeOutreachModalHandler() {
    this.outreachModal.classList.add('hidden');
  }

  async saveOutreachData() {
    const roleIndex = parseInt(this.outreachRole.value);
    const count = parseInt(this.outreachNumber.value) || 0;
    const notes = this.outreachNotes.value.trim();

    if (roleIndex < 0 || count <= 0) {
      alert('Please select a role and enter a valid count');
      return;
    }

    const role = this.roles[roleIndex];
    const outreachEntry = {
      date: new Date().toISOString(),
      role: role.name,
      count,
      notes,
      searchContext: this.generatedSearches.length > 0 ? {
        searches: this.generatedSearches.map(s => s.name)
      } : null
    };

    this.outreachLog.push(outreachEntry);
    await this.storageService.set('outreachLog', this.outreachLog);

    // Also update monthly data for funnel tracking
    const currentMonth = new Date().toISOString().slice(0, 7);
    let monthlyData = await this.storageService.get(`monthlyData_${currentMonth}`) || {
      outreach: {},
      responses: {},
      screens: {},
      hires: {}
    };

    monthlyData.outreach[role.name] = (monthlyData.outreach[role.name] || 0) + count;
    await this.storageService.set(`monthlyData_${currentMonth}`, monthlyData);
    this.monthlyData = monthlyData;

    // Update the latest search record with this outreach
    if (this.sourcingData.searches?.length > 0) {
      const lastSearch = this.sourcingData.searches[this.sourcingData.searches.length - 1];
      if (lastSearch.role === role.name) {
        lastSearch.outreachCount = (lastSearch.outreachCount || 0) + count;
        await this.storageService.set('sourcingData', this.sourcingData);
      }
    }

    this.closeOutreachModalHandler();
    this.renderSourcing();

    // Update badge
    chrome.runtime.sendMessage({ action: 'updateBadge' });
  }

  getWeekOutreachCount() {
    const { start } = getWeekDates();
    return this.outreachLog
      .filter(entry => new Date(entry.date) >= start)
      .reduce((sum, entry) => sum + (entry.count || 0), 0);
  }

  // ========================================
  // SOURCING LEARNING SYSTEM
  // ========================================

  async recordOutreachResponse(roleIndex, responses) {
    // This would be called when user reports how many responses they got
    // Updates the sourcing data for learning
    const role = this.roles[roleIndex];
    if (!role) return;

    // Update the most recent search for this role
    const roleSearches = this.sourcingData.searches?.filter(s => s.role === role.name) || [];
    if (roleSearches.length > 0) {
      const lastSearch = roleSearches[roleSearches.length - 1];
      lastSearch.responses = responses;
      await this.storageService.set('sourcingData', this.sourcingData);
    }
  }

  getSourcingInsights(roleName) {
    const roleSearches = this.sourcingData.searches?.filter(s => s.role === roleName) || [];
    if (roleSearches.length < 5) return null;

    // Calculate success metrics
    const totalOutreach = roleSearches.reduce((sum, s) => sum + (s.outreachCount || 0), 0);
    const totalResponses = roleSearches.reduce((sum, s) => sum + (s.responses || 0), 0);
    const responseRate = totalOutreach > 0 ? (totalResponses / totalOutreach) * 100 : 0;

    // Find best performing titles
    const titlePerformance = {};
    roleSearches.forEach(search => {
      if (search.titles && search.outreachCount > 0) {
        search.titles.forEach(title => {
          if (!titlePerformance[title]) titlePerformance[title] = { outreach: 0, responses: 0 };
          titlePerformance[title].outreach += search.outreachCount || 0;
          titlePerformance[title].responses += search.responses || 0;
        });
      }
    });

    const topTitles = Object.entries(titlePerformance)
      .map(([title, data]) => ({
        title,
        rate: data.outreach > 0 ? (data.responses / data.outreach) * 100 : 0
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    return {
      totalSearches: roleSearches.length,
      avgResponseRate: responseRate.toFixed(1),
      topTitles
    };
  }
}

// Initialize the app
const app = new PopupApp();
window.app = app;
