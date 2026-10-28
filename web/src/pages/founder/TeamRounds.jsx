// Founder: Team and funding rounds (screen 10). Layout from mockups/TeamRounds.dc.html.
//
// Reads:  Startup (owner check), StartupFounder + Founder (team),
//         FundingRound (rounds), Investment + Investor (who invested,
//         read-only; investors record investments from their Inbox).
// Writes and the RLS rule each one relies on (002_rls.sql):
//   Add member     -> rpc add_team_member(): SECURITY DEFINER function that
//                     checks owns_startup() and then inserts Founder +
//                     StartupFounder together.
//   Remove member  -> DELETE StartupFounder, policy "Founders can manage the
//                     team of their own startups" (owns_startup). The person
//                     stays in Founder; only the link is removed.
//   Add/Edit round -> INSERT/UPDATE FundingRound, policy "Founders can manage
//                     rounds of their own startups"; CHECK amount > 0.
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { ROUND_TYPES } from '../../lib/constants'
import { formatMonthYear, formatUsd } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import { EmptyState, ErrorBox, Loading } from '../../components/Status'

const THIS_YEAR = new Date().getFullYear()
const EMPTY_MEMBER = { fullName: '', roleTitle: '', joinedYear: '', email: '', linkedinUrl: '' }
const EMPTY_ROUND = { roundType: 'Seed', roundDate: '', amount: '', valuation: '' }

async function loadPage(startupId, userId) {
  const startup = await supabase.from('startup').select('startupno, startupname, userno').eq('startupno', startupId).maybeSingle()
  if (startup.error) throw startup.error
  if (!startup.data || startup.data.userno !== userId) return null // not this founder's startup

  const [team, rounds] = await Promise.all([
    supabase
      .from('startupfounder')
      .select('roletitle, joinedyear, founder ( founderno, fullname )')
      .eq('startupno', startupId)
      .order('joinedyear', { ascending: true }),
    supabase
      .from('fundinground')
      .select('roundno, roundtype, rounddate, amountraisedusd, valuationusd')
      .eq('startupno', startupId)
      .order('rounddate', { ascending: false }),
  ])
  if (team.error) throw team.error
  if (rounds.error) throw rounds.error

  // Investments in these rounds. Policy "Founders can read all investments
  // in their own rounds" lets the owner see them all.
  const roundIds = rounds.data.map((r) => r.roundno)
  const investments = await supabase
    .from('investment')
    .select('investmentno, roundno, amountusd, islead, investor ( investorname )')
    .in('roundno', roundIds)
  if (investments.error) throw investments.error

  return { startup: startup.data, team: team.data, rounds: rounds.data, investments: investments.data }
}

export default function TeamRounds() {
  const { startupNo } = useParams()
  const id = Number(startupNo)
  const { user } = useAuth()
  const location = useLocation()

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'notfound' | 'done'
  const [error, setError] = useState('')

  // Load (or reload after a change). Only the first load shows the spinner.
  const reload = useCallback(async () => {
    try {
      const result = await loadPage(id, user.id)
      setData(result)
      setStatus(result ? 'done' : 'notfound')
    } catch (err) {
      setError(friendlyError(err, 'load your team and rounds'))
      setStatus('error')
    }
  }, [id, user.id])

  useEffect(() => {
    setStatus('loading')
    reload()
  }, [reload])

  if (status !== 'done') {
    return (
      <>
        <PageHeader title="Team and funding rounds" breadcrumb={<Link to="/founder/startups">My startups</Link>} />
        <div className="page-x pt-8">
          {status === 'loading' && <Loading text="Loading..." />}
          {status === 'error' && <ErrorBox message={error} onRetry={reload} />}
          {status === 'notfound' && (
            <EmptyState
              title="This is not your startup"
              text="You can only manage the team and rounds of startups that you added."
              action={
                <Link to="/founder/startups" className="btn btn-blue">
                  Back to my startups
                </Link>
              }
            />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Team and funding rounds"
        subtitle="Add the people behind your startup and the funding you have raised. Investors see both on your public page."
        breadcrumb={
          <>
            <Link to="/founder/startups">My startups</Link> / {data.startup.startupname} / Team and rounds
          </>
        }
      />

      <div className="page-x pt-8">
        {location.state?.flash && <div className="alert-info mb-6">{location.state.flash}</div>}

        <div className="flex flex-wrap items-start gap-6">
          <TeamSection startupId={id} team={data.team} onChanged={reload} />
          <RoundsSection startupId={id} rounds={data.rounds} investments={data.investments} onChanged={reload} />
        </div>

        <div className="flex flex-wrap gap-4 pt-6">
          <Link to="/founder/startups" className="btn btn-line">
            Back to my startups
          </Link>
          <Link to={`/founder/pitch?startup=${id}`} className="btn btn-blue">
            Next: send a pitch
          </Link>
        </div>
      </div>
    </>
  )
}

// ======================= Team members =======================
function TeamSection({ startupId, team, onChanged }) {
  const [form, setForm] = useState(EMPTY_MEMBER)
  const [message, setMessage] = useState(null) // { type: 'error' | 'info', text }
  const [busy, setBusy] = useState(false)

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  async function addMember(event) {
    event.preventDefault()
    setMessage(null)

    // Same rules as the database: names required, year in range, email format.
    if (!form.fullName.trim() || !form.roleTitle.trim()) {
      setMessage({ type: 'error', text: 'Please enter the full name and role title.' })
      return
    }
    const year = form.joinedYear === '' ? null : Number(form.joinedYear)
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > THIS_YEAR)) {
      setMessage({ type: 'error', text: `Joined year must be between 1900 and ${THIS_YEAR}.` })
      return
    }
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setMessage({ type: 'error', text: 'Please enter a valid email, or leave it empty.' })
      return
    }

    setBusy(true)
    // Parameter names are the function's argument names in lowercase.
    const { error } = await supabase.rpc('add_team_member', {
      p_startupno: startupId,
      p_fullname: form.fullName.trim(),
      p_roletitle: form.roleTitle.trim(),
      p_joinedyear: year,
      p_email: form.email.trim() || null,
      p_linkedinurl: form.linkedinUrl.trim() || null,
    })
    setBusy(false)

    if (error) {
      setMessage({ type: 'error', text: friendlyError(error, 'add this team member') })
      return
    }
    setMessage({ type: 'info', text: `${form.fullName.trim()} was added to the team.` })
    setForm(EMPTY_MEMBER)
    onChanged()
  }

  async function removeMember(member) {
    setMessage(null)
    const { error } = await supabase
      .from('startupfounder')
      .delete()
      .eq('startupno', startupId)
      .eq('founderno', member.founder.founderno)
    if (error) {
      setMessage({ type: 'error', text: friendlyError(error, 'remove this team member') })
      return
    }
    onChanged()
  }

  return (
    <section className="card flex min-w-0 flex-[1_1_520px] flex-col gap-6 p-6 sm:p-[30px]">
      <div>
        <h2 className="m-0 text-2xl font-bold">Team members</h2>
        <p className="mt-1 mb-0 text-muted">The founders and key people investors will see on your startup page.</p>
      </div>

      {team.length === 0 ? (
        <EmptyState title="No team members yet" text="Add the founders and key people using the form below. Investors like to see who is behind a startup." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          {team.map((member) => (
            <div
              key={member.founder.founderno}
              className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <div>
                <div className="font-semibold">{member.founder.fullname}</div>
                <div className="text-sm text-muted">
                  {member.roletitle}
                  {member.joinedyear ? ` · since ${member.joinedyear}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-red" onClick={() => removeMember(member)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addMember} noValidate className="flex flex-col gap-[18px] border-t border-line pt-6">
        <h3 className="m-0 text-lg font-semibold">Add a team member</h3>
        <label className="lbl text-[15px]">
          Full name
          <input className="fld" value={form.fullName} onChange={update('fullName')} placeholder="Usman Tariq" />
          <span className="hint">The person's full name as you want it shown.</span>
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[18px]">
          <label className="lbl text-[15px]">
            Role title
            <input className="fld" value={form.roleTitle} onChange={update('roleTitle')} placeholder="CTO" />
            <span className="hint">For example CEO, CTO or Head of Product.</span>
          </label>
          <label className="lbl text-[15px]">
            Joined year
            <input className="fld" type="number" value={form.joinedYear} onChange={update('joinedYear')} placeholder="2022" />
            <span className="hint">Optional. The year they joined the team.</span>
          </label>
        </div>
        <label className="lbl text-[15px]">
          Email
          <input className="fld" type="email" value={form.email} onChange={update('email')} placeholder="name@example.com" />
          <span className="hint">Optional. A contact email for this person.</span>
        </label>
        <label className="lbl text-[15px]">
          LinkedIn
          <input className="fld" value={form.linkedinUrl} onChange={update('linkedinUrl')} placeholder="linkedin.com/in/..." />
          <span className="hint">Optional. A link to their LinkedIn profile.</span>
        </label>
        {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}
        <div>
          <button type="submit" className="btn btn-blue" disabled={busy}>
            {busy ? 'Adding...' : 'Add member'}
          </button>
        </div>
      </form>
    </section>
  )
}

// ======================= Funding rounds =======================
function RoundsSection({ startupId, rounds, investments, onChanged }) {
  const [form, setForm] = useState(EMPTY_ROUND)
  const [editingNo, setEditingNo] = useState(null) // roundno being edited, or null = adding
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  function startEdit(round) {
    setMessage(null)
    setEditingNo(round.roundno)
    setForm({
      roundType: round.roundtype,
      roundDate: round.rounddate,
      amount: String(round.amountraisedusd),
      valuation: round.valuationusd === null ? '' : String(round.valuationusd),
    })
  }

  function cancelEdit() {
    setEditingNo(null)
    setForm(EMPTY_ROUND)
    setMessage(null)
  }

  async function saveRound(event) {
    event.preventDefault()
    setMessage(null)

    // Same rules as the CHECK constraints: amount > 0, valuation > 0 if given.
    const amount = Number(form.amount)
    const valuation = form.valuation === '' ? null : Number(form.valuation)
    if (!form.roundDate) {
      setMessage({ type: 'error', text: 'Please choose the round date.' })
      return
    }
    if (!(amount > 0)) {
      setMessage({ type: 'error', text: 'Amount raised must be a positive number.' })
      return
    }
    if (valuation !== null && !(valuation > 0)) {
      setMessage({ type: 'error', text: 'Valuation must be a positive number, or leave it empty if not disclosed.' })
      return
    }

    const row = {
      roundtype: form.roundType,
      rounddate: form.roundDate,
      amountraisedusd: amount,
      valuationusd: valuation,
    }

    setBusy(true)
    const { error } = editingNo
      ? await supabase.from('fundinground').update(row).eq('roundno', editingNo)
      : await supabase.from('fundinground').insert({ ...row, startupno: startupId })
    setBusy(false)

    if (error) {
      setMessage({ type: 'error', text: friendlyError(error, 'save this round') })
      return
    }
    setMessage({ type: 'info', text: editingNo ? 'Round updated.' : 'Round added.' })
    setEditingNo(null)
    setForm(EMPTY_ROUND)
    onChanged()
  }

  return (
    <section className="card flex min-w-0 flex-[1_1_520px] flex-col gap-6 p-6 sm:p-[30px]">
      <div>
        <h2 className="m-0 text-2xl font-bold">Funding rounds</h2>
        <p className="mt-1 mb-0 text-muted">Money you have raised so far. Rounds appear as a timeline on your public page.</p>
      </div>

      {rounds.length === 0 ? (
        <EmptyState title="No funding rounds yet" text="Add your first round using the form below, even a small angel round. If you have not raised money yet, you can skip this step." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          {rounds.map((round) => {
            const roundInvestments = investments.filter((inv) => inv.roundno === round.roundno)
            return (
              <div
                key={round.roundno}
                className={`border-b border-line px-5 py-4 last:border-b-0 ${editingNo === round.roundno ? 'bg-sky/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {round.roundtype} · <span className="text-brand">{formatUsd(round.amountraisedusd)}</span>
                    </div>
                    <div className="text-sm text-muted">
                      {formatMonthYear(round.rounddate)} · valuation{' '}
                      {round.valuationusd === null ? 'not disclosed' : formatUsd(round.valuationusd)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-line" onClick={() => startEdit(round)}>
                    Edit
                  </button>
                </div>
                {/* Investments in this round: read-only */}
                <div className="mt-2 text-sm text-ink-soft">
                  {roundInvestments.length === 0
                    ? 'No investors recorded yet.'
                    : roundInvestments
                        .map(
                          (inv) =>
                            `${inv.investor?.investorname ?? 'Unverified investor'}${inv.islead ? ' (lead)' : ''} ${formatUsd(inv.amountusd)}`,
                        )
                        .join(' · ')}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={saveRound} noValidate className="flex flex-col gap-[18px] border-t border-line pt-6">
        <h3 className="m-0 text-lg font-semibold">{editingNo ? 'Edit funding round' : 'Add a funding round'}</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[18px]">
          <label className="lbl text-[15px]">
            Round type
            <select className="fld" value={form.roundType} onChange={update('roundType')}>
              {ROUND_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <span className="hint">The kind of round, for example Seed or Series A.</span>
          </label>
          <label className="lbl text-[15px]">
            Round date
            <input className="fld" type="date" value={form.roundDate} onChange={update('roundDate')} />
            <span className="hint">When the round closed.</span>
          </label>
          <label className="lbl text-[15px]">
            Amount raised (USD)
            <input className="fld" type="number" min="1" value={form.amount} onChange={update('amount')} placeholder="900000" />
            <span className="hint">Total raised in US dollars, for example 900000.</span>
          </label>
          <label className="lbl text-[15px]">
            Valuation (USD)
            <input
              className="fld"
              type="number"
              min="1"
              value={form.valuation}
              onChange={update('valuation')}
              placeholder="Leave empty if not disclosed"
            />
            <span className="hint">Optional. The company's value after the round, in US dollars.</span>
          </label>
        </div>
        <p className="m-0 text-[13px] text-muted">
          Amounts must be positive. Investors add themselves to a round from their pitch inbox once they have invested.
        </p>
        {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-blue" disabled={busy}>
            {busy ? 'Saving...' : editingNo ? 'Save changes' : 'Add round'}
          </button>
          {editingNo && (
            <button type="button" className="btn btn-line" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
