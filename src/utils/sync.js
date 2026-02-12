/**
 * Sync Orchestrator
 * Coordinates data from Gem, Ashby, and Google Calendar into unified monthlyData
 */

import { GemService } from './gem.js';
import { AshbyService } from './ashby.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class SyncOrchestrator {
  constructor(storageService) {
    this.storageService = storageService;
    this.gemService = null;
    this.ashbyService = null;
    this.status = {
      gem: { connected: false, lastSync: null, error: null },
      ashby: { connected: false, lastSync: null, error: null },
      calendar: { connected: false }
    };
  }

  /**
   * Initialize services based on stored API keys
   */
  async initialize() {
    const gemKey = await this.storageService.get('gemApiKey');
    const ashbyKey = await this.storageService.get('ashbyApiKey');
    const authToken = await this.storageService.get('authToken');

    if (gemKey) {
      this.gemService = new GemService(gemKey);
      this.status.gem.connected = true;
    } else {
      this.gemService = null;
      this.status.gem = { connected: false, lastSync: null, error: null };
    }

    if (ashbyKey) {
      this.ashbyService = new AshbyService(ashbyKey);
      this.status.ashby.connected = true;
    } else {
      this.ashbyService = null;
      this.status.ashby = { connected: false, lastSync: null, error: null };
    }

    this.status.calendar.connected = !!authToken;
  }

  /**
   * Main sync — called when popup opens
   * calendarScreenings: { roleName: count } from Google Calendar
   */
  async syncAll(calendarScreenings) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const currentMonth = now.toISOString().slice(0, 7);

    // Load existing manual/stored data
    const existingData = await this.storageService.get(`monthlyData_${currentMonth}`) || {
      outreach: {}, responses: {}, screens: {}, finals: {}, offers: {}, hires: {}
    };

    let gemData = null;
    let ashbyData = null;

    // Sync Gem (outreach + responses)
    if (this.gemService) {
      gemData = await this._syncGem(monthStart, monthEnd, currentMonth);
    }

    // Sync Ashby (screens, finals, offers, hires)
    if (this.ashbyService) {
      ashbyData = await this._syncAshby(monthStart, monthEnd, currentMonth);
    }

    // Merge all sources
    const merged = this._mergeData(gemData, ashbyData, calendarScreenings, existingData);

    // Save merged data
    await this.storageService.set(`monthlyData_${currentMonth}`, merged);

    return merged;
  }

  /**
   * Sync Gem data with caching
   */
  async _syncGem(monthStart, monthEnd, currentMonth) {
    // Check cache
    const cacheKey = `gemCache_${currentMonth}`;
    const cache = await this.storageService.get(cacheKey);

    if (cache && cache.lastSync) {
      const age = Date.now() - new Date(cache.lastSync).getTime();
      if (age < CACHE_TTL_MS) {
        this.status.gem.lastSync = cache.lastSync;
        return cache.data;
      }
    }

    try {
      const projectMapping = await this.storageService.get('gemProjectMapping') || {};

      // Skip if no projects are mapped
      if (Object.keys(projectMapping).length === 0) {
        this.status.gem.error = 'No projects mapped to roles';
        return null;
      }

      const data = await this.gemService.getMonthlyOutreachData(monthStart, monthEnd, projectMapping);

      // Cache the result
      const now = new Date().toISOString();
      await this.storageService.set(cacheKey, { lastSync: now, data });
      this.status.gem.lastSync = now;
      this.status.gem.error = null;

      return data;
    } catch (error) {
      console.error('Sync: Gem sync failed:', error);
      this.status.gem.error = error.message;

      // Return cached data if available
      if (cache?.data) return cache.data;
      return null;
    }
  }

  /**
   * Sync Ashby data with caching
   */
  async _syncAshby(monthStart, monthEnd, currentMonth) {
    // Check cache
    const cacheKey = `ashbyCache_${currentMonth}`;
    const cache = await this.storageService.get(cacheKey);

    if (cache && cache.lastSync) {
      const age = Date.now() - new Date(cache.lastSync).getTime();
      if (age < CACHE_TTL_MS) {
        this.status.ashby.lastSync = cache.lastSync;
        return cache.data;
      }
    }

    try {
      const jobMapping = await this.storageService.get('ashbyJobMapping') || {};
      const stageClassification = await this.storageService.get('ashbyStageClassification') || {};

      // Skip if no jobs are mapped
      if (Object.keys(jobMapping).length === 0) {
        this.status.ashby.error = 'No jobs mapped to roles';
        return null;
      }

      const data = await this.ashbyService.getMonthlyFunnelData(
        monthStart, monthEnd, jobMapping, stageClassification
      );

      // Cache the result
      const now = new Date().toISOString();
      await this.storageService.set(cacheKey, { lastSync: now, data });
      this.status.ashby.lastSync = now;
      this.status.ashby.error = null;

      return data;
    } catch (error) {
      console.error('Sync: Ashby sync failed:', error);
      this.status.ashby.error = error.message;

      // Return cached data if available
      if (cache?.data) return cache.data;
      return null;
    }
  }

  /**
   * Merge data from all sources
   * Priority: API data > calendar > manual
   */
  _mergeData(gemData, ashbyData, calendarScreenings, manualData) {
    const merged = {
      outreach: {},
      responses: {},
      screens: {},
      finals: {},
      offers: {},
      hires: {},
      _sources: {}
    };

    // Outreach: Gem if available, else manual
    if (gemData?.outreach) {
      merged.outreach = { ...gemData.outreach };
      merged._sources.outreach = 'gem';
    } else {
      merged.outreach = { ...(manualData.outreach || {}) };
      merged._sources.outreach = 'manual';
    }

    // Responses: Gem if available, else manual
    if (gemData?.responses) {
      merged.responses = { ...gemData.responses };
      merged._sources.responses = 'gem';
    } else {
      merged.responses = { ...(manualData.responses || {}) };
      merged._sources.responses = 'manual';
    }

    // Screens: max(Ashby, Calendar) to avoid double-counting
    const allScreenRoles = new Set([
      ...Object.keys(ashbyData?.screens || {}),
      ...Object.keys(calendarScreenings || {}),
      ...Object.keys(manualData.screens || {})
    ]);

    const screenSources = [];
    for (const role of allScreenRoles) {
      const ashbyCount = ashbyData?.screens?.[role] || 0;
      const calendarCount = calendarScreenings?.[role] || 0;
      const manualCount = manualData.screens?.[role] || 0;
      merged.screens[role] = Math.max(ashbyCount, calendarCount, manualCount);

      if (ashbyCount > 0) screenSources.push('ashby');
      if (calendarCount > 0) screenSources.push('calendar');
    }
    merged._sources.screens = [...new Set(screenSources)].join('+') || 'manual';

    // Finals: Ashby only
    if (ashbyData?.finals) {
      merged.finals = { ...ashbyData.finals };
      merged._sources.finals = 'ashby';
    } else {
      merged.finals = { ...(manualData.finals || {}) };
      merged._sources.finals = 'manual';
    }

    // Offers: Ashby only
    if (ashbyData?.offers) {
      merged.offers = { ...ashbyData.offers };
      merged._sources.offers = 'ashby';
    } else {
      merged.offers = { ...(manualData.offers || {}) };
      merged._sources.offers = 'manual';
    }

    // Hires: Ashby if available, else manual
    if (ashbyData?.hires) {
      merged.hires = { ...ashbyData.hires };
      merged._sources.hires = 'ashby';
    } else {
      merged.hires = { ...(manualData.hires || {}) };
      merged._sources.hires = 'manual';
    }

    return merged;
  }

  /**
   * Get sync status for UI display
   */
  getSyncStatus() {
    return { ...this.status };
  }
}
