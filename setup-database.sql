-- SmartAssist Database Setup
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/kktxfbmlmajmbmwxocvn/sql

-- Notes table
CREATE TABLE IF NOT EXISTS assistant_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting recordings table
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  duration INTEGER DEFAULT 0,
  transcript TEXT,
  audio_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert recordings (for demo purposes)
CREATE POLICY "Allow public insert" ON meeting_recordings
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read recordings
CREATE POLICY "Allow public read" ON meeting_recordings
  FOR SELECT USING (true);

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public uploads to the bucket
CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'meeting-recordings');

-- Allow public reads from the bucket
CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'meeting-recordings');
