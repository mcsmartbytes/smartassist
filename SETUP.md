# SmartAssist Setup Guide

This guide walks you through setting up all features of SmartAssist, your personal AI assistant.

---

## Prerequisites

- Node.js 20+
- A Supabase account (free tier works)
- API keys for the features you want to use

---

## 1. Database Setup (Supabase)

SmartAssist uses Supabase for persistent storage of notes, reminders, search history, contacts, and SMS conversations.

### Steps:

1. Go to your Supabase project SQL Editor:
   https://supabase.com/dashboard/project/kktxfbmlmajmbmwxocvn/sql

2. Copy and paste the entire contents of `setup-database.sql`

3. Click **Run** to create all tables

### Tables Created:

| Table | Purpose |
|-------|---------|
| `assistant_notes` | Notes with tags, categories, pinning |
| `assistant_reminders` | Reminders with recurring support |
| `assistant_contacts` | Contacts for quick SMS/email lookup |
| `assistant_searches` | Search history for reference |
| `sms_conversations` | SMS conversation threads |
| `sms_messages` | Individual text messages |
| `meeting_recordings` | Meeting recordings with transcripts |

---

## 2. Web Search (Tavily)

Tavily provides AI-optimized web search with direct answers.

### Steps:

1. Sign up at https://tavily.com

2. Get your API key from the dashboard

3. Add to your `.env` file:
   ```
   VITE_TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxx
   ```

### Usage:
- "search who is the current president"
- "what is TypeScript"
- "look up best restaurants in Austin"
- "research climate change effects"

---

## 3. SMS/Text Messages (Twilio)

Send and receive text messages through your assistant.

### Step 1: Get Twilio Credentials

1. Sign up at https://www.twilio.com

2. From the Twilio Console Dashboard, note your:
   - **Account SID** (starts with `AC`)
   - **Auth Token** or create an API Key

3. Buy a phone number (or use the free trial number)

### Step 2: Create API Keys (Recommended)

1. Go to: https://console.twilio.com/us1/account/keys-credentials/api-keys

2. Click **Create API Key**

3. Note the:
   - **SID** (starts with `SK`)
   - **Secret** (only shown once!)

### Step 3: Add to Netlify Environment Variables

Go to **Netlify Dashboard > Site Settings > Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_API_KEY_SID` | `SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_API_KEY_SECRET` | `your_api_key_secret` |
| `TWILIO_PHONE_NUMBER` | `+15551234567` (your Twilio number) |

### Usage:
- "text 555-123-4567 Hey, running 10 minutes late"
- "sms +1-555-987-6543 Meeting confirmed for 3pm"
- "show text history"

---

## 4. Microsoft Outlook (Email & Calendar)

Connect to Outlook for email and calendar management.

### Steps:

1. Go to Azure Portal: https://portal.azure.com

2. Navigate to **Azure Active Directory > App registrations**

3. Click **New registration**:
   - Name: `SmartAssist`
   - Supported account types: Personal Microsoft accounts
   - Redirect URI: `https://smartassist.netlify.app` (or `http://localhost:5173` for local dev)

4. After creation, note the **Application (client) ID**

5. Go to **API permissions** and add:
   - `Mail.Read`
   - `Mail.Send`
   - `Calendars.ReadWrite`

6. Add to your `.env`:
   ```
   VITE_MICROSOFT_CLIENT_ID=your-client-id
   VITE_MICROSOFT_REDIRECT_URI=https://smartassist.netlify.app
   ```

### Usage:
- "check my email"
- "send email to john@example.com subject Meeting body Let's meet tomorrow"
- "what's on my calendar today"
- "schedule a meeting with Bob tomorrow at 2pm"

---

## 5. OpenAI (Optional - Enhanced AI)

For smarter intent recognition and natural conversations.

### Steps:

1. Get an API key from https://platform.openai.com

2. Add to your `.env`:
   ```
   VITE_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
   ```

Without this, the assistant uses keyword matching (still works, just less flexible).

---

## Environment Variables Summary

### Local Development (`.env`)

```env
# Supabase (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Tavily (For web search)
VITE_TAVILY_API_KEY=tvly-xxxxx

# Microsoft (For email/calendar)
VITE_MICROSOFT_CLIENT_ID=your-azure-client-id
VITE_MICROSOFT_REDIRECT_URI=http://localhost:5173

# OpenAI (Optional - for smarter AI)
VITE_OPENAI_API_KEY=sk-xxxxx
```

### Netlify Environment Variables (For SMS)

```
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_API_KEY_SID=SKxxxxx
TWILIO_API_KEY_SECRET=xxxxx
TWILIO_PHONE_NUMBER=+15551234567
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## Deploying to Netlify

1. Push to GitHub

2. Connect repo to Netlify

3. Set environment variables in Netlify dashboard

4. Deploy!

The Netlify function for SMS (`netlify/functions/send-sms.js`) will be automatically deployed.

---

## Feature Commands Quick Reference

| Feature | Example Commands |
|---------|-----------------|
| **Notes** | "note buy groceries", "show my notes" |
| **Reminders** | "remind me to call mom", "remind meeting at 3pm" |
| **Search** | "search latest news on AI", "what is quantum computing" |
| **SMS** | "text 555-1234 hello", "show text history" |
| **Email** | "check email", "send email to..." |
| **Calendar** | "what's on today", "schedule meeting tomorrow" |
| **Recording** | "start recording", "show recordings" |

---

## Troubleshooting

### SMS not working
- Check Netlify function logs
- Verify all 4 Twilio env vars are set in Netlify
- Ensure phone number format includes country code (+1 for US)

### Search not working
- Verify VITE_TAVILY_API_KEY is set
- Check browser console for errors

### Database errors
- Run the SQL setup script in Supabase
- Check RLS policies are created

---

## Support

For issues, check the browser console for error messages and verify all required environment variables are set.
