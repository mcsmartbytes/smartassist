// Netlify Function for sending SMS via Twilio
// Environment variables needed:
// - TWILIO_ACCOUNT_SID
// - TWILIO_API_KEY_SID
// - TWILIO_API_KEY_SECRET
// - TWILIO_PHONE_NUMBER

export async function handler(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { to, body } = JSON.parse(event.body);

    if (!to || !body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: to, body' })
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Twilio credentials not configured' })
      };
    }

    // Format phone number (ensure it starts with +)
    let toNumber = to.replace(/\D/g, '');
    if (!toNumber.startsWith('+')) {
      toNumber = toNumber.startsWith('1') ? `+${toNumber}` : `+1${toNumber}`;
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
        Body: body
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.message || 'Failed to send SMS',
          code: data.code
        })
      };
    }

    return {
      statusCode: 200,
      headers,
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
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}
