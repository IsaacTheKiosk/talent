/**
 * Ashby ATS API Service
 * Handles pipeline data: screens, finals, offers, hires
 * RPC-style API — all endpoints are POST
 * Rate limit: 15 req/min — enforces 4-second minimum gap
 */

export class AshbyService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.ashbyhq.com';
    this.lastRequestTime = 0;
    this.minRequestInterval = 4100; // 15 req/min ≈ 1 per 4s, add 100ms buffer
  }

  /**
   * Validate API key with a lightweight call
   */
  async validateKey() {
    try {
      const result = await this._post('/job.list', { limit: 1 });
      if (result.success === false) {
        return { valid: false, error: result.errors?.[0] || 'Invalid API key' };
      }
      return { valid: true };
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return { valid: false, error: 'Invalid or deactivated API key' };
      }
      return { valid: false, error: error.message };
    }
  }

  /**
   * Rate-limited POST request
   */
  async _post(endpoint, body = {}) {
    // Enforce minimum interval between requests
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.minRequestInterval) {
      await this._sleep(this.minRequestInterval - timeSinceLast);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      this.lastRequestTime = Date.now();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(this.apiKey + ':'),
            'Content-Type': 'application/json',
            'Accept': 'application/json; version=1'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After')) || 5;
          await this._sleep(retryAfter * 1000);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          const error = new Error(`Ashby API auth error: ${response.status}`);
          error.status = response.status;
          throw error;
        }

        if (!response.ok) {
          throw new Error(`Ashby API error: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeout);
        if (attempt === 2) throw error;
        if (error.name === 'AbortError') throw new Error('Ashby API: request timeout');
        // Retry on network errors
        await this._sleep(this.minRequestInterval);
      }
    }
  }

  /**
   * Paginate through cursor-based results
   */
  async _getAllCursorPages(endpoint, body = {}) {
    const allResults = [];
    let cursor = undefined;

    while (true) {
      const requestBody = { ...body, limit: 100 };
      if (cursor) requestBody.cursor = cursor;

      const response = await this._post(endpoint, requestBody);

      if (response.results && Array.isArray(response.results)) {
        allResults.push(...response.results);
      }

      if (!response.moreDataAvailable || !response.nextCursor) {
        break;
      }

      cursor = response.nextCursor;
    }

    return allResults;
  }

  /**
   * List all jobs
   */
  async getJobs() {
    try {
      return await this._getAllCursorPages('/job.list');
    } catch (error) {
      console.error('Ashby: failed to fetch jobs:', error);
      return [];
    }
  }

  /**
   * List all interview stages
   */
  async getInterviewStages() {
    try {
      return await this._getAllCursorPages('/interviewStage.list');
    } catch (error) {
      console.error('Ashby: failed to fetch interview stages:', error);
      return [];
    }
  }

  /**
   * List all interview stage groups
   */
  async getInterviewStageGroups() {
    try {
      return await this._getAllCursorPages('/interviewStageGroup.list');
    } catch (error) {
      console.error('Ashby: failed to fetch stage groups:', error);
      return [];
    }
  }

  /**
   * List all applications
   */
  async getApplications() {
    try {
      return await this._getAllCursorPages('/application.list');
    } catch (error) {
      console.error('Ashby: failed to fetch applications:', error);
      return [];
    }
  }

  /**
   * List all offers
   */
  async getOffers() {
    try {
      return await this._getAllCursorPages('/offer.list');
    } catch (error) {
      console.error('Ashby: failed to fetch offers:', error);
      return [];
    }
  }

  /**
   * Auto-suggest stage classification based on name keywords
   */
  suggestStageClassification(stageName) {
    const name = (stageName || '').toLowerCase();

    if (/screen|phone\s*screen|recruiter\s*screen|initial\s*call/.test(name)) {
      return 'screen';
    }
    if (/onsite|on-site|panel|technical|final|loop|team|virtual\s*onsite/.test(name)) {
      return 'final';
    }
    if (/offer/.test(name)) {
      return 'offer';
    }
    if (/hire[d]?|start|accept|onboard/.test(name)) {
      return 'hired';
    }
    return 'ignore';
  }

  /**
   * High-level: get monthly funnel data per role
   * jobToRoleMap: { ashbyJobId: trackMeetRoleName }
   * stageClassification: { stageId: 'screen'|'final'|'offer'|'hired'|'ignore' }
   */
  async getMonthlyFunnelData(startDate, endDate, jobToRoleMap, stageClassification) {
    const screens = {};
    const finals = {};
    const offers = {};
    const hires = {};

    // Initialize counts for mapped roles
    const mappedRoles = new Set(Object.values(jobToRoleMap).filter(r => r && r !== 'ignore'));
    for (const role of mappedRoles) {
      screens[role] = 0;
      finals[role] = 0;
      offers[role] = 0;
      hires[role] = 0;
    }

    // Fetch applications
    const applications = await this.getApplications();

    for (const app of applications) {
      // Filter by date — use createdAt or updatedAt
      const appDate = new Date(app.updatedAt || app.createdAt);
      if (appDate < startDate || appDate > endDate) continue;

      // Map job to role
      const jobId = app.jobId;
      const roleName = jobToRoleMap[jobId];
      if (!roleName || roleName === 'ignore') continue;

      // Classify by current stage
      const stageId = app.currentInterviewStageId || app.currentInterviewStage?.id;
      const classification = stageClassification[stageId];

      if (!classification || classification === 'ignore') continue;

      switch (classification) {
        case 'screen':
          screens[roleName] = (screens[roleName] || 0) + 1;
          break;
        case 'final':
          finals[roleName] = (finals[roleName] || 0) + 1;
          break;
        case 'offer':
          offers[roleName] = (offers[roleName] || 0) + 1;
          break;
        case 'hired':
          hires[roleName] = (hires[roleName] || 0) + 1;
          break;
      }

      // Also check application status for hires
      const status = (app.status || '').toLowerCase();
      if (status === 'hired' && classification !== 'hired') {
        hires[roleName] = (hires[roleName] || 0) + 1;
      }
    }

    // Also check offers endpoint for offer counts
    const offersList = await this.getOffers();
    for (const offer of offersList) {
      const offerDate = new Date(offer.createdAt || offer.updatedAt);
      if (offerDate < startDate || offerDate > endDate) continue;

      // Try to map offer to role via its job
      const jobId = offer.jobId;
      const roleName = jobToRoleMap[jobId];
      if (!roleName || roleName === 'ignore') continue;

      // Only count if not already counted via application stage
      // Use offer status to avoid double-counting
      const offerStatus = (offer.status || '').toLowerCase();
      if (offerStatus === 'approved' || offerStatus === 'sent' || offerStatus === 'accepted') {
        // Increment offers (may overlap with stage-based count, take max later)
        offers[roleName] = Math.max(offers[roleName] || 0, (offers[roleName] || 0));
      }
    }

    return { screens, finals, offers, hires };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
