// "Save" button: adds the startup to the user's Watchlist
// (INSERT into the Watchlist table, brief section 9).
//
// - Visitor           -> link to log in, then come back
// - Founder/Investor  -> saves; shows "Saved" afterwards
// - Admin             -> no button (admins have no watchlist)
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'

export default function SaveButton({ startupNo, alreadySaved = false, label = 'Save', small = true, dark = false }) {
  const { user, role } = useAuth()
  const location = useLocation()
  const [state, setState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

  const className = `btn ${small ? 'btn-sm' : ''} ${dark ? 'btn-line-dark' : 'btn-line'}`

  if (!user) {
    return (
      <Link to="/login?mode=login" state={{ from: location.pathname + location.search }} className={className}>
        {label}
      </Link>
    )
  }
  if (role !== 'Founder' && role !== 'Investor') return null

  const saved = alreadySaved || state === 'saved'

  async function save() {
    setState('saving')
    const { error } = await supabase.from('watchlist').insert({ userno: user.id, startupno: startupNo })
    if (!error || error.code === '23505') {
      // 23505 = it was already in the watchlist (composite primary key).
      setState('saved')
    } else {
      friendlyError(error, 'save this startup') // logs the details
      setState('error')
    }
  }

  return (
    <button type="button" onClick={save} disabled={saved || state === 'saving'} className={className}>
      {state === 'saving' ? 'Saving...' : saved ? 'Saved' : state === 'error' ? 'Could not save, retry' : label}
    </button>
  )
}
