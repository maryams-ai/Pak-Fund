// Founder: Send a pitch (screen 11). Layout from mockups/Pitch.dc.html.
//
// Reads:
//   Startup              the founder's own APPROVED startups (dropdown)
//   v_investor_summary   verified investors (dropdown)
//   PitchRequest (+ Investor, Startup)  "Pitches you sent" with status
// Writes:
//   INSERT PitchRequest with status 'Pending'. RLS policy "Founders can
//   pitch own approved startup to verified investor" (002_rls.sql) checks:
//   role Founder, userno = me, status Pending, the startup is mine AND
//   approved, the investor is verified. The dropdowns only offer rows
//   that pass, and a rejection still gets a friendly message.
// ?startup=5 and ?investor=7 in the URL pre-select the dropdowns.
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { EmptyState, ErrorBox, Loading } from '../../components/Status'

const MAX_MESSAGE = 800

async function loadPage(userId) {
  const [startups, investors, pitches] = await Promise.all([
    supabase
      .from('startup')
      .select('startupno, startupname')
      .eq('userno', userId)
      .eq('isapproved', true)
      .order('startupname'),
    supabase.from('v_investor_summary').select('investorno, investorname, investortype, cityname').order('investorname'),
    supabase
      .from('pitchrequest')
      .select('requestno, startupno, investorno, status, requestdate, message, investor ( investorname ), startup ( startupname )')
      .eq('userno', userId)
      .order('requestdate', { ascending: false }),
  ])
  const failed = [startups, investors, pitches].find((result) => result.error)
  if (failed) throw failed.error
  return { startups: startups.data, investors: investors.data, pitches: pitches.data }
}

export default function SendPitch() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'done'
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    investorno: searchParams.get('investor') ?? '',
    startupno: searchParams.get('startup') ?? '',
    message: '',
  })
  const [formMessage, setFormMessage] = useState(null) // { type, text }
  const [sending, setSending] = useState(false)

  const reload = useCallback(async () => {
    try {
      const result = await loadPage(user.id)
      setData(result)
      setStatus('done')
      // Pre-select the only startup, or drop a ?startup= that is not allowed.
      setForm((current) => {
        const allowed = result.startups.some((s) => String(s.startupno) === current.startupno)
        if (allowed) return current
        return { ...current, startupno: result.startups.length === 1 ? String(result.startups[0].startupno) : '' }
      })
    } catch (err) {
      setError(friendlyError(err, 'load your pitches'))
      setStatus('error')
    }
  }, [user.id])

  useEffect(() => {
    setStatus('loading')
    reload()
  }, [reload])

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  async function sendPitch(event) {
    event.preventDefault()
    setFormMessage(null)
    const message = form.message.trim()

    if (!form.investorno || !form.startupno) {
      setFormMessage({ type: 'error', text: 'Please choose an investor and one of your startups.' })
      return
    }
    if (!message) {
      setFormMessage({ type: 'error', text: 'Please write a short message.' })
      return
    }
    if (message.length > MAX_MESSAGE) {
      setFormMessage({ type: 'error', text: `Your message is ${message.length} characters. The limit is ${MAX_MESSAGE}.` })
      return
    }
    // The database allows it, but two open pitches to the same investor
    // for the same startup would only annoy them.
    const alreadyPending = data.pitches.some(
      (p) => p.status === 'Pending' && String(p.startupno) === form.startupno && String(p.investorno) === form.investorno,
    )
    if (alreadyPending) {
      setFormMessage({ type: 'error', text: 'You already have a pending pitch to this investor for this startup.' })
      return
    }

    setSending(true)
    const { error: insertError } = await supabase.from('pitchrequest').insert({
      userno: user.id,
      investorno: Number(form.investorno),
      startupno: Number(form.startupno),
      message,
      status: 'Pending',
    })
    setSending(false)

    if (insertError) {
      let text = friendlyError(insertError, 'send your pitch') // also logs the details
      // 42501 = the RLS policy refused the row: explain which rule.
      if (insertError.code === '42501') {
        text = 'This pitch was not accepted. Your startup must be approved by an admin and the investor must be verified.'
      }
      setFormMessage({ type: 'error', text })
      return
    }

    const investor = data.investors.find((i) => String(i.investorno) === form.investorno)
    setFormMessage({ type: 'info', text: `Pitch sent to ${investor?.investorname ?? 'the investor'}. Status: Pending.` })
    setForm({ ...form, message: '' })
    reload()
  }

  return (
    <>
      <PageHeader
        title="Send a pitch"
        subtitle="Introduce your startup to a verified investor with a short message. Keep it clear: they should understand it within two minutes."
      />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={reload} />}

        {status === 'done' && (
          <div className="flex flex-wrap items-start gap-6">
            {/* ---------------- New pitch ---------------- */}
            {data.startups.length === 0 ? (
              <div className="min-w-0 flex-[1_1_520px]">
                <EmptyState
                  title="Your startup needs approval first"
                  text="You can pitch once one of your startups has been approved by an admin. New listings are usually reviewed soon."
                  action={
                    <Link to="/founder/startups" className="btn btn-blue">
                      Go to my startups
                    </Link>
                  }
                />
              </div>
            ) : (
              <form onSubmit={sendPitch} noValidate className="card flex min-w-0 flex-[1_1_520px] flex-col gap-[22px] p-6 sm:p-8">
                <div>
                  <h2 className="m-0 text-2xl font-bold">New pitch</h2>
                  <p className="mt-1 mb-0 text-muted">Choose who to pitch, which startup it is about, and write your message.</p>
                </div>

                <label className="lbl text-[15px]">
                  Investor
                  <select className="fld" value={form.investorno} onChange={update('investorno')}>
                    <option value="">Choose a verified investor</option>
                    {data.investors.map((investor) => (
                      <option key={investor.investorno} value={investor.investorno}>
                        {[investor.investorname, investor.investortype, investor.cityname].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                  <span className="text-[13px] font-normal text-muted">
                    Only verified investors are listed. Check their profile first to see if they back your industry.
                  </span>
                </label>

                <label className="lbl text-[15px]">
                  Your startup
                  <select className="fld" value={form.startupno} onChange={update('startupno')}>
                    <option value="">Choose your startup</option>
                    {data.startups.map((startup) => (
                      <option key={startup.startupno} value={startup.startupno}>
                        {startup.startupname}
                      </option>
                    ))}
                  </select>
                  <span className="text-[13px] font-normal text-muted">Only your approved startups are listed.</span>
                </label>

                <label className="lbl text-[15px]">
                  Message
                  <textarea
                    className="fld resize-y"
                    rows={7}
                    maxLength={MAX_MESSAGE}
                    value={form.message}
                    onChange={update('message')}
                    placeholder="Hi, we are building ... We are raising ... because ..."
                  />
                  <span className="text-[13px] font-normal text-muted">
                    Up to {MAX_MESSAGE} characters ({form.message.length}/{MAX_MESSAGE}). Mention what you do, your traction
                    and what you are asking for.
                  </span>
                </label>

                {formMessage && (
                  <div className={formMessage.type === 'error' ? 'alert-error' : 'alert-info'}>{formMessage.text}</div>
                )}

                <div className="flex flex-wrap justify-end gap-4 border-t border-line pt-6">
                  <Link to="/founder/startups" className="btn btn-line">
                    Cancel
                  </Link>
                  <button type="submit" className="btn btn-blue" disabled={sending}>
                    {sending ? 'Sending...' : 'Send pitch'}
                  </button>
                </div>
              </form>
            )}

            {/* ---------------- Pitches you sent ---------------- */}
            <section className="card min-w-0 flex-[1_1_420px] p-6 sm:p-8">
              <h2 className="mt-0 mb-1.5 text-2xl font-bold">Pitches you sent</h2>
              <div className="mb-3 text-sm text-muted">
                Pending means the investor has not replied yet. Accepted or Declined shows their answer.
              </div>
              {data.pitches.length === 0 && (
                <p className="m-0 border-t border-line pt-4 text-muted">No pitches yet. Choose an investor and write your message to send your first one.</p>
              )}
              {data.pitches.map((pitch) => (
                <div key={pitch.requestno} className="border-t border-line py-[18px]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[17px] font-semibold">{pitch.investor?.investorname ?? 'Investor'}</div>
                    <StatusChip status={pitch.status} />
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {pitch.startup?.startupname} · sent {formatDate(pitch.requestdate)}
                  </div>
                  <div className="mt-2 text-[15px] leading-normal text-ink-soft">{pitch.message}</div>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
