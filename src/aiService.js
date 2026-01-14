// AI Service - Supports both OpenAI and Anthropic Claude
// Provides intelligent context-aware responses using your stored data

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Gather context from user's stored data
export async function gatherContext(supabase) {
  if (!supabase) return {};

  const context = {};

  try {
    // Get recent notes (last 10)
    const { data: notes } = await supabase
      .from('assistant_notes')
      .select('content, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (notes?.length) context.recentNotes = notes;

    // Get active reminders
    const { data: reminders } = await supabase
      .from('assistant_reminders')
      .select('content, remind_at')
      .eq('is_completed', false)
      .order('remind_at', { ascending: true })
      .limit(10);
    if (reminders?.length) context.activeReminders = reminders;

    // Get active tasks
    const { data: tasks } = await supabase
      .from('assistant_tasks')
      .select('content, priority, due_date')
      .eq('is_completed', false)
      .order('created_at', { ascending: false })
      .limit(15);
    if (tasks?.length) context.activeTasks = tasks;

    // Get list items (grouped by list name)
    const { data: lists } = await supabase
      .from('assistant_lists')
      .select('list_name, item')
      .eq('is_checked', false)
      .order('created_at', { ascending: true });
    if (lists?.length) {
      context.lists = {};
      lists.forEach(item => {
        if (!context.lists[item.list_name]) {
          context.lists[item.list_name] = [];
        }
        context.lists[item.list_name].push(item.item);
      });
    }

    // Get contacts
    const { data: contacts } = await supabase
      .from('assistant_contacts')
      .select('name, nickname, phone, email')
      .limit(20);
    if (contacts?.length) context.contacts = contacts;

    // Get recent searches
    const { data: searches } = await supabase
      .from('assistant_searches')
      .select('query, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (searches?.length) context.recentSearches = searches;

  } catch (error) {
    console.error('Error gathering context:', error);
  }

  return context;
}

// Build the system prompt with user context
function buildSystemPrompt(context) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });

  let prompt = `You are SmartAssist, an ACTION-ORIENTED personal AI assistant. Today is ${today}, ${time}.

Your job is to TAKE ACTION on what the user says - not just respond. When someone talks to you, figure out what action to take and DO IT.

IMPORTANT: Respond with JSON in this exact format:
{
  "message": "Your friendly response to the user",
  "action": "the action to take (see below)",
  "params": { action-specific parameters }
}

Available actions and their params:
- "note_create": { "content": "the note text" }
- "note_list": {}
- "reminder_create": { "content": "reminder text" }
- "reminder_list": {}
- "task_create": { "content": "task text", "priority": "low|medium|high" }
- "task_list": {}
- "list_add": { "listName": "list name", "item": "item to add" }
- "list_show": { "listName": "list name" }
- "list_create": { "listName": "list name" }
- "search": { "query": "search query" }
- "text_send": { "to": "phone number", "body": "message" }
- "calendar_list": {}
- "calendar_create": { "subject": "event title", "date": "YYYY-MM-DD", "time": "HH:MM", "location": "optional location" }
- "calendar_today": {}
- "email_check": {}
- "recording_start": {}
- "contact_add": { "name": "contact name", "phone": "phone number", "email": "email address", "nickname": "optional nickname" }
- "contact_list": {}
- "contact_find": { "name": "search query" }
- "contact_delete": { "name": "contact name" }
- "conversation": {} (for general chat, no action needed)

USER'S CURRENT DATA:
`;

  if (context.activeTasks?.length) {
    prompt += `\nActive Tasks:\n${context.activeTasks.map(t => `- ${t.content}${t.priority !== 'medium' ? ` (${t.priority} priority)` : ''}`).join('\n')}\n`;
  }

  if (context.activeReminders?.length) {
    prompt += `\nReminders:\n${context.activeReminders.map(r => `- ${r.content}`).join('\n')}\n`;
  }

  if (context.lists && Object.keys(context.lists).length) {
    prompt += `\nLists:\n`;
    for (const [listName, items] of Object.entries(context.lists)) {
      prompt += `${listName}: ${items.join(', ')}\n`;
    }
  }

  if (context.recentNotes?.length) {
    prompt += `\nRecent Notes:\n${context.recentNotes.slice(0, 5).map(n => `- ${n.content}`).join('\n')}\n`;
  }

  if (context.contacts?.length) {
    prompt += `\nContacts:\n${context.contacts.map(c => `- ${c.name}${c.nickname ? ` (${c.nickname})` : ''}: ${c.phone || c.email || 'no contact info'}`).join('\n')}\n`;
  }

  prompt += `
GUIDELINES:
- BE ACTION-ORIENTED: When the user asks for something, DO IT. Don't explain what you can do - just do it.
- If they mention any topic, try to take an action (create note, task, search, etc.)
- "What's the weather?" → search action for weather
- "Remember to buy milk" → note_create action
- "I need to call John" → reminder_create action
- Reference the user's existing data when relevant
- If they say "add that" or refer to something, use context to understand what
- For ambiguous requests, make reasonable assumptions based on their data
- Keep responses SHORT (1-2 sentences max)
- NEVER just describe your capabilities - ALWAYS try to take an action
- Always return valid JSON`;

  return prompt;
}

// Call OpenAI API
async function callOpenAI(apiKey, systemPrompt, userMessage) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Call Anthropic Claude API
async function callAnthropic(apiKey, systemPrompt, userMessage) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Parse AI response to extract action
function parseAIResponse(responseText) {
  try {
    // Try to find JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  // Fallback: return as conversation
  return {
    message: responseText,
    action: 'conversation',
    params: {}
  };
}

// Main function to process with AI
export async function processWithAI(userInput, supabase, conversationHistory = []) {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    return null; // No AI available, fall back to keyword matching
  }

  try {
    // Gather user's context from database
    const context = await gatherContext(supabase);

    // Build system prompt with context
    const systemPrompt = buildSystemPrompt(context);

    // Call the appropriate AI
    let responseText;
    if (anthropicKey) {
      responseText = await callAnthropic(anthropicKey, systemPrompt, userInput);
    } else {
      responseText = await callOpenAI(openaiKey, systemPrompt, userInput);
    }

    // Parse the response
    const parsed = parseAIResponse(responseText);

    return {
      message: parsed.message,
      action: parsed.action,
      params: parsed.params || {},
      aiProcessed: true
    };

  } catch (error) {
    console.error('AI processing error:', error);
    return null; // Fall back to keyword matching on error
  }
}

export default { processWithAI, gatherContext };
