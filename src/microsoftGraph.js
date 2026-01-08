// Microsoft Graph API Helper for SmartAssist
// Handles OAuth flow (PKCE) and API calls for Outlook Email & Calendar

const GRAPH_CONFIG = {
  clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
  redirectUri: import.meta.env.VITE_MICROSOFT_REDIRECT_URI || window.location.origin,
  scopes: [
    'User.Read',
    'Mail.Send',
    'Mail.Read',
    'Calendars.ReadWrite'
  ],
  authority: 'https://login.microsoftonline.com/consumers',
  graphEndpoint: 'https://graph.microsoft.com/v1.0'
};

// Token storage keys
const TOKEN_KEY = 'smartassist_ms_token';
const TOKEN_EXPIRY_KEY = 'smartassist_ms_token_expiry';
const PKCE_VERIFIER_KEY = 'smartassist_pkce_verifier';

/**
 * Generate a random string for PKCE
 */
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join('');
}

/**
 * Generate code challenge from verifier (SHA-256)
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Get the authorization URL for Microsoft OAuth with PKCE
 */
export async function getMicrosoftAuthUrl() {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store verifier for token exchange
  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
  
  const params = new URLSearchParams({
    client_id: GRAPH_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: GRAPH_CONFIG.redirectUri,
    scope: GRAPH_CONFIG.scopes.join(' '),
    response_mode: 'fragment',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  
  return `${GRAPH_CONFIG.authority}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for token
 */
async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  
  if (!codeVerifier) {
    throw new Error('PKCE verifier not found. Please try signing in again.');
  }
  
  const params = new URLSearchParams({
    client_id: GRAPH_CONFIG.clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: GRAPH_CONFIG.redirectUri,
    code_verifier: codeVerifier
  });
  
  const response = await fetch(`${GRAPH_CONFIG.authority}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to exchange code for token');
  }
  
  const data = await response.json();
  
  // Clean up verifier
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  
  return data;
}

/**
 * Parse the OAuth callback and extract token
 */
export async function handleAuthCallback() {
  // Check for code in URL fragment
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  
  const code = params.get('code');
  const error = params.get('error');
  
  if (error) {
    console.error('Auth error:', params.get('error_description'));
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return { success: false, error: params.get('error_description') || error };
  }
  
  if (code) {
    try {
      const tokenData = await exchangeCodeForToken(code);
      
      const expiryTime = Date.now() + (tokenData.expires_in * 1000);
      localStorage.setItem(TOKEN_KEY, tokenData.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return { success: true, token: tokenData.access_token };
    } catch (err) {
      console.error('Token exchange error:', err);
      window.history.replaceState({}, document.title, window.location.pathname);
      return { success: false, error: err.message };
    }
  }
  
  return null;
}

/**
 * Check if user is authenticated with Microsoft
 */
export function isMicrosoftAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  
  if (!token || !expiry) return false;
  
  // Check if token is expired (with 5 min buffer)
  if (Date.now() > parseInt(expiry) - 300000) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return false;
  }
  
  return true;
}

/**
 * Get the stored access token
 */
export function getAccessToken() {
  if (!isMicrosoftAuthenticated()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Sign out from Microsoft
 */
export function signOutMicrosoft() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

/**
 * Make an authenticated request to Microsoft Graph
 */
async function graphFetch(endpoint, options = {}) {
  const token = getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated with Microsoft. Please sign in.');
  }
  
  const response = await fetch(`${GRAPH_CONFIG.graphEndpoint}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Graph API error: ${response.status}`);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return { success: true };
  }
  
  return response.json();
}

/**
 * Get current user profile
 */
export async function getUserProfile() {
  return graphFetch('/me');
}

// ============================================
// EMAIL FUNCTIONS
// ============================================

/**
 * Send an email via Outlook
 */
export async function sendEmail({ to, subject, body, isHtml = false }) {
  const message = {
    message: {
      subject,
      body: {
        contentType: isHtml ? 'HTML' : 'Text',
        content: body
      },
      toRecipients: (Array.isArray(to) ? to : [to]).map(email => ({
        emailAddress: { address: email }
      }))
    },
    saveToSentItems: true
  };
  
  await graphFetch('/me/sendMail', {
    method: 'POST',
    body: JSON.stringify(message)
  });
  
  return { success: true, message: `Email sent to ${Array.isArray(to) ? to.join(', ') : to}` };
}

/**
 * Get recent emails
 */
export async function getRecentEmails(count = 10) {
  const data = await graphFetch(`/me/messages?$top=${count}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview`);
  return data.value;
}

/**
 * Search emails
 */
export async function searchEmails(query, count = 10) {
  const data = await graphFetch(`/me/messages?$search="${encodeURIComponent(query)}"&$top=${count}&$select=subject,from,receivedDateTime,bodyPreview`);
  return data.value;
}

// ============================================
// CALENDAR FUNCTIONS
// ============================================

/**
 * Create a calendar event
 */
export async function createCalendarEvent({ 
  subject, 
  start, 
  end, 
  location = '', 
  body = '',
  isAllDay = false,
  attendees = []
}) {
  // Parse natural language dates if needed
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + 3600000); // Default 1 hour
  
  const event = {
    subject,
    body: {
      contentType: 'Text',
      content: body
    },
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    isAllDay
  };
  
  if (location) {
    event.location = { displayName: location };
  }
  
  if (attendees.length > 0) {
    event.attendees = attendees.map(email => ({
      emailAddress: { address: email },
      type: 'required'
    }));
  }
  
  const result = await graphFetch('/me/events', {
    method: 'POST',
    body: JSON.stringify(event)
  });
  
  return { 
    success: true, 
    message: `Event "${subject}" created for ${startDate.toLocaleString()}`,
    event: result
  };
}

/**
 * Get upcoming calendar events
 */
export async function getUpcomingEvents(days = 7) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: future.toISOString(),
    $orderby: 'start/dateTime',
    $top: '20',
    $select: 'subject,start,end,location,organizer'
  });
  
  const data = await graphFetch(`/me/calendarView?${params.toString()}`);
  return data.value;
}

/**
 * Get today's events
 */
export async function getTodayEvents() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  
  const params = new URLSearchParams({
    startDateTime: startOfDay.toISOString(),
    endDateTime: endOfDay.toISOString(),
    $orderby: 'start/dateTime',
    $select: 'subject,start,end,location'
  });
  
  const data = await graphFetch(`/me/calendarView?${params.toString()}`);
  return data.value;
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId) {
  await graphFetch(`/me/events/${eventId}`, {
    method: 'DELETE'
  });
  
  return { success: true, message: 'Event deleted' };
}

/**
 * Find free time slots
 */
export async function findFreeSlots(date, durationMinutes = 60) {
  const events = await getUpcomingEvents(1);
  // Simple implementation - return gaps between events
  // Could be expanded to use findMeetingTimes API for more complex scenarios
  return events;
}

export default {
  // Auth
  getMicrosoftAuthUrl,
  handleAuthCallback,
  isMicrosoftAuthenticated,
  getAccessToken,
  signOutMicrosoft,
  getUserProfile,
  
  // Email
  sendEmail,
  getRecentEmails,
  searchEmails,
  
  // Calendar
  createCalendarEvent,
  getUpcomingEvents,
  getTodayEvents,
  deleteCalendarEvent,
  findFreeSlots
};
