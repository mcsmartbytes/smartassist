// Time Parser - Parse natural language time expressions
// Supports: "in 30 minutes", "tomorrow at 3pm", "next Monday", etc.

/**
 * Parse a natural language time expression and return a Date object
 * @param {string} text - The text to parse for time expressions
 * @returns {{ date: Date|null, matched: string|null }} - Parsed date and matched text
 */
export function parseTimeExpression(text) {
  if (!text) return { date: null, matched: null };
  
  const now = new Date();
  const lowerText = text.toLowerCase();
  
  // Pattern: "in X minutes/hours/days/weeks"
  const inMatch = lowerText.match(/in\s+(\d+)\s*(minute|min|hour|hr|day|week)s?/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const result = new Date(now);
    
    if (unit.startsWith('min')) {
      result.setMinutes(result.getMinutes() + amount);
    } else if (unit.startsWith('hour') || unit === 'hr') {
      result.setHours(result.getHours() + amount);
    } else if (unit === 'day') {
      result.setDate(result.getDate() + amount);
    } else if (unit === 'week') {
      result.setDate(result.getDate() + (amount * 7));
    }
    
    return { date: result, matched: inMatch[0] };
  }
  
  // Pattern: specific time "at 3pm", "at 10:30am", "at 14:00"
  const timeMatch = lowerText.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  
  // Pattern: "tomorrow", "today", "tonight"
  const dayWords = {
    'today': 0,
    'tonight': 0,
    'tomorrow': 1,
    'day after tomorrow': 2
  };
  
  let targetDate = new Date(now);
  let matchedDay = null;
  
  for (const [word, daysAhead] of Object.entries(dayWords)) {
    if (lowerText.includes(word)) {
      targetDate.setDate(targetDate.getDate() + daysAhead);
      matchedDay = word;
      break;
    }
  }
  
  // Pattern: "next Monday", "this Friday", etc.
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayMatch = lowerText.match(/(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
  
  if (weekdayMatch) {
    const isNext = weekdayMatch[1]?.toLowerCase() === 'next';
    const targetDay = weekdays.indexOf(weekdayMatch[2].toLowerCase());
    const currentDay = now.getDay();
    
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0 || isNext) {
      daysUntil += 7; // Next week
    }
    
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    matchedDay = weekdayMatch[0];
  }
  
  // Pattern: "next week", "in a week"
  if (lowerText.includes('next week') || lowerText.match(/in\s+a\s+week/i)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 7);
    matchedDay = 'next week';
  }
  
  // Apply time if found
  if (timeMatch && timeMatch[1]) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();
    
    // Convert to 24-hour format
    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    } else if (!period && hours < 12 && hours !== 0) {
      // Assume PM for times like "3" if no period specified and it's reasonable
      // (between 1-7 usually means PM in context)
      if (hours >= 1 && hours <= 7) {
        hours += 12;
      }
    }
    
    targetDate.setHours(hours, minutes, 0, 0);
    
    // If the time is in the past today, and no day was specified, assume tomorrow
    if (!matchedDay && targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    return { 
      date: targetDate, 
      matched: matchedDay ? `${matchedDay} at ${timeMatch[0]}` : `at ${timeMatch[0]}`
    };
  }
  
  // If we matched a day word but no time, set a default time
  if (matchedDay) {
    // Default times based on context
    if (lowerText.includes('morning')) {
      targetDate.setHours(9, 0, 0, 0);
    } else if (lowerText.includes('afternoon')) {
      targetDate.setHours(14, 0, 0, 0);
    } else if (lowerText.includes('evening') || lowerText.includes('tonight')) {
      targetDate.setHours(18, 0, 0, 0);
    } else if (lowerText.includes('night')) {
      targetDate.setHours(21, 0, 0, 0);
    } else {
      // Default to 9 AM for day-based reminders
      targetDate.setHours(9, 0, 0, 0);
    }
    
    return { date: targetDate, matched: matchedDay };
  }
  
  // Pattern: "end of day", "EOD"
  if (lowerText.includes('end of day') || lowerText.includes('eod')) {
    targetDate.setHours(17, 0, 0, 0);
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    return { date: targetDate, matched: 'end of day' };
  }
  
  // Pattern: "this morning", "this afternoon", "this evening"
  if (lowerText.includes('this morning')) {
    targetDate.setHours(9, 0, 0, 0);
    return { date: targetDate, matched: 'this morning' };
  }
  if (lowerText.includes('this afternoon')) {
    targetDate.setHours(14, 0, 0, 0);
    return { date: targetDate, matched: 'this afternoon' };
  }
  if (lowerText.includes('this evening')) {
    targetDate.setHours(18, 0, 0, 0);
    return { date: targetDate, matched: 'this evening' };
  }
  
  return { date: null, matched: null };
}

/**
 * Extract the reminder content by removing time expressions
 * @param {string} text - The full reminder text
 * @param {string} matched - The matched time expression to remove
 * @returns {string} - Cleaned reminder content
 */
export function extractReminderContent(text, matched) {
  if (!text) return '';
  if (!matched) return text;
  
  // Remove the matched time expression
  let content = text.replace(new RegExp(matched, 'i'), '').trim();
  
  // Remove common time-related prefixes
  content = content
    .replace(/^(to|about|that|for)\s+/i, '')
    .replace(/\s+(at|on|in|by|before|after)$/i, '')
    .trim();
  
  return content;
}

/**
 * Format a date for display
 * @param {Date} date - The date to format
 * @returns {string} - Human-readable date string
 */
export function formatReminderTime(date) {
  if (!date) return '';
  
  const now = new Date();
  const diffMs = date - now;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  
  // Check if same day
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  if (diffMins < 60) {
    return `in ${diffMins} minutes`;
  }
  
  if (diffHours < 24 && isToday) {
    return `today at ${timeStr}`;
  }
  
  if (isTomorrow) {
    return `tomorrow at ${timeStr}`;
  }
  
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export default { parseTimeExpression, extractReminderContent, formatReminderTime };
