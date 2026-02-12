/**
 * Gem CRM API Service (v0)
 * Handles outreach and response tracking via Gem's candidate events
 */

export class GemService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.gem.com/v0';
  }

  /**
   * Validate API key by making a lightweight request
   */
  async validateKey() {
    try {
      const response = await this._rawGet('/users?page=1&page_size=1');
      if (response.ok) {
        return { valid: true };
      }
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: `Unexpected status: ${response.status}` };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Raw fetch with auth header (returns Response object)
   */
  async _rawGet(endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      return await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GET request with JSON parsing and retry on 429
   */
  async _get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this._rawGet(url);

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After')) || 1;
        await this._sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Gem API error: ${response.status}`);
      }

      const data = await response.json();
      const pagination = response.headers.get('X-Pagination');
      return {
        data,
        pagination: pagination ? JSON.parse(pagination) : null
      };
    }

    throw new Error('Gem API: max retries exceeded');
  }

  /**
   * Paginate through all results
   */
  async _getAllPages(endpoint, params = {}) {
    const allItems = [];
    let page = 1;

    while (true) {
      const result = await this._get(endpoint, {
        ...params,
        page,
        page_size: 100
      });

      if (Array.isArray(result.data)) {
        allItems.push(...result.data);
      }

      if (!result.pagination || page >= result.pagination.last_page) {
        break;
      }

      page++;
    }

    return allItems;
  }

  /**
   * Get all projects (pipelines/talent pools)
   */
  async getProjects() {
    try {
      return await this._getAllPages('/projects');
    } catch (error) {
      console.error('Gem: failed to fetch projects:', error);
      return [];
    }
  }

  /**
   * Get candidates in a specific project
   */
  async getProjectCandidates(projectId) {
    try {
      return await this._getAllPages(`/projects/${projectId}/candidates`);
    } catch (error) {
      console.error(`Gem: failed to fetch project ${projectId} candidates:`, error);
      return [];
    }
  }

  /**
   * Get events for a specific candidate (outreach activity)
   */
  async getCandidateEvents(candidateId) {
    try {
      return await this._getAllPages(`/candidates/${candidateId}/events`);
    } catch (error) {
      console.error(`Gem: failed to fetch candidate ${candidateId} events:`, error);
      return [];
    }
  }

  /**
   * Get candidates created/updated in a date range
   */
  async getCandidates(startDate, endDate) {
    try {
      return await this._getAllPages('/candidates', {
        created_after: startDate.toISOString(),
        created_before: endDate.toISOString()
      });
    } catch (error) {
      console.error('Gem: failed to fetch candidates:', error);
      return [];
    }
  }

  /**
   * High-level: get monthly outreach and response counts per role
   * Uses project-to-role mapping to attribute data
   */
  async getMonthlyOutreachData(startDate, endDate, projectToRoleMap) {
    const outreach = {};
    const responses = {};

    // Initialize counts for mapped roles
    const mappedRoles = new Set(Object.values(projectToRoleMap));
    for (const role of mappedRoles) {
      outreach[role] = 0;
      responses[role] = 0;
    }

    // Iterate over mapped projects
    for (const [projectId, roleName] of Object.entries(projectToRoleMap)) {
      if (!roleName || roleName === 'ignore') continue;

      const candidates = await this.getProjectCandidates(projectId);

      for (const candidate of candidates) {
        const candidateId = candidate.id;
        const events = await this.getCandidateEvents(candidateId);

        for (const event of events) {
          const eventDate = new Date(event.created_at || event.timestamp);
          if (eventDate < startDate || eventDate > endDate) continue;

          const eventType = (event.type || event.event_type || '').toLowerCase();

          // Classify as outreach or response
          if (this._isOutreachEvent(eventType)) {
            outreach[roleName] = (outreach[roleName] || 0) + 1;
          } else if (this._isResponseEvent(eventType)) {
            responses[roleName] = (responses[roleName] || 0) + 1;
          }
        }
      }
    }

    return { outreach, responses };
  }

  /**
   * Classify event as outreach
   */
  _isOutreachEvent(eventType) {
    const outreachTypes = [
      'outreach', 'first_outreach', 'follow_up', 'followup',
      'email_sent', 'inmail_sent', 'inmail', 'email',
      'phone_call', 'text_message', 'message_sent'
    ];
    return outreachTypes.some(t => eventType.includes(t));
  }

  /**
   * Classify event as response
   */
  _isResponseEvent(eventType) {
    const responseTypes = [
      'reply', 'response', 'replied', 'email_replied',
      'inmail_replied', 'responded'
    ];
    return responseTypes.some(t => eventType.includes(t));
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
