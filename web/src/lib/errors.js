// Turns a Supabase / database error into a friendly sentence.
// The technical details go to the browser console (F12) for debugging;
// the user only sees plain words.
//
//   setError(friendlyError(error, 'load startups'))
//   -> "We could not load startups right now. Please try again in a moment."
export function friendlyError(error, action = 'load this') {
  console.error(`Could not ${action}:`, error)

  const message = error?.message ?? ''
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Could not reach the server. Please check your internet connection and try again.'
  }
  switch (error?.code) {
    case '42501': // RLS policy or guard trigger said no
      return 'You are not allowed to do that.'
    case '23505': // UNIQUE or PRIMARY KEY violation
      // The constraint name tells us which rule was broken (001_schema.sql).
      if (message.includes('uq_investment_round_investor')) {
        return 'This investor is already recorded in this round. Each investor can appear only once per round.'
      }
      // The second text comes from record_acquisition() in 005.
      if (message.includes('uq_acquisition_startup') || message.includes('already acquired')) {
        return 'This startup already has an acquisition. A startup can be acquired only once.'
      }
      if (message.includes('uq_city_name')) {
        return 'This city is already in the list.'
      }
      if (message.includes('uq_industry_name')) {
        return 'This industry is already in the list.'
      }
      if (message.includes('uq_investor_user')) {
        return 'You already have an investor profile. Please reload the page.'
      }
      return 'This already exists.'
    case '23514': // CHECK constraint failed
      return 'Some values are not allowed. Please check the form.'
    case '23503': // FOREIGN KEY violation
      return 'This refers to something that no longer exists. Please reload the page.'
    default:
      return `We could not ${action} right now. Please try again in a moment.`
  }
}
