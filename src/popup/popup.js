import { CalendarService } from '../utils/calendar.js';
import { StorageService } from '../utils/storage.js';
import { getWeekDates, calculateProgress, getStatusClass, getDaysRemaining } from '../utils/helpers.js';

class PopupApp {
  constructor() {
    this.calendarService = new CalendarService();
    this.storageService = new StorageService();
    this.isAuthenticated = false;
    this.roles = [];
    this.screenings = {};

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
    this.authSection = document.getElementById('authSection');
    this.mainContent = document.getElementById('mainContent');
    this.settingsSection = document.getElementById('settingsSection');
    this.authButton = document.getElementById('authButton');
    this.settingsButton = document.getElementById('settingsButton');
    this.saveSettings = document.getElementById('saveSettings');
    this.cancelSettings = document.getElementById('cancelSettings');
    this.addRoleButton = document.getElementById('addRoleButton');
    this.rolesList = document.getElementById('rolesList');
    this.targetsList = document.getElementById('targetsList');
    this.weekLabel = document.getElementById('weekLabel');
    this.totalScreenings = document.getElementById('totalScreenings');
    this.overallProgress = document.getElementById('overallProgress');
    this.raceMessage = document.getElementById('raceMessage');
    this.raceStatus = document.getElementById('raceStatus');
  }

  bindEvents() {
    this.authButton.addEventListener('click', () => this.authenticate());
    this.settingsButton.addEventListener('click', () => this.showSettings());
    this.saveSettings.addEventListener('click', () => this.saveRoleSettings());
    this.cancelSettings.addEventListener('click', () => this.hideSettings());
    this.addRoleButton.addEventListener('click', () => this.addRoleInput());
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
      this.authButton.innerHTML = '<span>⏳</span> Getting ready...';
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
      // Load role targets from storage
      this.roles = await this.storageService.get('roles') || [
        { name: 'Software Engineer', weeklyTarget: 10, searchTerms: ['software engineer', 'swe', 'developer', 'eng screen'] },
        { name: 'Product Manager', weeklyTarget: 8, searchTerms: ['product manager', 'pm screen', 'product screen'] },
        { name: 'Data Scientist', weeklyTarget: 5, searchTerms: ['data scientist', 'ml engineer', 'data screen'] }
      ];

      // Get this week's calendar events
      const { start, end } = getWeekDates();
      const events = await this.calendarService.getEvents(start, end);

      // Count screenings per role
      this.screenings = this.countScreenings(events);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  countScreenings(events) {
    const counts = {};

    this.roles.forEach(role => {
      counts[role.name] = 0;
    });

    events.forEach(event => {
      const title = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const combined = `${title} ${description}`;

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

  render() {
    this.updateWeekLabel();

    if (!this.isAuthenticated) {
      this.authSection.classList.remove('hidden');
      this.mainContent.classList.add('hidden');
      this.settingsSection.classList.add('hidden');
      return;
    }

    this.authSection.classList.add('hidden');
    this.mainContent.classList.remove('hidden');
    this.settingsSection.classList.add('hidden');

    this.renderRaceStatus();
    this.renderRoles();
    this.renderSummary();
  }

  updateWeekLabel() {
    const { start, end } = getWeekDates();
    const options = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', options);
    const endStr = end.toLocaleDateString('en-US', options);
    this.weekLabel.textContent = `${startStr} - ${endStr}`;
  }

  renderRaceStatus() {
    const totalCurrent = Object.values(this.screenings).reduce((a, b) => a + b, 0);
    const totalTarget = this.roles.reduce((a, r) => a + r.weeklyTarget, 0);
    const progress = calculateProgress(totalCurrent, totalTarget);
    const daysLeft = getDaysRemaining();

    const { message, icon } = this.getRaceMessage(progress, daysLeft, totalCurrent, totalTarget);

    this.raceMessage.textContent = message;
    this.raceStatus.querySelector('.race-icon').textContent = icon;
  }

  getRaceMessage(progress, daysLeft, current, target) {
    if (progress >= 100) {
      return { message: "🎉 You've crossed the finish line! Champion!", icon: '🏆' };
    } else if (progress >= 90) {
      return { message: "Final stretch! You're almost there!", icon: '🔥' };
    } else if (progress >= 70) {
      return { message: `Great pace! ${target - current} more to go!`, icon: '💪' };
    } else if (progress >= 50) {
      return { message: `Halfway there! Keep pushing!`, icon: '🏃' };
    } else if (daysLeft <= 1) {
      return { message: "Sprint to the finish! Last day push!", icon: '⚡' };
    } else if (daysLeft <= 2) {
      return { message: `${daysLeft} days left - time to pick up the pace!`, icon: '⏰' };
    } else if (progress >= 25) {
      return { message: "Good start! Let's build momentum!", icon: '🚀' };
    } else {
      return { message: "On your marks... Let's get started!", icon: '🏁' };
    }
  }

  renderRoles() {
    this.rolesList.innerHTML = this.roles.map((role, index) => {
      const current = this.screenings[role.name] || 0;
      const target = role.weeklyTarget;
      const progress = calculateProgress(current, target);
      const statusClass = getStatusClass(progress);
      const laneNumber = index + 1;

      return `
        <div class="role-card">
          <div class="role-header">
            <span class="role-name">
              <span class="lane-number">Lane ${laneNumber}</span>
              ${role.name}
            </span>
            <span class="role-count">
              <span class="current">${current}</span>
              <span class="target">/ ${target}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${statusClass}" style="width: ${Math.min(progress, 100)}%"></div>
          </div>
          <div class="status-indicator">
            <span class="status-emoji">${this.getStatusEmoji(progress)}</span>
            <span>${this.getStatusText(progress, current, target)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  getStatusEmoji(progress) {
    if (progress >= 100) return '🥇';
    if (progress >= 80) return '🥈';
    if (progress >= 60) return '🥉';
    if (progress >= 40) return '🏃';
    if (progress >= 20) return '🚶';
    return '🏁';
  }

  getStatusText(progress, current, target) {
    const remaining = target - current;
    if (progress >= 100) {
      return 'Gold medal performance! 🎊';
    } else if (progress >= 80) {
      return `${remaining} more - sprinting to victory!`;
    } else if (progress >= 60) {
      return `${remaining} more - strong pace!`;
    } else if (progress >= 40) {
      return `${remaining} more - picking up speed`;
    } else if (progress >= 20) {
      return `${remaining} more - warming up`;
    } else {
      return `${remaining} more - at the starting line`;
    }
  }

  renderSummary() {
    const totalCurrent = Object.values(this.screenings).reduce((a, b) => a + b, 0);
    const totalTarget = this.roles.reduce((a, r) => a + r.weeklyTarget, 0);
    const overallProgress = calculateProgress(totalCurrent, totalTarget);
    const statusClass = getStatusClass(overallProgress);

    this.totalScreenings.textContent = `${totalCurrent} / ${totalTarget}`;
    this.overallProgress.style.width = `${Math.min(overallProgress, 100)}%`;
    this.overallProgress.className = `progress-fill runner ${statusClass}`;
  }

  showSettings() {
    this.mainContent.classList.add('hidden');
    this.settingsSection.classList.remove('hidden');
    this.renderSettingsForm();
  }

  hideSettings() {
    this.settingsSection.classList.add('hidden');
    this.mainContent.classList.remove('hidden');
  }

  renderSettingsForm() {
    this.targetsList.innerHTML = this.roles.map((role, index) => `
      <div class="target-item" data-index="${index}">
        <input type="text" placeholder="Role name" value="${role.name}" class="role-name-input">
        <input type="number" placeholder="Goal" value="${role.weeklyTarget}" min="1" class="target-input">
        <button class="remove-btn" onclick="app.removeRole(${index})">×</button>
      </div>
    `).join('');
  }

  addRoleInput() {
    const newRole = { name: '', weeklyTarget: 5, searchTerms: [] };
    this.roles.push(newRole);
    this.renderSettingsForm();
  }

  removeRole(index) {
    this.roles.splice(index, 1);
    this.renderSettingsForm();
  }

  async saveRoleSettings() {
    const items = this.targetsList.querySelectorAll('.target-item');
    const newRoles = [];

    items.forEach(item => {
      const name = item.querySelector('.role-name-input').value.trim();
      const target = parseInt(item.querySelector('.target-input').value) || 5;

      if (name) {
        newRoles.push({
          name,
          weeklyTarget: target,
          searchTerms: [name.toLowerCase()]
        });
      }
    });

    this.roles = newRoles;
    await this.storageService.set('roles', this.roles);

    // Recalculate screenings with new roles
    await this.loadData();
    this.hideSettings();
    this.render();
  }
}

// Initialize the app
const app = new PopupApp();
window.app = app; // Make available for inline handlers
