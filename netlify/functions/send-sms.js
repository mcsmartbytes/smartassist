// Netlify Function for sending SMS via Twilio
// Environment variables needed:
// - TWILIO_ACCOUNT_SID
// - TWILIO_API_KEY_SID
// - TWILIO_API_KEY_SECRET
// - TWILIO_PHONE_NUMBER

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Validate and format phone number to E.164 format
 * Supports: (555) 123-4567, 555-123-4567, +1 555 123 4567, etc.
 */
function formatPhoneNumber(phone, defaultCountryCode = '1') {
  if (!phone) return null;
  
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If starts with +, keep it
  if (cleaned.startsWith('+')) {
    // Already has country code
    const digits = cleaned.substring(1);
    if (digits.length < 10 || digits.length > 15) {
      return null; // Invalid length
    }
    return cleaned;
  }
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // US/Canada numbers (10 or 11 digits)
  if (cleaned.length === 10) {
    return `+${defaultCountryCode}${cleaned}`;
  }
  
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // International format (assume they included country code)
  if (cleaned.length >= 11 && cleaned.length <= 15) {
    return `+${cleaned}`;
  }
  
  return null; // Invalid format
}

/**
 * Validate message body
 */
function validateMessage(body) {
  if (!body || typeof body !== 'string') {
    return { valid: false, error: 'Message body is required' };
  }
  
  const trimmed = body.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  if (trimmed.length > 1600) {
    return { valid: false, error: 'Message too long (max 1600 characters)' };
  }
  
  return { valid: true, message: trimmed };
}

export async function handler(event, context) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { to, body } = requestBody;

    // Validate phone number
    if (!to) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Phone number is required' })
      };
    }

    const toNumber = formatPhoneNumber(to);
    if (!toNumber) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Invalid phone number format. Examples: (555) 123-4567, +1-555-123-4567, 5551234567' 
        })
      };
    }

    // Validate message
    const messageValidation = validateMessage(body);
    if (!messageValidation.valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: messageValidation.error })
      };
    }

    // Check Twilio credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
      console.error('Missing Twilio environment variables:', {
        hasAccountSid: !!accountSid,
        hasApiKeySid: !!apiKeySid,
        hasApiKeySecret: !!apiKeySecret,
        hasFromNumber: !!fromNumber
      });
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'SMS service not configured. Please add Twilio credentials to Netlify environment variables.',
          hint: 'Required: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_PHONE_NUMBER'
        })
      };
    }

    // Create Basic auth header using API Key
    const auth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');

    // Send SMS via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: messageValidation.message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', data);
      
      // Provide user-friendly error messages
      let userError = data.message || 'Failed to send SMS';
      
      if (data.code === 21211) {
        userError = `Invalid phone number: ${toNumber}`;
      } else if (data.code === 21608) {
        userError = 'Cannot send SMS to this phone number (unverified or blocked)';
      } else if (data.code === 21610) {
        userError = 'This phone number has opted out of receiving messages';
      } else if (data.code === 21614) {
        userError = 'Invalid destination phone number';
      }
      
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: userError,
          code: data.code
        })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `SMS sent to ${toNumber}`,
        sid: data.sid,
        status: data.status
      })
    };

  } catch (error) {
    console.error('SMS function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error. Please try again.' })
    };
  }
}
