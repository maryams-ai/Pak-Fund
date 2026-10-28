// Investor: Received pitches (screen 13). Layout from mockups/Inbox.dc.html.
//
// Reads:
//   Investor             my own row (am I set up? am I verified?)
//   v_pending_pitches    pitches still waiting (view from the brief). RLS on
//                        PitchRequest inside the view shows only pitches
//                        sent to me ("Investors can read pitches addressed
//                        to them").
//   PitchRequest (+ Startup, profiles)  my past pitches (Accepted / Declined)
//   v_startup_directory  industry, city and stage line for each startup
//   FundingRound         rounds of the startup chosen in "Record an investment"
// Writes:
//   UPDATE PitchRequest.status -> 'Accepted' or 'Declined'
//     RLS "Investors can accept or decline pitches addressed to them":
//     only my pitches, only while Pending, new status Accepted/Declined.
//     We send ONLY the status; the guard trigger protect_pitch blocks
//     changes to any other column.
//   INSERT Investment
//     RLS "Investors can record their own investments in approved
//     startups": investorno = my_investor_no(), the round's startup is
//     approved. UNIQUE (roundNo, investorNo) blocks duplicates.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMonthYear, initialOf } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { EmptyState, ErrorBox, Loading } from '../../components/Status'

async function loadInbox(userId) {
  const investor = await supabase
    .from('investor')
    .select('investorno, investorname, isverified')
    .eq('userno', userId)
    .maybeSingle()
  if (investor.error) throw investor.error
  if (!investor.data) return { investor: null, pitches: [], startupInfo: {} }

  const [pending, past] = await Promise.all([
    supabase.from('v_pending_pitches').select('*').order('requestdate', { ascending: false }),
    supabase
      .from('pitchrequest')
      .select('requestno, requestdate, startupno, message, status, startup ( startupname ), profiles ( fullname )')
      .eq('investorno', investor.data.investorno)
      .neq('status', 'Pending')
      .order('requestdate', { ascending: false }),
  ])
  if (pending.error) throw pending.error
  if (past.error) throw past.error

  // Put both lists into the same shape: pending ones first, then the rest.
  const pitches = [
    ...pending.data, // the view already has startupname and sendername
    ...past.data.map((p) => ({
      ...p,
      startupname: p.startup?.startupname,
      sendername: p.profiles?.fullname,
    })),
  ]

  // Industry / city / stage for each startup, in one query.
  const ids = [...new Set(pitches.map((p) => p.startupno))]
  const startups = await supabase
    .from('v_startup_directory')
    .select('startupno, industryname, cityname, stage')
    .in('startupno', ids)
  if (startups.error) throw startups.error
  const startupInfo = Object.fromEntries(startups.data.map((s) => [s.startupno, s]))

  return { investor: investor.data, pitches, startupInfo }
}

export default function Inbox() {
  const { user } = useAuth()

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState(null) // { type, text } after Accept / Decline
  const [busy, setBusy] = useState(null) // requestno being answered

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadInbox(user.id)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load your pitches'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [user.id, attempt])

  async function answer(pitch, newStatus) {
    setMessage(null)
    setBusy(pitch.requestno)
    // .select() returns the changed rows. If RLS refused the row (e.g. it
    // was already answered), Postgres changes 0 rows without an error.
    const { data: changed, error: updateError } = await supabase
      .from('pitchrequest')
      .update({ status: newStatus })
      .eq('requestno', pitch.requestno)
      .select('requestno')
    setBusy(null)

    if (updateError) {
      setMessage({ type: 'error', text: friendlyError(updateError, 'answer this pitch') })
      return
    }
    if (changed.length === 0) {
      setMessage({ type: 'error', text: 'This pitch was already answered. The list has been refreshed.' })
      setAttempt((n) => n + 1)
      return
    }
    setMessage({
      type: 'info',
      text:
        newStatus === 'Accepted'
          ? `You accepted the pitch from ${pitch.startupname}. The founder can see this now.`
          : `You declined the pitch from ${pitch.startupname}. The founder can see this now.`,
    })
    // Update this pitch on screen without reloading everything.
    setData((current) => ({
      ...current,
      pitches: current.pitches.map((p) => (p.requestno === pitch.requestno ? { ...p, status: newStatus } : p)),
    }))
  }

  const pendingCount = data ? data.pitches.filter((p) => p.status === 'Pending').length : 0
  const subtitle =
    status !== 'done'
      ? 'Pitches that founders send you appear here. Accept or decline each one.'
      : pendingCount === 0
        ? 'No pitches are waiting. You are all caught up.'
        : `${pendingCount} waiting for your answer. Accept or decline each one; the founder sees your answer.`

  return (
    <>
      <PageHeader title="Pitch inbox" subtitle={subtitle} />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading your pitches..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}

        {/* No Investor row yet: nobody can pitch to me. */}
        {status === 'done' && !data.investor && (
          <EmptyState
            title="Create your investor profile first"
            text="Founders can pitch you once you have an investor profile and an admin has verified it."
            action={
              <Link to="/investor/profile" className="btn btn-blue">
                Create my profile
              </Link>
            }
          />
        )}

        {status === 'done' && data.investor && (
          <div className="flex flex-wrap items-start gap-6">
            {/* ---------------- Pitch list ---------------- */}
            <section className="flex min-w-0 flex-[999_1_580px] flex-col gap-5">
              {!data.investor.isverified && (
                <div className="alert-info">
                  Your profile is waiting for admin verification. Founders can pitch you once it is verified.
                </div>
              )}
              {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}

              {data.pitches.length === 0 && (
                <EmptyState
                  title="No pitches received yet"
                  text="When a founder sends you a pitch, it will appear here. Keep your profile verified and up to date so the right founders find you."
                  action={
                    <Link to="/startups" className="btn btn-blue">
                      Browse startups
                    </Link>
                  }
                />
              )}

              {data.pitches.map((pitch) => (
                <PitchCard
                  key={pitch.requestno}
                  pitch={pitch}
                  info={data.startupInfo[pitch.startupno]}
                  busy={busy === pitch.requestno}
                  onAnswer={(newStatus) => answer(pitch, newStatus)}
                />
              ))}
            </section>

            {/* ---------------- Record an investment ---------------- */}
            <RecordInvestment investorNo={data.investor.investorno} pitches={data.pitches} />
          </div>
        )}
      </div>
    </>
  )
}

function PitchCard({ pitch, info, busy, onAnswer }) {
  const meta = info ? [info.industryname, info.cityname, info.stage].join(' · ') : ''

  return (
    <div className="card flex flex-col gap-[18px] p-6 sm:p-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-primary">
            {initialOf(pitch.startupname)}
          </div>
          <div>
            <div className="text-xl font-semibold">{pitch.startupname ?? 'Startup'}</div>
            <div className="text-sm text-muted">{meta}</div>
          </div>
        </div>
        <StatusChip status={pitch.status} />
      </div>

      <div className="rounded-[10px] bg-page px-[18px] py-4 leading-relaxed whitespace-pre-line text-ink-soft">
        {pitch.message}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          From {pitch.sendername ?? 'a founder'} · {formatDate(pitch.requestdate)}
        </span>
        <div className="flex flex-wrap gap-3">
          {info && (
            <Link to={`/startups/${pitch.startupno}`} className="btn btn-sm btn-line">
              View startup
            </Link>
          )}
          {/* Only a Pending pitch can be answered (RLS rule). */}
          {pitch.status === 'Pending' && (
            <>
              <button type="button" className="btn btn-sm btn-line" disabled={busy} onClick={() => onAnswer('Declined')}>
                Decline
              </button>
              <button type="button" className="btn btn-sm btn-blue" disabled={busy} onClick={() => onAnswer('Accepted')}>
                {busy ? 'Saving...' : 'Accept'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "Record an investment" form. The startup list is the startups whose
// pitch I accepted; the round list is loaded when a startup is chosen.
function RecordInvestment({ investorNo, pitches }) {
  const accepted = pitches.filter((p) => p.status === 'Accepted')
  // One entry per startup, even if it pitched me twice.
  const startups = [...new Map(accepted.map((p) => [p.startupno, p.startupname])).entries()]

  const [startupNo, setStartupNo] = useState('')
  const [rounds, setRounds] = useState([])
  const [roundsStatus, setRoundsStatus] = useState('idle') // 'idle' | 'loading' | 'error' | 'done'
  const [form, setForm] = useState({ roundno: '', amount: '', islead: false })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // Load the rounds of the chosen startup (public read: "Anyone can read
  // rounds of startups they can see").
  useEffect(() => {
    setRounds([])
    setForm((current) => ({ ...current, roundno: '' }))
    if (!startupNo) {
      setRoundsStatus('idle')
      return
    }
    let cancelled = false
    setRoundsStatus('loading')
    supabase
      .from('fundinground')
      .select('roundno, roundtype, rounddate')
      .eq('startupno', startupNo)
      .order('rounddate', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          friendlyError(error, 'load rounds') // logs the details
          setRoundsStatus('error')
          return
        }
        setRounds(data)
        setRoundsStatus('done')
      })
    return () => {
      cancelled = true
    }
  }, [startupNo])

  async function save(event) {
    event.preventDefault()
    setMessage(null)
    const amount = form.amount === '' ? null : Number(form.amount)

    if (!form.roundno) {
      setMessage({ type: 'error', text: 'Please choose a startup and a round.' })
      return
    }
    if (amount !== null && !(amount > 0)) {
      setMessage({ type: 'error', text: 'The amount must be a positive number, or leave it empty if undisclosed.' })
      return
    }

    setSaving(true)
    const { error } = await supabase.from('investment').insert({
      roundno: Number(form.roundno),
      investorno: investorNo,
      amountusd: amount,
      islead: form.islead,
    })
    setSaving(false)

    if (error) {
      // friendlyError already explains 23505 = "already recorded in this round".
      let text = friendlyError(error, 'save this investment')
      if (error.code === '42501') text = 'This investment was not accepted. The startup must be approved.'
      setMessage({ type: 'error', text })
      return
    }
    setMessage({ type: 'info', text: 'Investment saved. It now shows on the startup page and your portfolio.' })
    setForm({ roundno: '', amount: '', islead: false })
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className="card flex w-full max-w-[420px] min-w-0 flex-[1_1_340px] flex-col gap-[18px] p-6 sm:p-[30px]"
    >
      <div>
        <h2 className="m-0 text-xl font-bold">Record an investment</h2>
        <div className="mt-1.5 text-sm text-muted">After you invest, add it to the startup's funding round.</div>
      </div>

      {startups.length === 0 ? (
        <p className="m-0 text-[15px] text-muted">Accept a pitch first. Startups you accepted will appear here.</p>
      ) : (
        <>
          <label className="lbl text-[15px]">
            Startup
            <select className="fld" value={startupNo} onChange={(e) => setStartupNo(e.target.value)}>
              <option value="">Choose a startup</option>
              {startups.map(([no, name]) => (
                <option key={no} value={no}>
                  {name}
                </option>
              ))}
            </select>
            <span className="hint">Only startups whose pitch you accepted are listed.</span>
          </label>

          <label className="lbl text-[15px]">
            Round
            <select
              className="fld"
              value={form.roundno}
              onChange={(e) => setForm({ ...form, roundno: e.target.value })}
              disabled={roundsStatus !== 'done' || rounds.length === 0}
            >
              <option value="">
                {roundsStatus === 'loading'
                  ? 'Loading rounds...'
                  : roundsStatus === 'error'
                    ? 'Could not load rounds'
                    : roundsStatus === 'done' && rounds.length === 0
                      ? 'This startup has no rounds yet'
                      : 'Choose a round'}
              </option>
              {rounds.map((round) => (
                <option key={round.roundno} value={round.roundno}>
                  {round.roundtype} · {formatMonthYear(round.rounddate)}
                </option>
              ))}
            </select>
            <span className="hint">Choose the funding round you invested in.</span>
          </label>

          <label className="lbl text-[15px]">
            Amount (USD)
            <input
              className="fld"
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="150000"
            />
            <span className="hint">Optional. Leave empty if the amount is undisclosed.</span>
          </label>

          <label className="flex items-center gap-2.5 text-base font-medium">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] accent-brand"
              checked={form.islead}
              onChange={(e) => setForm({ ...form, islead: e.target.checked })}
            />
            I led this round
          </label>

          <div className="hint">Each investor can be recorded only once per funding round.</div>

          {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}

          <button type="submit" className="btn btn-blue" disabled={saving}>
            {saving ? 'Saving...' : 'Save investment'}
          </button>
        </>
      )}
    </form>
  )
}
