-- SmartAssist Database Setup
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/rsslcigkqdezjngewtbf/sql

-- =====================================================
-- NOTES
-- =====================================================
CREATE TABLE IF NOT EXISTS assistant_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT[], -- Array of tags for organization
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REMINDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS assistant_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT, -- 'daily', 'weekly', 'monthly'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =====================================================
-- CONTACTS (for quick SMS/Email lookup)
-- =====================================================
CREATE TABLE IF NOT EXISTS assistant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  nickname TEXT, -- "mom", "boss", etc. for voice commands
  notes TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SEARCH HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS assistant_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results JSONB, -- Store search results for reference
  source TEXT DEFAULT 'tavily', -- 'tavily', 'bing', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SMS CONVERSATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  contact_id UUID REFERENCES assistant_contacts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES sms_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
  twilio_sid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MEETING RECORDINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  duration INTEGER DEFAULT 0,
  transcript TEXT,
  summary TEXT, -- AI-generated summary
  audio_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_notes_created ON assistant_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON assistant_reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON assistant_reminders(is_completed);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON assistant_contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_nickname ON assistant_contacts(nickname);
CREATE INDEX IF NOT EXISTS idx_searches_created ON assistant_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_conv_phone ON sms_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conv ON sms_messages(conversation_id);

-- =====================================================
-- ROW LEVEL SECURITY (Public access for personal assistant)
-- =====================================================

-- Notes
ALTER TABLE assistant_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_public_all" ON assistant_notes;
DROP POLICY IF EXISTS "Allow public insert" ON assistant_notes;
DROP POLICY IF EXISTS "Allow public read" ON assistant_notes;
CREATE POLICY "notes_public_all" ON assistant_notes FOR ALL USING (true) WITH CHECK (true);

-- Reminders
ALTER TABLE assistant_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_public_all" ON assistant_reminders;
CREATE POLICY "reminders_public_all" ON assistant_reminders FOR ALL USING (true) WITH CHECK (true);

-- Contacts
ALTER TABLE assistant_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_public_all" ON assistant_contacts;
CREATE POLICY "contacts_public_all" ON assistant_contacts FOR ALL USING (true) WITH CHECK (true);

-- Searches
ALTER TABLE assistant_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "searches_public_all" ON assistant_searches;
CREATE POLICY "searches_public_all" ON assistant_searches FOR ALL USING (true) WITH CHECK (true);

-- SMS
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_conv_public_all" ON sms_conversations;
CREATE POLICY "sms_conv_public_all" ON sms_conversations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_msg_public_all" ON sms_messages;
CREATE POLICY "sms_msg_public_all" ON sms_messages FOR ALL USING (true) WITH CHECK (true);

-- Recordings
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recordings_public_all" ON meeting_recordings;
DROP POLICY IF EXISTS "Allow public insert" ON meeting_recordings;
DROP POLICY IF EXISTS "Allow public read" ON meeting_recordings;
CREATE POLICY "recordings_public_all" ON meeting_recordings FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- STORAGE BUCKET FOR AUDIO FILES
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;

CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'meeting-recordings');

CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'meeting-recordings');
