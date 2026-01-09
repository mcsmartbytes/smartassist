import React, { useState, useEffect, useRef, useCallback } from 'react';
import MicrosoftGraph from './microsoftGraph.js';
import MeetingRecorder from './MeetingRecorder.jsx';

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
      const { content, time } = params;
      const reminders = JSON.parse(localStorage.getItem('assistant_reminders') || '[]');
      const reminder = {
        id: Date.now(),
        content,
        time: time || new Date(Date.now() + 3600000).toISOString(), // Default 1 hour
        created_at: new Date().toISOString()
      };
      reminders.push(reminder);
      localStorage.setItem('assistant_reminders', JSON.stringify(reminders));
      return { success: true, message: `Reminder set: "${content}"` };
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event) => {
          const current = event.resultIndex;
          const result = event.results[current];
          setTranscript(result[0].transcript);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
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
      
      if (openaiApiKey) {
        // Use OpenAI API to understand intent, answer questions, and route to plugins
        response = await processWithAI(userInput, openaiApiKey);
      } else {
        // Fallback: Simple keyword matching
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

  // AI-powered processing (OpenAI)
  const processWithAI = async (userInput, apiKey) => {
    const systemPrompt = `You are a helpful personal assistant. You can help with tasks and answer questions.

Available capabilities: ${activePlugins.join(', ')}

For TASKS (notes, reminders, calendar, email, recording), respond in JSON:
{"capability": "notes|reminders|calendar|email|recording", "action": "create|list|etc", "params": {}, "response": "your message"}

For QUESTIONS or CONVERSATION, respond in JSON:
{"capability": "general", "response": "your helpful answer"}

Always respond with valid JSON only.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ]
      })
    });

    if (!response.ok) {
      throw new Error('AI processing failed');
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);

    // Execute the appropriate plugin
    if (aiResponse.capability !== 'general' && plugins[aiResponse.capability]) {
      const result = await plugins[aiResponse.capability].execute({
        ...aiResponse.params,
        action: aiResponse.action,
        supabase: supabaseClient
      });
      
      return {
        message: aiResponse.response,
        action: aiResponse.capability,
        data: result
      };
    }

    return { message: aiResponse.response };
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
            const content = userInput.replace(/^(remind|reminder)[:\s]*/i, '').trim();
            if (content) {
              const result = await plugin.execute({ content });
              return { message: result.message, action: 'reminders', data: result };
            }
            return { message: "What should I remind you about?" };
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
    
    // General conversation fallback
    return { 
      message: `I heard: "${userInput}". I can help you with: ${Object.values(plugins).map(p => p.name).join(', ')}. Try saying something like "Note: buy milk" or "Remind me to call John".`
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
