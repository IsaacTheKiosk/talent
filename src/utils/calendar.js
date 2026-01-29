export class CalendarService {
  constructor() {
    this.baseUrl = 'https://www.googleapis.com/calendar/v3';
  }

  async getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  async getEvents(startDate, endDate) {
    try {
      const token = await this.getAuthToken();

      const params = new URLSearchParams({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250'
      });

      const response = await fetch(
        `${this.baseUrl}/calendars/primary/events?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status}`);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
      return [];
    }
  }

  async getCalendars() {
    try {
      const token = await this.getAuthToken();

      const response = await fetch(
        `${this.baseUrl}/users/me/calendarList`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status}`);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Failed to fetch calendars:', error);
      return [];
    }
  }
}
