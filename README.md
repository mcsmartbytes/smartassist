# SmartAssist

An expandable, AI-powered personal assistant with voice commands, notes, reminders, and a plugin architecture for adding new capabilities.

## Features

- 🎤 **Voice Input** - Speak commands using Web Speech API
- 🤖 **AI-Powered** - Claude understands natural language (or keyword fallback)
- 📝 **Notes** - Take and retrieve notes (local or Supabase)
- ⏰ **Reminders** - Set reminders (expandable to notifications)
- 🔌 **Plugin System** - Easy to add new capabilities
- 🎨 **Themeable** - Dark/light mode support
- 📱 **Responsive** - Works on desktop and mobile

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your API keys (optional)

# Start development server
npm run dev

# Build for production
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | No | Supabase project URL for cloud storage |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anonymous key |
| `VITE_ANTHROPIC_API_KEY` | No | Claude API key for AI intent recognition |
| `VITE_MICROSOFT_CLIENT_ID` | No | Azure AD app client ID for Outlook |
| `VITE_MICROSOFT_REDIRECT_URI` | No | OAuth redirect URI (defaults to current origin) |

**Without API keys**, the assistant still works using keyword matching and local storage.

### Microsoft Graph Setup (Outlook Email & Calendar)

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click **New registration**
3. Configure:
   - **Name**: SmartAssist
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Select "Single-page application (SPA)" and enter:
     - For local dev: `http://localhost:5173`
     - For production: `https://your-domain.netlify.app`
4. After creation, copy the **Application (client) ID**
5. Go to **API permissions** → Add a permission → Microsoft Graph → Delegated permissions
6. Add these permissions:
   - `User.Read`
   - `Mail.Send`
   - `Mail.Read`
   - `Calendars.ReadWrite`
7. Click **Grant admin consent** (if you have admin rights, otherwise users consent on first sign-in)

Add to your `.env`:
```
VITE_MICROSOFT_CLIENT_ID=your-client-id-here
VITE_MICROSOFT_REDIRECT_URI=http://localhost:5173
```

### Supabase Setup (Optional)

Create a table for notes:

```sql
CREATE TABLE assistant_notes (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE assistant_notes ENABLE ROW LEVEL SECURITY;

-- Add policy for authenticated users (adjust as needed)
CREATE POLICY "Users can manage their own notes" ON assistant_notes
  FOR ALL USING (true);
```

## Adding New Capabilities

The plugin system makes it easy to add new features. Edit `PersonalAssistant.jsx` and add to the `plugins` object:

```javascript
const plugins = {
  // ... existing plugins ...
  
  myNewPlugin: {
    name: 'My Plugin',
    icon: '🚀',
    keywords: ['trigger', 'words', 'that', 'activate'],
    description: 'What this plugin does',
    execute: async (params) => {
      // Your logic here
      const { action, content, supabase } = params;
      
      // Do something
      await someApiCall(content);
      
      return { 
        success: true, 
        message: 'Action completed!',
        data: { /* any data to return */ }
      };
    }
  }
};
```

## Planned Integrations

| Capability | Integration | Status |
|------------|-------------|--------|
| Notes | Supabase / Local | ✅ Working |
| Reminders | Local Storage | ✅ Working |
| Outlook Email | Microsoft Graph | ✅ Working |
| Outlook Calendar | Microsoft Graph | ✅ Working |
| Gmail | Google Gmail API | 🔌 Ready to connect |
| Text/SMS | Twilio | 🔌 Ready to connect |
| Web Search | Search API | 🔌 Ready to connect |

### Connecting Gmail (Example)

```javascript
// src/gmailApi.js
import { google } from 'googleapis';

export async function sendGmail({ to, subject, body, accessToken }) {
  const gmail = google.gmail({ version: 'v1', auth: accessToken });
  
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    '',
    body
  ].join('\n');
  
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage }
  });
  
  return { success: true, message: `Email sent to ${to}` };
}
```

## Embedding in a Website

Build and include in your site:

```html
<!-- Option 1: Full page -->
<div id="assistant-root"></div>
<script type="module" src="/path/to/assistant/dist/assets/index.js"></script>

<!-- Option 2: Floating widget (add wrapper styles) -->
<div id="assistant-widget" style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
  <div id="assistant-root"></div>
</div>
```

## Component Props

| Prop | Type | Description |
|------|------|-------------|
| `supabaseClient` | Object | Initialized Supabase client |
| `anthropicApiKey` | String | Claude API key |
| `onAction` | Function | Callback when actions are triggered |
| `theme` | String | 'dark' or 'light' |

## Voice Commands Examples

**Notes & Reminders:**
- "Note: pick up groceries tomorrow"
- "Show my notes"
- "Remind me to call John at 3pm"

**Outlook Email:**
- "Check my email"
- "Send email to sarah@example.com about the meeting"
- "Search emails for invoice"

**Outlook Calendar:**
- "What's on my calendar today?"
- "Show upcoming events"
- "Schedule a meeting with the team for Friday at 2pm"

**Other:**
- "Search for React tutorials"

## License

MIT
