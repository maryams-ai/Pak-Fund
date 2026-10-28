// My watchlist (screen 14). Layout from mockups/Watchlist.dc.html.
// Founders and investors can both open it (see App.jsx).
//
// Reads:
//   Watchlist (+ Startup, City, Industry)   the user's saved startups
//   v_startup_total_funding                 total funding per startup
//   RLS "Users can read their own watchlist" returns only my rows.
// Writes:
//   DELETE Watchlist (Remove button). RLS policy "Users can remove
//   startups from their own watchlist" (002_rls.sql): userno = me.
//   (Saving happens on other pages through components/SaveButton.jsx.)
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatUsd, initialOf } from '../lib/format'
import { friendlyError } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

async function loadWatchlist(userId) {
  // startup(...) follows the foreign key Watchlist.startupNo -> Startup.
  // If RLS hides the startup (e.g. an admin removed its approval), the
  // embedded startup comes back as null.
  const saved = await supabase
    .from('watchlist')
    .select('startupno, savedat, startup ( startupname, tagline, stage, city ( cityname ), industry ( industryname ) )')
    .eq('userno', userId)
    .order('savedat', { ascending: false })
  if (saved.error) throw saved.error

  const ids = saved.data.map((row) => row.startupno)
  const totals = await supabase.from('v_startup_total_funding').select('startupno, totalfundingusd').in('startupno', ids)
  if (totals.error) throw totals.error

  const totalById = Object.fromEntries(totals.data.map((row) => [row.startupno, row.totalfundingusd]))
  return saved.data.map((row) => ({ ...row, total: totalById[row.startupno] ?? 0 }))
}

export default function Watchlist() {
  const { user } = useAuth()

  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'done'
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState('') // error from Remove
  const [removing, setRemoving] = useState(null) // startupno being removed

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadWatchlist(user.id)
      .then((result) => {
        if (cancelled) return
        setRows(result)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load your watchlist'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [user.id, attempt])

  async function remove(startupNo) {
    setMessage('')
    setRemoving(startupNo)
    const { error: deleteError } = await supabase
      .from('watchlist')
      .delete()
      .eq('userno', user.id)
      .eq('startupno', startupNo)
    setRemoving(null)
    if (deleteError) {
      setMessage(friendlyError(deleteError, 'remove this startup'))
      return
    }
    // Take the card off the screen without reloading everything.
    setRows((current) => current.filter((row) => row.startupno !== startupNo))
  }

  return (
    <>
      <PageHeader title="My watchlist" subtitle="Startups you saved to follow. Open one to see its team and funding, or remove it when you no longer need it." />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading your watchlist..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}
        {message && <div className="alert-error mb-6">{message}</div>}

        {status === 'done' && rows.length === 0 && (
          <EmptyState
            title="Your watchlist is empty"
            text='Browse startups and select "Save to watchlist" on any you want to follow. They will appear here so you can find them quickly.'
            action={
              <Link to="/startups" className="btn btn-blue">
                Browse startups
              </Link>
            }
          />
        )}

        {status === 'done' && rows.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-6">
            {rows.map((row) => (
              <SavedCard
                key={row.startupno}
                row={row}
                removing={removing === row.startupno}
                onRemove={() => remove(row.startupno)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function SavedCard({ row, removing, onRemove }) {
  const startup = row.startup
  const meta = startup
    ? [startup.industry?.industryname, startup.city?.cityname, startup.stage].filter(Boolean).join(' · ')
    : 'This startup is no longer public.'

  return (
    <div className="card flex flex-col gap-4 p-[26px]">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-primary">
          {initialOf(startup?.startupname)}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-text">{startup?.startupname ?? 'Hidden startup'}</div>
          <div className="text-sm text-muted">{meta}</div>
        </div>
      </div>

      <div className="leading-normal text-ink-soft">{startup?.tagline}</div>

      <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-line pt-3.5 text-sm text-muted">
        <span>
          Total funding <b className="text-ink">{formatUsd(row.total)}</b>
        </span>
        <span>Saved {formatDate(row.savedat)}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {startup && (
          <Link to={`/startups/${row.startupno}`} className="btn btn-sm btn-blue">
            Open
          </Link>
        )}
        <button type="button" className="btn btn-sm btn-line" onClick={onRemove} disabled={removing}>
          {removing ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </div>
  )
}
