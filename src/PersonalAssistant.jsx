import React, { useState, useEffect, useRef, useCallback } from 'react';
import MicrosoftGraph from './microsoftGraph.js';
import MeetingRecorder from './MeetingRecorder.jsx';
import { processWithAI as processWithContextAI } from './aiService.js';

// Helper function to get next occurrence of a weekday (0=Sunday, 1=Monday, etc.)
const getNextWeekday = (targetDay) => {
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // If today or past, go to next week
  const result = new Date(today);
  result.setDate(today.getDate() + daysUntil);
  return result;
};

// Plugin registry - add new capabilities here
const plugins = {
  notes: {
    name: 'Notes',
    icon: '📝',
    keywords: ['note', 'remember', 'write down', 'save', 'jot'],
    description: 'Take and manage notes',
    execute: async (params, context) => {
      const { action, content, supabase } = params;

      if (action === 'create') {
        // Validate content is not empty
        if (!content || !content.trim()) {
          return { success: false, message: "What would you like me to note down?" };
        }

        const trimmedContent = content.trim();

        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_notes')
            .insert({ content: trimmedContent, created_at: new Date().toISOString() });
          if (error) throw error;
          return { success: true, message: `Note saved: "${trimmedContent}"` };
        }
        // Fallback to local storage
        const notes = JSON.parse(localStorage.getItem('assistant_notes') || '[]');
        notes.push({ id: Date.now(), content: trimmedContent, created_at: new Date().toISOString() });
        localStorage.setItem('assistant_notes', JSON.stringify(notes));
        return { success: true, message: `Note saved: "${trimmedContent}"` };
      }
      
      if (action === 'list') {
        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_notes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
          if (error) throw error;
          return { success: true, notes: data };
        }
        const notes = JSON.parse(localStorage.getItem('assistant_notes') || '[]');
        return { success: true, notes: notes.slice(-10).reverse() };
      }
      
      return { success: false, message: 'Unknown note action' };
    }
  },
  
  reminders: {
    name: 'Reminders',
    icon: '⏰',
    keywords: ['remind', 'reminder', 'alert', 'notify', 'don\'t forget'],
    description: 'Set reminders',
    execute: async (params) => {
      const { action, content, time, supabase } = params;

      if (action === 'create') {
        if (!content || !content.trim()) {
          return { success: false, message: "What should I remind you about?" };
        }

        // Parse time from content (e.g., "in 30 minutes", "tomorrow", "at 3pm")
        let remindAt = time || new Date(Date.now() + 3600000).toISOString(); // Default 1 hour

        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_reminders')
            .insert({
              content: content.trim(),
              remind_at: remindAt,
              is_completed: false
            });
          if (error) throw error;
          return { success: true, message: `⏰ Reminder set: "${content.trim()}"` };
        }

        // Fallback to localStorage
        const reminders = JSON.parse(localStorage.getItem('assistant_reminders') || '[]');
        reminders.push({ id: Date.now(), content: content.trim(), remind_at: remindAt, is_completed: false });
        localStorage.setItem('assistant_reminders', JSON.stringify(reminders));
        return { success: true, message: `⏰ Reminder set: "${content.trim()}"` };
      }

      if (action === 'list') {
        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_reminders')
            .select('*')
            .eq('is_completed', false)
            .order('remind_at', { ascending: true })
            .limit(10);
          if (error) throw error;
          return { success: true, reminders: data };
        }
        const reminders = JSON.parse(localStorage.getItem('assistant_reminders') || '[]');
        return { success: true, reminders: reminders.filter(r => !r.is_completed).slice(0, 10) };
      }

      if (action === 'complete' && params.id) {
        if (supabase) {
          const { error } = await supabase
            .from('assistant_reminders')
            .update({ is_completed: true, completed_at: new Date().toISOString() })
            .eq('id', params.id);
          if (error) throw error;
          return { success: true, message: '✅ Reminder completed!' };
        }
      }

      return { success: false, message: 'Unknown reminder action' };
    }
  },

  tasks: {
    name: 'Tasks',
    icon: '✅',
    keywords: ['task', 'todo', 'to-do', 'to do', 'add task', 'create task'],
    description: 'Manage your task list',
    execute: async (params) => {
      const { action, content, priority, due, supabase } = params;

      if (action === 'create') {
        if (!content || !content.trim()) {
          return { success: false, message: "What task would you like to add?" };
        }

        const task = {
          content: content.trim(),
          priority: priority || 'medium',
          is_completed: false,
          due_date: due || null,
          created_at: new Date().toISOString()
        };

        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_tasks')
            .insert(task);
          if (error) throw error;
          return { success: true, message: `✅ Task added: "${content.trim()}"` };
        }

        const tasks = JSON.parse(localStorage.getItem('assistant_tasks') || '[]');
        tasks.push({ id: Date.now(), ...task });
        localStorage.setItem('assistant_tasks', JSON.stringify(tasks));
        return { success: true, message: `✅ Task added: "${content.trim()}"` };
      }

      if (action === 'list') {
        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_tasks')
            .select('*')
            .eq('is_completed', false)
            .order('created_at', { ascending: false })
            .limit(15);
          if (error) throw error;
          return { success: true, tasks: data };
        }
        const tasks = JSON.parse(localStorage.getItem('assistant_tasks') || '[]');
        return { success: true, tasks: tasks.filter(t => !t.is_completed).slice(0, 15) };
      }

      if (action === 'complete' && params.id) {
        if (supabase) {
          const { error } = await supabase
            .from('assistant_tasks')
            .update({ is_completed: true, completed_at: new Date().toISOString() })
            .eq('id', params.id);
          if (error) throw error;
          return { success: true, message: '✅ Task completed!' };
        }
      }

      if (action === 'delete' && params.id) {
        if (supabase) {
          const { error } = await supabase
            .from('assistant_tasks')
            .delete()
            .eq('id', params.id);
          if (error) throw error;
          return { success: true, message: '🗑️ Task deleted!' };
        }
      }

      return { success: false, message: 'Unknown task action' };
    }
  },

  lists: {
    name: 'Lists',
    icon: '📋',
    keywords: ['list', 'shopping', 'groceries', 'shopping list', 'grocery list', 'packing list', 'add to list', 'buy'],
    description: 'Create and manage lists',
    execute: async (params) => {
      const { action, listName, item, supabase } = params;

      if (action === 'add') {
        if (!item || !item.trim()) {
          return { success: false, message: "What would you like to add to the list?" };
        }

        const list = listName || 'Shopping';

        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_lists')
            .insert({
              list_name: list,
              item: item.trim(),
              is_checked: false
            });
          if (error) throw error;
          return { success: true, message: `📋 Added "${item.trim()}" to ${list} list` };
        }

        const lists = JSON.parse(localStorage.getItem('assistant_lists') || '{}');
        if (!lists[list]) lists[list] = [];
        lists[list].push({ id: Date.now(), item: item.trim(), is_checked: false });
        localStorage.setItem('assistant_lists', JSON.stringify(lists));
        return { success: true, message: `📋 Added "${item.trim()}" to ${list} list` };
      }

      if (action === 'show') {
        const list = listName || 'Shopping';

        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_lists')
            .select('*')
            .eq('list_name', list)
            .eq('is_checked', false)
            .order('created_at', { ascending: true });
          if (error) throw error;
          return { success: true, listName: list, items: data };
        }

        const lists = JSON.parse(localStorage.getItem('assistant_lists') || '{}');
        const items = (lists[list] || []).filter(i => !i.is_checked);
        return { success: true, listName: list, items };
      }

      if (action === 'check' && params.id) {
        if (supabase) {
          const { error } = await supabase
            .from('assistant_lists')
            .update({ is_checked: true })
            .eq('id', params.id);
          if (error) throw error;
          return { success: true, message: '✓ Item checked off!' };
        }
      }

      if (action === 'clear') {
        const list = listName || 'Shopping';
        if (supabase) {
          const { error } = await supabase
            .from('assistant_lists')
            .delete()
            .eq('list_name', list)
            .eq('is_checked', true);
          if (error) throw error;
          return { success: true, message: `🗑️ Cleared checked items from ${list} list` };
        }
      }

      if (action === 'all') {
        if (supabase) {
          const { data, error } = await supabase
            .from('assistant_lists')
            .select('list_name')
            .eq('is_checked', false);
          if (error) throw error;
          const uniqueLists = [...new Set(data.map(d => d.list_name))];
          return { success: true, lists: uniqueLists };
        }
      }

      return { success: false, message: 'Unknown list action' };
    }
  },
  
  search: {
    name: 'Web Search',
    icon: '🔍',
    keywords: ['search', 'look up', 'find', 'google', 'what is', 'who is', 'research', 'tell me about'],
    description: 'Search the web using Tavily',
    execute: async (params) => {
      const { query, supabase } = params;
      const tavilyApiKey = import.meta.env.VITE_TAVILY_API_KEY;

      if (!tavilyApiKey) {
        return {
          success: false,
          message: 'Web search is not configured. Please add VITE_TAVILY_API_KEY to your .env file.'
        };
      }

      if (!query || !query.trim()) {
        return { success: false, message: 'What would you like me to search for?' };
      }

      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyApiKey,
            query: query.trim(),
            search_depth: 'basic',
            include_answer: true,
            include_raw_content: false,
            max_results: 5
          })
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Save search to database for history
        if (supabase) {
          await supabase.from('assistant_searches').insert({
            query: query.trim(),
            results: data,
            source: 'tavily'
          });
        }

        // Format the response
        let message = '';

        if (data.answer) {
          message = `**Answer:** ${data.answer}\n\n`;
        }

        if (data.results && data.results.length > 0) {
          message += '**Sources:**\n';
          data.results.slice(0, 3).forEach((result, i) => {
            message += `${i + 1}. ${result.title}\n   ${result.url}\n`;
          });
        }

        return {
          success: true,
          message: message || 'No results found.',
          data: data
        };
      } catch (error) {
        return { success: false, message: `Search error: ${error.message}` };
      }
    }
  },
  
  calendar: {
    name: 'Calendar',
    icon: '📅',
    keywords: ['calendar', 'schedule', 'event', 'meeting', 'appointment', 'busy', 'free', 'today'],
    description: 'Manage Outlook calendar events',
    requiresAuth: 'microsoft',
    execute: async (params) => {
      if (!MicrosoftGraph.isMicrosoftAuthenticated()) {
        return { 
          success: false, 
          message: 'Please sign in to Microsoft to use calendar features.',
          needsAuth: 'microsoft'
        };
      }
      
      const { action, subject, title, start, end, location, date, time, attendees } = params;
      
      try {
        if (action === 'create' || action === 'schedule' || action === 'add') {
          const eventTitle = subject || title || 'New Event';
          const startTime = start || (date && time ? `${date} ${time}` : null) || new Date(Date.now() + 3600000).toISOString();
          
          const result = await MicrosoftGraph.createCalendarEvent({
            subject: eventTitle,
            start: startTime,
            end,
            location,
            attendees: attendees || []
          });
          return result;
        }
        
        if (action === 'list' || action === 'show' || action === 'upcoming') {
          const events = await MicrosoftGraph.getUpcomingEvents(7);
          if (events.length === 0) {
            return { success: true, message: 'No upcoming events in the next 7 days.' };
          }
          const eventList = events.map(e => {
            const start = new Date(e.start.dateTime);
            return `• ${e.subject} - ${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
          }).join('\n');
          return { success: true, message: `Upcoming events:\n${eventList}`, events };
        }
        
        if (action === 'today') {
          const events = await MicrosoftGraph.getTodayEvents();
          if (events.length === 0) {
            return { success: true, message: 'No events scheduled for today.' };
          }
          const eventList = events.map(e => {
            const start = new Date(e.start.dateTime);
            return `• ${e.subject} at ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
          }).join('\n');
          return { success: true, message: `Today's schedule:\n${eventList}`, events };
        }
        
        return { success: true, message: 'Calendar is connected! Try: "show my calendar", "schedule a meeting", or "what\'s on today"' };
      } catch (error) {
        return { success: false, message: `Calendar error: ${error.message}` };
      }
    }
  },
  
  email: {
    name: 'Outlook Email',
    icon: '✉️',
    keywords: ['email', 'mail', 'send', 'outlook', 'inbox'],
    description: 'Send and read Outlook emails',
    requiresAuth: 'microsoft',
    execute: async (params) => {
      if (!MicrosoftGraph.isMicrosoftAuthenticated()) {
        return { 
          success: false, 
          message: 'Please sign in to Microsoft to use email features.',
          needsAuth: 'microsoft'
        };
      }
      
      const { action, to, subject, body, query } = params;
      
      try {
        if (action === 'send') {
          if (!to) {
            return { success: false, message: 'Who should I send the email to?' };
          }
          if (!subject && !body) {
            return { success: false, message: 'What should the email say?' };
          }
          
          const result = await MicrosoftGraph.sendEmail({
            to,
            subject: subject || '(No subject)',
            body: body || ''
          });
          return result;
        }
        
        if (action === 'check' || action === 'read' || action === 'inbox') {
          const emails = await MicrosoftGraph.getRecentEmails(5);
          if (emails.length === 0) {
            return { success: true, message: 'No recent emails.' };
          }
          const emailList = emails.map(e => {
            const from = e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown';
            const unread = e.isRead ? '' : '🔵 ';
            return `${unread}• ${from}: ${e.subject}`;
          }).join('\n');
          return { success: true, message: `Recent emails:\n${emailList}`, emails };
        }
        
        if (action === 'search' && query) {
          const emails = await MicrosoftGraph.searchEmails(query, 5);
          if (emails.length === 0) {
            return { success: true, message: `No emails found matching "${query}".` };
          }
          const emailList = emails.map(e => {
            const from = e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown';
            return `• ${from}: ${e.subject}`;
          }).join('\n');
          return { success: true, message: `Emails matching "${query}":\n${emailList}`, emails };
        }
        
        return { success: true, message: 'Outlook email is connected! Try: "check my email", "send email to...", or "search emails for..."' };
      } catch (error) {
        return { success: false, message: `Email error: ${error.message}` };
      }
    }
  },
  
  text: {
    name: 'Text Message',
    icon: '💬',
    keywords: ['text', 'sms', 'message', 'send text'],
    description: 'Send text messages via Twilio',
    execute: async (params) => {
      const { action, to, body, phone, message, supabase } = params;

      // Handle different param names
      const phoneNumber = to || phone;
      const messageBody = body || message;

      if (action === 'send' || (!action && phoneNumber)) {
        if (!phoneNumber) {
          return { success: false, message: 'Who would you like to text? Please provide a phone number.' };
        }
        if (!messageBody) {
          return { success: false, message: 'What would you like to say?' };
        }

        try {
          // Call the Netlify function to send SMS
          const response = await fetch('/.netlify/functions/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: phoneNumber,
              body: messageBody
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to send SMS');
          }

          // Save to database for conversation history
          if (supabase) {
            // Find or create conversation
            let { data: convData } = await supabase
              .from('sms_conversations')
              .select('id')
              .eq('phone_number', phoneNumber)
              .single();

            if (!convData) {
              const { data: newConv } = await supabase
                .from('sms_conversations')
                .insert({ phone_number: phoneNumber })
                .select('id')
                .single();
              convData = newConv;
            }

            if (convData) {
              await supabase.from('sms_messages').insert({
                conversation_id: convData.id,
                direction: 'outbound',
                body: messageBody,
                status: 'sent',
                twilio_sid: data.sid
              });
            }
          }

          return {
            success: true,
            message: `✅ Text sent to ${phoneNumber}: "${messageBody}"`,
            data: data
          };
        } catch (error) {
          return { success: false, message: `Failed to send text: ${error.message}` };
        }
      }

      if (action === 'history') {
        if (!supabase) {
          return { success: false, message: 'Database not connected for message history.' };
        }

        try {
          const { data: messages, error } = await supabase
            .from('sms_messages')
            .select('*, sms_conversations(phone_number)')
            .order('created_at', { ascending: false })
            .limit(10);

          if (error) throw error;

          if (!messages || messages.length === 0) {
            return { success: true, message: 'No text message history yet.' };
          }

          const history = messages.map(m => {
            const dir = m.direction === 'outbound' ? '→' : '←';
            const phone = m.sms_conversations?.phone_number || 'Unknown';
            return `${dir} ${phone}: ${m.body}`;
          }).join('\n');

          return { success: true, message: `Recent texts:\n${history}` };
        } catch (error) {
          return { success: false, message: `Error fetching history: ${error.message}` };
        }
      }

      return {
        success: true,
        message: 'SMS is ready! Try: "text [phone number] [message]" or "show text history"'
      };
    }
  },

  recording: {
    name: 'Meeting Recording',
    icon: '🎙️',
    keywords: ['record', 'recording', 'meeting', 'start recording', 'stop recording', 'record meeting'],
    description: 'Record meetings with live transcription',
    execute: async (params) => {
      const { action } = params;

      if (action === 'start') {
        return {
          success: true,
          message: 'Opening the meeting recorder. Click the Start Recording button to begin.',
          openRecorder: true
        };
      }

      if (action === 'list') {
        const recordings = JSON.parse(localStorage.getItem('meeting_recordings') || '[]');
        if (recordings.length === 0) {
          return { success: true, message: 'No recordings saved yet.' };
        }
        const list = recordings.slice(0, 5).map(r =>
          `• ${r.title} (${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, '0')})`
        ).join('\n');
        return { success: true, message: `Recent recordings:\n${list}` };
      }

      return {
        success: true,
        message: 'Click the 🎙️ button in the header to open the meeting recorder, or say "start recording".',
        openRecorder: true
      };
    }
  }
};

// Voice recognition hook
const useVoiceRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  const silenceTimeoutRef = useRef(null);
  const lastSpeechTimeRef = useRef(null);
  const finalizedTextRef = useRef('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();

        // Disable continuous mode and interim results to prevent word duplication
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;  // Only get final result
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event) => {
          // With interimResults=false, we only get one final result
          let transcript = event.results[0][0].transcript.trim();

          // Deduplicate: check if the text is repeated (e.g., "hello hello" -> "hello")
          const words = transcript.split(' ');
          const halfLength = Math.floor(words.length / 2);
          if (words.length >= 2 && words.length % 2 === 0) {
            const firstHalf = words.slice(0, halfLength).join(' ');
            const secondHalf = words.slice(halfLength).join(' ');
            if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
              transcript = firstHalf;
            }
          }

          setTranscript(transcript);

          // Reset silence timer on each speech input
          lastSpeechTimeRef.current = Date.now();
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          // Auto-stop after 3 seconds of silence
          silenceTimeoutRef.current = setTimeout(() => {
            if (recognitionRef.current && Date.now() - lastSpeechTimeRef.current >= 3000) {
              recognitionRef.current.stop();
            }
          }, 3000);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
        };
      }
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      finalizedTextRef.current = ''; // Reset finalized text for new session
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { isListening, transcript, isSupported, startListening, stopListening, setTranscript };
};

// Text-to-speech
const speak = (text) => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
};

// Main component
export default function PersonalAssistant({
  supabaseClient = null,
  openaiApiKey = null,
  onAction = null,
  theme = 'dark'
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePlugins, setActivePlugins] = useState(Object.keys(plugins));
  const [showSettings, setShowSettings] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [microsoftUser, setMicrosoftUser] = useState(null);
  const messagesEndRef = useRef(null);
  
  const { 
    isListening, 
    transcript, 
    isSupported: voiceSupported, 
    startListening, 
    stopListening,
    setTranscript 
  } = useVoiceRecognition();

  // Check Microsoft auth on mount and handle callback
  useEffect(() => {
    const initAuth = async () => {
      // Handle OAuth callback
      const authResult = await MicrosoftGraph.handleAuthCallback();
      if (authResult?.success) {
        try {
          const profile = await MicrosoftGraph.getUserProfile();
          setMicrosoftUser(profile);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Signed in to Microsoft as ${profile.displayName}. Outlook email and calendar are now available!`,
            timestamp: new Date()
          }]);
        } catch (err) {
          console.error('Failed to get user profile:', err);
        }
      } else if (authResult?.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Microsoft sign-in failed: ${authResult.error}`,
          timestamp: new Date()
        }]);
      }
      
      // Check existing auth
      if (MicrosoftGraph.isMicrosoftAuthenticated()) {
        MicrosoftGraph.getUserProfile().then(setMicrosoftUser).catch(() => {
          // Token invalid, clear it
          MicrosoftGraph.signOutMicrosoft();
        });
      }
    };
    
    initAuth();
  }, []);

  // Microsoft sign in handler
  const handleMicrosoftSignIn = async () => {
    const authUrl = await MicrosoftGraph.getMicrosoftAuthUrl();
    window.location.href = authUrl;
  };

  // Microsoft sign out handler
  const handleMicrosoftSignOut = () => {
    MicrosoftGraph.signOutMicrosoft();
    setMicrosoftUser(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Signed out from Microsoft.',
      timestamp: new Date()
    }]);
  };

  // Update input when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process user input with AI
  const processInput = async (userInput) => {
    if (!userInput.trim()) return;

    const userMessage = { role: 'user', content: userInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setTranscript('');
    setIsProcessing(true);

    try {
      let response;

      // Try AI-powered processing first (uses OpenAI or Anthropic if available)
      response = await processWithAI(userInput);

      // Fall back to keyword matching if AI not available or failed
      if (!response) {
        response = await processWithKeywords(userInput);
      }

      const assistantMessage = { 
        role: 'assistant', 
        content: response.message,
        action: response.action,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      // Open recorder if requested
      if (response.data?.openRecorder) {
        setShowRecorder(true);
      }

      // Speak response if voice was used
      if (transcript) {
        speak(response.message);
      }

      // Callback for parent component
      if (onAction && response.action) {
        onAction(response.action, response.data);
      }
      
    } catch (error) {
      console.error('Processing error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // AI-powered processing with context awareness
  const processWithAI = async (userInput) => {
    // Try the context-aware AI service
    const aiResult = await processWithContextAI(userInput, supabaseClient);

    if (!aiResult) {
      return null; // Fall back to keyword matching
    }

    // Map AI actions to plugin executions
    const actionMap = {
      'note_create': { plugin: 'notes', action: 'create', paramKey: 'content' },
      'note_list': { plugin: 'notes', action: 'list' },
      'reminder_create': { plugin: 'reminders', action: 'create', paramKey: 'content' },
      'reminder_list': { plugin: 'reminders', action: 'list' },
      'task_create': { plugin: 'tasks', action: 'create', paramKey: 'content' },
      'task_list': { plugin: 'tasks', action: 'list' },
      'list_add': { plugin: 'lists', action: 'add' },
      'list_show': { plugin: 'lists', action: 'show' },
      'list_create': { plugin: 'lists', action: 'show' }, // Just show empty list
      'search': { plugin: 'search', action: 'search', paramKey: 'query' },
      'text_send': { plugin: 'text', action: 'send' },
      'calendar_list': { plugin: 'calendar', action: 'list' },
      'calendar_create': { plugin: 'calendar', action: 'create' },
      'calendar_today': { plugin: 'calendar', action: 'today' },
      'email_check': { plugin: 'email', action: 'inbox' },
      'recording_start': { plugin: 'recording', action: 'start' },
    };

    const mapping = actionMap[aiResult.action];

    if (mapping && plugins[mapping.plugin]) {
      try {
        const pluginParams = {
          action: mapping.action,
          supabase: supabaseClient,
          ...aiResult.params
        };

        // Map the main param if needed
        if (mapping.paramKey && aiResult.params?.content) {
          pluginParams[mapping.paramKey] = aiResult.params.content;
        }

        const result = await plugins[mapping.plugin].execute(pluginParams);

        // Format list responses nicely
        if (mapping.action === 'list' && result.success) {
          if (result.tasks?.length) {
            const tasksList = result.tasks.map(t => `• ${t.content}`).join('\n');
            return { message: `Your tasks:\n${tasksList}`, action: mapping.plugin, data: result };
          }
          if (result.reminders?.length) {
            const remindersList = result.reminders.map(r => `• ${r.content}`).join('\n');
            return { message: `Your reminders:\n${remindersList}`, action: mapping.plugin, data: result };
          }
          if (result.notes?.length) {
            const notesList = result.notes.map(n => `• ${n.content}`).join('\n');
            return { message: `Your notes:\n${notesList}`, action: mapping.plugin, data: result };
          }
          if (result.items?.length) {
            const itemsList = result.items.map(i => `• ${i.item}`).join('\n');
            return { message: `${result.listName || 'List'}:\n${itemsList}`, action: mapping.plugin, data: result };
          }
        }

        return {
          message: result.message || aiResult.message,
          action: mapping.plugin,
          data: result
        };
      } catch (error) {
        console.error('Plugin execution error:', error);
        return { message: aiResult.message, action: aiResult.action };
      }
    }

    // Return AI message for conversation or unknown actions
    return { message: aiResult.message, action: aiResult.action };
  };

  // Keyword-based fallback processing
  const processWithKeywords = async (userInput) => {
    const lowerInput = userInput.toLowerCase();
    
    // Find matching plugin
    for (const [key, plugin] of Object.entries(plugins)) {
      if (!activePlugins.includes(key)) continue;
      
      for (const keyword of plugin.keywords) {
        if (lowerInput.includes(keyword)) {
          // Determine action based on input
          if (key === 'notes') {
            if (lowerInput.includes('show') || lowerInput.includes('list') || lowerInput.includes('what')) {
              const result = await plugin.execute({ action: 'list', supabase: supabaseClient });
              if (result.notes && result.notes.length > 0) {
                const notesList = result.notes.map(n => `• ${n.content}`).join('\n');
                return { message: `Here are your recent notes:\n${notesList}`, action: 'notes', data: result };
              }
              return { message: "You don't have any notes yet.", action: 'notes' };
            } else {
              // Extract content after keyword
              const content = userInput.replace(/^(note|remember|write down|save|jot)[:\s]*/i, '').trim();
              if (content) {
                const result = await plugin.execute({ action: 'create', content, supabase: supabaseClient });
                return { message: result.message, action: 'notes', data: result };
              }
              return { message: "What would you like me to note down?" };
            }
          }
          
          if (key === 'reminders') {
            if (lowerInput.includes('show') || lowerInput.includes('list') || lowerInput.includes('my reminder')) {
              const result = await plugin.execute({ action: 'list', supabase: supabaseClient });
              if (result.reminders && result.reminders.length > 0) {
                const remindersList = result.reminders.map(r => `• ${r.content}`).join('\n');
                return { message: `Your reminders:\n${remindersList}`, action: 'reminders', data: result };
              }
              return { message: "You don't have any active reminders.", action: 'reminders' };
            } else {
              const content = userInput.replace(/^(remind|reminder|remind me|don't forget)[:\s]*/i, '').trim();
              if (content) {
                const result = await plugin.execute({ action: 'create', content, supabase: supabaseClient });
                return { message: result.message, action: 'reminders', data: result };
              }
              return { message: "What should I remind you about?" };
            }
          }

          if (key === 'tasks') {
            if (lowerInput.includes('show') || lowerInput.includes('list') || lowerInput.includes('my task') || lowerInput.includes('what')) {
              const result = await plugin.execute({ action: 'list', supabase: supabaseClient });
              if (result.tasks && result.tasks.length > 0) {
                const tasksList = result.tasks.map(t => `• ${t.content}`).join('\n');
                return { message: `Your tasks:\n${tasksList}`, action: 'tasks', data: result };
              }
              return { message: "You don't have any tasks. Try saying 'add task buy groceries'", action: 'tasks' };
            } else {
              const content = userInput.replace(/^(task|todo|to-do|to do|add task|create task)[:\s]*/i, '').trim();
              if (content) {
                const result = await plugin.execute({ action: 'create', content, supabase: supabaseClient });
                return { message: result.message, action: 'tasks', data: result };
              }
              return { message: "What task would you like to add?" };
            }
          }

          if (key === 'lists') {
            // Create a new list: "make a list called app ideas" or "create app ideas list"
            const createMatch = userInput.match(/(?:make|create|start)\s+(?:a\s+)?(?:new\s+)?list\s+(?:called|named)\s+(.+)/i) ||
                               userInput.match(/(?:make|create|start)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+list$/i);
            if (createMatch) {
              const listName = createMatch[1].trim();
              return {
                message: `📋 Created "${listName}" list. Now you can say "add [item] to ${listName} list"`,
                action: 'lists'
              };
            }

            // Show list: "show my app ideas list" or "show app ideas"
            if (lowerInput.includes('show') || lowerInput.includes('what\'s on') || lowerInput.includes('whats on')) {
              // Match multi-word list names
              const listMatch = userInput.match(/(?:show|what's on|whats on)\s+(?:my\s+)?(.+?)\s*list$/i) ||
                               userInput.match(/(?:show|what's on|whats on)\s+(?:my\s+)?(.+)$/i);
              const listName = listMatch ? listMatch[1].trim() : 'Shopping';

              const result = await plugin.execute({ action: 'show', listName, supabase: supabaseClient });
              if (result.items && result.items.length > 0) {
                const itemsList = result.items.map(i => `• ${i.item}`).join('\n');
                return { message: `${result.listName} list:\n${itemsList}`, action: 'lists', data: result };
              }
              return { message: `Your ${result.listName} list is empty. Add items with "add [item] to ${result.listName} list"`, action: 'lists' };
            }

            // Add item to list: "add voice assistant to app ideas list" or "buy milk"
            const addToListMatch = userInput.match(/(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my\s+)?(.+?)\s*list$/i);
            if (addToListMatch) {
              const item = addToListMatch[1].trim();
              const listName = addToListMatch[2].trim();
              const result = await plugin.execute({ action: 'add', item, listName, supabase: supabaseClient });
              return { message: result.message, action: 'lists', data: result };
            }

            // Simple add/buy for shopping: "buy milk" or "add eggs"
            const simpleAddMatch = userInput.match(/(?:add|put|buy)\s+(.+)$/i);
            if (simpleAddMatch) {
              const item = simpleAddMatch[1].trim();
              const result = await plugin.execute({ action: 'add', item, listName: 'Shopping', supabase: supabaseClient });
              return { message: result.message, action: 'lists', data: result };
            }

            return { message: "Try: 'make a list called app ideas', 'add milk to shopping list', or 'show my app ideas list'" };
          }

          if (key === 'recording') {
            if (lowerInput.includes('show') || lowerInput.includes('list') || lowerInput.includes('previous') || lowerInput.includes('history')) {
              const result = await plugin.execute({ action: 'list' });
              return { message: result.message, action: 'recording', data: result };
            }
            // Start recording or open recorder
            const result = await plugin.execute({ action: 'start' });
            return { message: result.message, action: 'recording', data: result };
          }

          if (key === 'search') {
            // Extract query after search keywords
            const query = userInput.replace(/^(search|look up|find|google|what is|who is|research|tell me about)[:\s]*/i, '').trim();
            if (query) {
              const result = await plugin.execute({ query, supabase: supabaseClient });
              return { message: result.message, action: 'search', data: result.data };
            }
            return { message: "What would you like me to search for?" };
          }

          if (key === 'text') {
            if (lowerInput.includes('history') || lowerInput.includes('show text') || lowerInput.includes('text history')) {
              const result = await plugin.execute({ action: 'history', supabase: supabaseClient });
              return { message: result.message, action: 'text', data: result };
            }

            // Try to extract phone number and message: "text 555-1234 hello there"
            const textMatch = userInput.match(/^(?:text|sms|message)\s+([\d\-\+\(\)\s]+)\s+(.+)$/i);
            if (textMatch) {
              const phone = textMatch[1].trim();
              const message = textMatch[2].trim();
              const result = await plugin.execute({
                action: 'send',
                to: phone,
                body: message,
                supabase: supabaseClient
              });
              return { message: result.message, action: 'text', data: result };
            }

            return { message: "To send a text, say: text [phone number] [message]" };
          }

          if (key === 'calendar') {
            // Check for create/add/schedule intent
            if (lowerInput.includes('add') || lowerInput.includes('schedule') || lowerInput.includes('create') || lowerInput.includes('set up')) {
              // Parse: "add meeting tomorrow at 2pm" or "schedule dentist appointment Friday at 3pm"
              const timeMatch = userInput.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
              const time = timeMatch ? timeMatch[1] : '09:00';

              // Parse date words
              let date = new Date();
              if (lowerInput.includes('tomorrow')) {
                date.setDate(date.getDate() + 1);
              } else if (lowerInput.includes('monday')) {
                date = getNextWeekday(1);
              } else if (lowerInput.includes('tuesday')) {
                date = getNextWeekday(2);
              } else if (lowerInput.includes('wednesday')) {
                date = getNextWeekday(3);
              } else if (lowerInput.includes('thursday')) {
                date = getNextWeekday(4);
              } else if (lowerInput.includes('friday')) {
                date = getNextWeekday(5);
              } else if (lowerInput.includes('saturday')) {
                date = getNextWeekday(6);
              } else if (lowerInput.includes('sunday')) {
                date = getNextWeekday(0);
              }

              // Extract subject - remove common words
              let subject = userInput
                .replace(/add|schedule|create|set up|a|an|the|meeting|appointment|event|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
                .trim() || 'New Event';

              const dateStr = date.toISOString().split('T')[0];
              const result = await plugin.execute({
                action: 'create',
                subject: subject,
                date: dateStr,
                time: time
              });
              return { message: result.message, action: 'calendar', data: result };
            }

            // Check for today's events
            if (lowerInput.includes('today') || lowerInput.includes("today's")) {
              const result = await plugin.execute({ action: 'today' });
              return { message: result.message, action: 'calendar', data: result };
            }

            // Default to list
            const result = await plugin.execute({ action: 'list' });
            return { message: result.message, action: 'calendar', data: result };
          }

          if (key === 'email') {
            if (lowerInput.includes('check') || lowerInput.includes('inbox') || lowerInput.includes('read')) {
              const result = await plugin.execute({ action: 'inbox' });
              return { message: result.message, action: 'email', data: result };
            }
            const result = await plugin.execute({});
            return { message: result.message, action: 'email', data: result };
          }

          // Generic plugin response
          const result = await plugin.execute({ supabase: supabaseClient });
          return { message: result.message, action: key, data: result };
        }
      }
    }
    
    // General conversation fallback - try to be helpful based on what they said
    const lowerInput2 = userInput.toLowerCase();

    // Try to understand common intents even without exact keywords
    if (lowerInput2.includes('help') || lowerInput2.includes('what can you do')) {
      return {
        message: `I can help you with:\n• Notes - "Note: remember this"\n• Tasks - "Add task: buy groceries"\n• Reminders - "Remind me to call John"\n• Lists - "Add milk to shopping list"\n• Calendar - "Schedule meeting tomorrow at 2pm"\n• Search - "Search for weather today"\n• Text - "Text 555-1234 hello"\n\nJust tell me what you need!`
      };
    }

    if (lowerInput2.includes('hello') || lowerInput2.includes('hi') || lowerInput2.includes('hey')) {
      return { message: `Hello! How can I help you today?` };
    }

    if (lowerInput2.includes('thank')) {
      return { message: `You're welcome! Let me know if you need anything else.` };
    }

    if (lowerInput2.includes('?') || lowerInput2.startsWith("what's") || lowerInput2.startsWith('what is') || lowerInput2.startsWith('who is') || lowerInput2.startsWith('how do') || lowerInput2.startsWith('where is')) {
      // It's a question - auto-search if search plugin is available
      if (activePlugins.includes('search') && plugins.search) {
        const query = userInput.replace('?', '').trim();
        const result = await plugins.search.execute({ query, supabase: supabaseClient });
        return { message: result.message, action: 'search', data: result.data };
      }
      return {
        message: `I can search that for you! Try saying "Search: ${userInput.replace('?', '').trim()}"`,
        action: 'suggestion'
      };
    }

    // Default: assume they want to create a note or task
    return {
      message: `Would you like me to save that as a note? Just say "Note: ${userInput}" or "Task: ${userInput}"`
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    processInput(input);
  };

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
      // Process after stopping if there's a transcript
      setTimeout(() => {
        if (input.trim()) {
          processInput(input);
        }
      }, 500);
    } else {
      startListening();
    }
  };

  const isDark = theme === 'dark';

  return (
    <div style={{
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      background: isDark 
        ? 'linear-gradient(145deg, #0f0f14 0%, #1a1a24 50%, #0f0f14 100%)'
        : 'linear-gradient(145deg, #f8f9fc 0%, #ffffff 50%, #f0f2f8 100%)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      color: isDark ? '#e4e4e7' : '#1a1a2e'
    }}>
      {/* Header */}
      <header style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backdropFilter: 'blur(20px)',
        background: isDark ? 'rgba(15,15,20,0.8)' : 'rgba(255,255,255,0.8)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>
            🤖
          </div>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '18px', 
              fontWeight: 600,
              letterSpacing: '-0.02em'
            }}>
              SmartAssist
            </h1>
            <p style={{ 
              margin: 0, 
              fontSize: '12px', 
              opacity: 0.6 
            }}>
              {activePlugins.length} capabilities active
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowRecorder(!showRecorder)}
            style={{
              background: showRecorder
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              color: showRecorder ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
              boxShadow: showRecorder ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
            }}
          >
            🎙️ Record
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* Meeting Recorder Panel */}
      {showRecorder && (
        <div style={{
          padding: '24px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          background: isDark ? 'rgba(239, 68, 68, 0.03)' : 'rgba(239, 68, 68, 0.02)'
        }}>
          <MeetingRecorder
            supabaseClient={supabaseClient}
            theme={theme}
            onClose={() => setShowRecorder(false)}
          />
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          background: isDark ? 'rgba(99, 102, 241, 0.05)' : 'rgba(99, 102, 241, 0.03)'
        }}>
          {/* Microsoft Account */}
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Microsoft Account</h3>
            {microsoftUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0078d4 0%, #00bcf2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '14px'
                }}>
                  {microsoftUser.displayName?.charAt(0) || 'M'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{microsoftUser.displayName}</div>
                  <div style={{ fontSize: '12px', opacity: 0.6 }}>{microsoftUser.mail || microsoftUser.userPrincipalName}</div>
                </div>
                <button
                  onClick={handleMicrosoftSignOut}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleMicrosoftSignIn}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0078d4 0%, #00bcf2 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 500
                }}
              >
                <svg width="16" height="16" viewBox="0 0 21 21" fill="currentColor">
                  <rect x="1" y="1" width="9" height="9" />
                  <rect x="11" y="1" width="9" height="9" />
                  <rect x="1" y="11" width="9" height="9" />
                  <rect x="11" y="11" width="9" height="9" />
                </svg>
                Sign in with Microsoft
              </button>
            )}
            <p style={{ margin: '8px 0 0', fontSize: '11px', opacity: 0.5 }}>
              Required for Outlook email and calendar
            </p>
          </div>
          
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Active Capabilities</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.entries(plugins).map(([key, plugin]) => (
              <button
                key={key}
                onClick={() => {
                  setActivePlugins(prev => 
                    prev.includes(key) 
                      ? prev.filter(p => p !== key)
                      : [...prev, key]
                  );
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activePlugins.includes(key)
                    ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                    : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  color: activePlugins.includes(key) ? '#fff' : 'inherit',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                {plugin.icon} {plugin.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            opacity: 0.6
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👋</div>
            <h2 style={{ margin: '0 0 8px', fontWeight: 500 }}>Hi! I'm your assistant</h2>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Try saying "Note: pick up groceries" or "Show my notes"
            </p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: 'fadeIn 0.3s ease'
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '14px 18px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              color: msg.role === 'user' ? '#fff' : 'inherit',
              boxShadow: msg.role === 'user' 
                ? '0 4px 12px rgba(99, 102, 241, 0.2)'
                : 'none'
            }}>
              <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </p>
              {msg.action && (
                <span style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'rgba(255,255,255,0.15)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {plugins[msg.action]?.icon} {msg.action}
                </span>
              )}
            </div>
          </div>
        ))}
        
        {isProcessing && (
          <div style={{ display: 'flex', gap: '8px', padding: '14px 18px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#6366f1',
              animation: 'pulse 1s infinite'
            }} />
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#6366f1',
              animation: 'pulse 1s infinite 0.2s'
            }} />
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#6366f1',
              animation: 'pulse 1s infinite 0.4s'
            }} />
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form 
        onSubmit={handleSubmit}
        style={{
          padding: '16px 24px 24px',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          background: isDark ? 'rgba(15,15,20,0.9)' : 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(20px)'
        }}
      >
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          {voiceSupported && (
            <button
              type="button"
              onClick={handleVoiceToggle}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: 'none',
                background: isListening 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: isListening ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: isListening ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none',
                animation: isListening ? 'pulse 1.5s infinite' : 'none'
              }}
            >
              {isListening ? '⏹️' : '🎤'}
            </button>
          )}
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Listening...' : 'Type or speak your request...'}
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: '14px',
              border: `2px solid ${isListening ? '#6366f1' : 'transparent'}`,
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              color: 'inherit',
              fontSize: '15px',
              outline: 'none',
              transition: 'all 0.2s'
            }}
          />
          
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              border: 'none',
              background: input.trim() && !isProcessing
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              color: input.trim() && !isProcessing ? '#fff' : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              cursor: input.trim() && !isProcessing ? 'pointer' : 'not-allowed',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: input.trim() && !isProcessing ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none'
            }}
          >
            ➤
          </button>
        </div>
        
        {isListening && (
          <p style={{
            margin: '12px 0 0',
            fontSize: '13px',
            textAlign: 'center',
            color: '#6366f1',
            fontWeight: 500
          }}>
            🎙️ Listening... speak now
          </p>
        )}
      </form>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
        
        * { box-sizing: border-box; }
        
        input::placeholder {
          color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'};
        }
        
        ::-webkit-scrollbar {
          width: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        
        ::-webkit-scrollbar-thumb {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
