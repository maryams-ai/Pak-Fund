// Can the current user send a pitch?
// Only a logged-in Founder who owns at least one APPROVED startup. This
// matches the database rule in 002_rls.sql (pitches need an approved
// startup), so we never show a button that would fail.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useCanPitch() {
  const { user, role } = useAuth()
  const userId = user?.id
  const [canPitch, setCanPitch] = useState(false)

  useEffect(() => {
    if (!userId || role !== 'Founder') {
      setCanPitch(false)
      return
    }
    let cancelled = false
    // head: true = only count rows, do not download them.
    supabase
      .from('startup')
      .select('startupno', { count: 'exact', head: true })
      .eq('userno', userId)
      .eq('isapproved', true)
      .then(({ count, error }) => {
        if (!cancelled) setCanPitch(!error && count > 0)
      })
    return () => {
      cancelled = true
    }
  }, [userId, role])

  return canPitch
}
