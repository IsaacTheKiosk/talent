# 🏃 Track Meet

**Race to the finish line!** A fun Chrome Extension that connects to your Google Calendar to track weekly recruiting screening targets. Think of it as your personal track meet - each role is a lane, and you're racing to hit your goals!

## Features

- 🏁 **Race-themed Interface**: Fun track & field metaphors make hitting targets feel like winning medals
- 📅 **Google Calendar Integration**: Automatically reads your screening events
- 🎯 **Multi-lane Tracking**: Set different targets for each role you're recruiting for
- 🏆 **Progress Medals**: Earn gold, silver, and bronze as you hit milestones
- 📊 **Visual Race Progress**: Watch your runner sprint toward the finish line
- ⚡ **Smart Status Messages**: Get motivational updates based on your pace and days remaining

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Track Meet")
3. Enable the **Google Calendar API**:
   - Go to APIs & Services → Library
   - Search for "Google Calendar API"
   - Click Enable
4. Create OAuth credentials:
   - Go to APIs & Services → Credentials
   - Click **Create Credentials** → **OAuth 2.0 Client IDs**
   - Select **Chrome Extension** as the application type
   - You'll need your Extension ID (get this in step 3)

### 2. Configure the Extension

1. Open `manifest.json`
2. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID from Google Cloud

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `talent` folder
5. Copy the Extension ID shown on the card
6. Go back to Google Cloud Console and add this Extension ID to your OAuth client

### 4. Start Your Race!

1. Click the Track Meet icon in your Chrome toolbar
2. Click **Connect Calendar** and authorize access
3. Configure your roles and weekly targets in **Training Plan**
4. Watch your progress throughout the week!

## How It Works

Track Meet scans your Google Calendar events for keywords matching your configured roles:

| Role | Default Search Terms |
|------|---------------------|
| Software Engineer | "software engineer", "swe", "developer", "eng screen" |
| Product Manager | "product manager", "pm screen", "product screen" |
| Data Scientist | "data scientist", "ml engineer", "data screen" |

You can customize these in the Training Plan settings!

## Progress Indicators

| Progress | Medal | Status |
|----------|-------|--------|
| 100%+ | 🥇 | Gold medal performance! |
| 80-99% | 🥈 | Sprinting to victory! |
| 60-79% | 🥉 | Strong pace! |
| 40-59% | 🏃 | Picking up speed |
| 20-39% | 🚶 | Warming up |
| 0-19% | 🏁 | At the starting line |

## Project Structure

```
talent/
├── manifest.json              # Extension configuration
├── src/
│   ├── popup/
│   │   ├── popup.html        # Main UI
│   │   └── popup.js          # App logic
│   ├── background/
│   │   └── background.js     # Service worker
│   ├── styles/
│   │   └── popup.css         # Styling
│   ├── utils/
│   │   ├── calendar.js       # Google Calendar API
│   │   ├── storage.js        # Chrome storage
│   │   └── helpers.js        # Utility functions
│   └── icons/                # Extension icons
└── README.md
```

## Development

### Prerequisites

- Google Chrome
- A Google Cloud Project with Calendar API enabled

### Local Development

1. Make changes to source files
2. Go to `chrome://extensions/`
3. Click the refresh button on Track Meet
4. Test your changes

## License

MIT

---

**Now get out there and win your track meet! 🏆**
