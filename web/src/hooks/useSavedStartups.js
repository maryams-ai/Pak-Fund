// The startups the logged-in user already saved (Watchlist table),
// so Save buttons can show "Saved" straight away.
// Returns a Set of startupno. Empty for visitors and admins.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useSavedStartups() {
  const { user, role } = useAuth()
  const userId = user?.id
  const canSave = role === 'Founder' || role === 'Investor'
  const [savedIds, setSavedIds] = useState(() => new Set())

  useEffect(() => {
    if (!userId || !canSave) {
      setSavedIds(new Set())
      return
    }
    let cancelled = false
    // RLS only returns this user's own watchlist rows.
    supabase
      .from('watchlist')
      .select('startupno')
      .eq('userno', userId)
      .then(({ data, error }) => {
        // On error we simply show plain "Save" buttons; saving still works.
        if (!cancelled && !error) setSavedIds(new Set(data.map((row) => row.startupno)))
      })
    return () => {
      cancelled = true
    }
  }, [userId, canSave])

  return savedIds
}
