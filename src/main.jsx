import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import PersonalAssistant from './PersonalAssistant';

// Configuration - Replace with your actual keys
// For production, use environment variables
const config = {
  // Supabase (optional - for cloud note storage)
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  
  // OpenAI API (optional - for AI-powered Q&A and intent recognition)
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  
  // Theme: 'dark' or 'light'
  theme: 'dark'
};

// Initialize Supabase client if configured
const supabaseClient = config.supabaseUrl && config.supabaseKey
  ? createClient(config.supabaseUrl, config.supabaseKey)
  : null;

// Action callback - customize what happens when actions are triggered
const handleAction = (action, data) => {
  console.log('Action triggered:', action, data);
  
  // Add custom integrations here
  // For example, dispatch to a state manager, trigger webhooks, etc.
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersonalAssistant
      supabaseClient={supabaseClient}
      openaiApiKey={config.openaiApiKey}
      onAction={handleAction}
      theme={config.theme}
    />
  </React.StrictMode>
);
