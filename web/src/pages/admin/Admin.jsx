// Admin panel (screen 15). Layout from mockups/Admin.dc.html.
//
// Only an Admin can open this page (ProtectedRoute in App.jsx), but the
// real protection is in the database: every write below is allowed only
// by an "Admin can manage ..." RLS policy in 002_rls.sql, which calls
// is_admin(). A Founder or Investor who sent the same request would be
// refused (or change 0 rows).
//
// Reads:
//   Investor (+ City, profiles)   investors with isverified = false
//   Startup (+ City, Industry, profiles)  startups with isapproved = false
//   v_funding_by_city, v_funding_by_industry   lists with startup counts
//   Startup, Acquisition          startups that can still be acquired
//   profiles                      all users
// Writes (policy that allows it):
//   Verify        UPDATE Investor.isverified = true   "Admin can manage investors"
//   Reject        DELETE Investor                     "Admin can manage investors"
//   Approve       UPDATE Startup.isapproved = true    "Admin can manage startups"
//   Remove        DELETE Startup (rounds, team, pitches... cascade)  same policy
//   Add city      INSERT City                         "Admin can manage cities"
//   Add industry  INSERT Industry                     "Admin can manage industries"
//   Acquisition   rpc record_acquisition() (005): INSERT Acquisition and
//                 UPDATE Startup.status = 'Acquired' in ONE transaction.
//                 The function checks is_admin() itself (security definer).
//   Deactivate    UPDATE profiles.isactive = false    "Admin can manage profiles"
// The guard triggers (protect_investor, protect_startup, protect_profiles)
// let these admin-only columns change because is_admin() is true.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatTicket } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { ErrorBox, Loading, WelcomeBox } from '../../components/Status'

async function loadAdmin() {
  const results = await Promise.all([
    supabase
      .from('investor')
      .select('investorno, investorname, investortype, minticketusd, maxticketusd, city ( cityname ), profiles ( fullname, email )')
      .eq('isverified', false)
      .order('investorno'),
    supabase
      .from('startup')
      .select('startupno, startupname, city ( cityname ), industry ( industryname ), profiles ( fullname )')
      .eq('isapproved', false)
      .order('startupno'),
    supabase.from('v_funding_by_city').select('cityno, cityname, province, startupcount').order('cityname'),
    supabase.from('v_funding_by_industry').select('industryno, industryname, startupcount').order('industryname'),
    supabase.from('startup').select('startupno, startupname').eq('isapproved', true).neq('status', 'Acquired').order('startupname'),
    supabase.from('acquisition').select('startupno'),
    supabase.from('profiles').select('userno, fullname, email, role, isactive').order('createdat', { ascending: false }),
  ])
  const failed = results.find((result) => result.error)
  if (failed) throw failed.error

  const [investors, startups, cities, industries, liveStartups, acquisitions, users] = results.map((r) => r.data)
  // A startup can be acquired only once (UNIQUE startupNo on Acquisition).
  const acquired = new Set(acquisitions.map((a) => a.startupno))
  return {
    investors,
    startups,
    cities,
    industries,
    canBeAcquired: liveStartups.filter((s) => !acquired.has(s.startupno)),
    users,
  }
}

// Runs an UPDATE or DELETE and checks that a row really changed. When RLS
// refuses a row, Postgres changes 0 rows WITHOUT an error, so we turn that
// into the same "not allowed" error code (42501) that friendlyError knows.
async function mustChange(query) {
  const { data, error } = await query.select()
  if (error) throw error
  if (data.length === 0) throw { code: '42501', message: 'No row was changed (RLS or row already gone).' }
}

export default function Admin() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadAdmin()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load the admin panel'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // After every change we load the lists again (they are small).
  const reload = () => setAttempt((n) => n + 1)

  return (
    <>
      <PageHeader title="Admin panel" subtitle="Keep the platform trustworthy: verify investors, review new startups, manage the city and industry lists and look after user accounts." />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading the admin panel..." />}
        {status === 'error' && (
          <ErrorBox
            message={error}
            onRetry={() => {
              setStatus('loading')
              reload()
            }}
          />
        )}

        {status === 'done' && (
          <div className="flex flex-col gap-6">
            <WelcomeBox
              title="Welcome, admin. Here is what each section does"
              text="Work from top to bottom. Items waiting for you appear first."
              steps={[
                'Investors: verify real investor profiles so they appear in the public directory.',
                'Startups: approve genuine listings and remove fake or duplicate ones.',
                'Cities and industries: keep the lists founders and investors choose from tidy.',
                'Acquisitions and users: record a startup sale, or deactivate an account.',
              ]}
            />
            <div className="flex flex-wrap items-start gap-6">
              <InvestorReview investors={data.investors} onChanged={reload} />
              <StartupReview startups={data.startups} onChanged={reload} />
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <CityList cities={data.cities} onChanged={reload} />
              <IndustryList industries={data.industries} onChanged={reload} />
              <RecordAcquisition startups={data.canBeAcquired} onChanged={reload} />
            </div>
            <UserList users={data.users} onChanged={reload} />
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------

function Section({ title, subtitle, className = 'flex-[1_1_480px]', children }) {
  return (
    <section className={`card min-w-0 p-6 sm:p-7 ${className}`}>
      <h2 className="mt-0 mb-1 text-xl font-bold">{title}</h2>
      {subtitle && <p className="mt-0 mb-3.5 text-sm text-muted">{subtitle}</p>}
      {children}
    </section>
  )
}

// One line in a list: text on the left, buttons on the right.
function Row({ children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3.5 text-[15px]">
      {children}
    </div>
  )
}

function Message({ message }) {
  if (!message) return null
  return <div className={`mb-3 ${message.type === 'error' ? 'alert-error' : 'alert-info'}`}>{message.text}</div>
}

function NothingHere({ text }) {
  return <p className="m-0 border-t border-line py-4 text-[15px] text-muted">{text}</p>
}

// Wraps one button action: shows "busy", catches errors, shows a message.
// Each section calls useAction() once and gets { busy, message, act }.
function useAction(onChanged) {
  const [busy, setBusy] = useState(null) // which button is working
  const [message, setMessage] = useState(null)

  async function act(key, action, doneText, failText) {
    setMessage(null)
    setBusy(key)
    try {
      await action()
      setMessage({ type: 'info', text: doneText })
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: typeof failText === 'function' ? failText(err) : friendlyError(err, failText) })
    } finally {
      setBusy(null)
    }
  }

  return { busy, message, act }
}

// ---------------------------------------------------------------------
// Investors waiting for verification
// ---------------------------------------------------------------------
function InvestorReview({ investors, onChanged }) {
  const { busy, message, act } = useAction(onChanged)

  function verify(investor) {
    act(
      `v${investor.investorno}`,
      () => mustChange(supabase.from('investor').update({ isverified: true }).eq('investorno', investor.investorno)),
      `${investor.investorname} is verified and now shows in the public directory.`,
      'verify this investor',
    )
  }

  function reject(investor) {
    // There is no "rejected" column, so Reject deletes the unverified
    // profile. The user can then create a corrected one.
    if (!window.confirm(`Reject and delete the profile "${investor.investorname}"? The user can submit a new one.`)) return
    act(
      `r${investor.investorno}`,
      () => mustChange(supabase.from('investor').delete().eq('investorno', investor.investorno)),
      `${investor.investorname} was rejected and the profile removed.`,
      // 23503: Investment -> Investor is ON DELETE RESTRICT.
      (err) =>
        err.code === '23503'
          ? 'This profile already has recorded investments, so it cannot be deleted.'
          : friendlyError(err, 'reject this investor'),
    )
  }

  return (
    <Section title="Investors waiting for verification" subtitle="New investor profiles wait here. Verify real investors so founders can find them and send pitches. Reject profiles that look fake.">
      <Message message={message} />
      {investors.length === 0 && <NothingHere text="No investors are waiting. Everyone is verified." />}
      {investors.map((investor) => (
        <Row key={investor.investorno}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {investor.investorname} <StatusChip status="Pending" />
            </div>
            <div className="text-[13px] text-muted">
              {[
                investor.investortype,
                investor.city?.cityname,
                formatTicket(investor.minticketusd, investor.maxticketusd),
                investor.profiles?.email,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div className="flex gap-2.5">
            <button type="button" className="btn btn-sm btn-line" disabled={busy !== null} onClick={() => reject(investor)}>
              Reject
            </button>
            <button type="button" className="btn btn-sm btn-blue" disabled={busy !== null} onClick={() => verify(investor)}>
              {busy === `v${investor.investorno}` ? 'Saving...' : 'Verify'}
            </button>
          </div>
        </Row>
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------------
// Startups to review
// ---------------------------------------------------------------------
function StartupReview({ startups, onChanged }) {
  const { busy, message, act } = useAction(onChanged)

  function approve(startup) {
    act(
      `a${startup.startupno}`,
      () => mustChange(supabase.from('startup').update({ isapproved: true }).eq('startupno', startup.startupno)),
      `${startup.startupname} is approved and now public.`,
      'approve this startup',
    )
  }

  function remove(startup) {
    if (!window.confirm(`Remove "${startup.startupname}"? Its team, rounds and pitches are deleted too.`)) return
    act(
      `d${startup.startupno}`,
      () => mustChange(supabase.from('startup').delete().eq('startupno', startup.startupno)),
      `${startup.startupname} was removed.`,
      'remove this startup',
    )
  }

  return (
    <Section title="Startups to review" subtitle="New startups wait here. Approve genuine listings to make them public, and remove fake or duplicate ones.">
      <Message message={message} />
      {startups.length === 0 && <NothingHere text="No startups waiting for review." />}
      {startups.map((startup) => (
        <Row key={startup.startupno}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {startup.startupname} <StatusChip status="Pending" />
            </div>
            <div className="text-[13px] text-muted">
              {[
                startup.industry?.industryname,
                startup.city?.cityname,
                startup.profiles ? `submitted by ${startup.profiles.fullname}` : 'added by admin',
              ].join(' · ')}
            </div>
          </div>
          <div className="flex gap-2.5">
            <button type="button" className="btn btn-sm btn-red" disabled={busy !== null} onClick={() => remove(startup)}>
              Remove
            </button>
            <button type="button" className="btn btn-sm btn-blue" disabled={busy !== null} onClick={() => approve(startup)}>
              {busy === `a${startup.startupno}` ? 'Saving...' : 'Approve'}
            </button>
          </div>
        </Row>
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------------
// Cities and Industries (lookup tables)
// The number on the right is approved startups, from the dashboard views.
// ---------------------------------------------------------------------
function CityList({ cities, onChanged }) {
  const { busy, message, act } = useAction(onChanged)
  const [form, setForm] = useState({ cityname: '', province: '' })

  function add(event) {
    event.preventDefault()
    const cityname = form.cityname.trim()
    if (!cityname) return
    act(
      'add',
      async () => {
        const { error } = await supabase.from('city').insert({ cityname, province: form.province.trim() || null })
        if (error) throw error
        setForm({ cityname: '', province: '' })
      },
      `${cityname} was added.`,
      'add this city',
    )
  }

  return (
    <Section
      title="Cities"
      subtitle="The cities people can choose. The number shows how many approved startups are in each."
      className="flex-[1_1_320px]"
    >
      <form onSubmit={add} className="mb-3 flex flex-col gap-3">
        <label className="lbl text-sm">
          City name
          <input className="fld" value={form.cityname} onChange={(e) => setForm({ ...form, cityname: e.target.value })} placeholder="Sialkot" />
          <span className="hint">The city name as people write it.</span>
        </label>
        <label className="lbl text-sm">
          Province
          <input className="fld" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Punjab" />
          <span className="hint">Optional.</span>
        </label>
        <button type="submit" className="btn btn-sm btn-blue self-start" disabled={busy !== null || !form.cityname.trim()}>
          {busy ? 'Adding...' : 'Add city'}
        </button>
      </form>
      <Message message={message} />
      {cities.length === 0 && <NothingHere text="No cities yet." />}
      {cities.map((city) => (
        <Row key={city.cityno}>
          <span>{[city.cityname, city.province].filter(Boolean).join(' · ')}</span>
          <span className="text-muted">
            {city.startupcount} {city.startupcount === 1 ? 'startup' : 'startups'}
          </span>
        </Row>
      ))}
    </Section>
  )
}

function IndustryList({ industries, onChanged }) {
  const { busy, message, act } = useAction(onChanged)
  const [form, setForm] = useState({ industryname: '', description: '' })

  function add(event) {
    event.preventDefault()
    const industryname = form.industryname.trim()
    if (!industryname) return
    act(
      'add',
      async () => {
        const { error } = await supabase
          .from('industry')
          .insert({ industryname, description: form.description.trim() || null })
        if (error) throw error
        setForm({ industryname: '', description: '' })
      },
      `${industryname} was added.`,
      'add this industry',
    )
  }

  return (
    <Section
      title="Industries"
      subtitle="The industries people can choose. The number shows how many approved startups are in each."
      className="flex-[1_1_320px]"
    >
      <form onSubmit={add} className="mb-3 flex flex-col gap-3">
        <label className="lbl text-sm">
          Industry name
          <input
            className="fld"
            value={form.industryname}
            onChange={(e) => setForm({ ...form, industryname: e.target.value })}
            placeholder="GovTech"
          />
          <span className="hint">A short, clear name investors will recognise.</span>
        </label>
        <label className="lbl text-sm">
          Description
          <input
            className="fld"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="One short line"
          />
          <span className="hint">Optional. One line explaining the industry.</span>
        </label>
        <button type="submit" className="btn btn-sm btn-blue self-start" disabled={busy !== null || !form.industryname.trim()}>
          {busy ? 'Adding...' : 'Add industry'}
        </button>
      </form>
      <Message message={message} />
      {industries.length === 0 && <NothingHere text="No industries yet." />}
      {industries.map((industry) => (
        <Row key={industry.industryno}>
          <span>{industry.industryname}</span>
          <span className="text-muted">
            {industry.startupcount} {industry.startupcount === 1 ? 'startup' : 'startups'}
          </span>
        </Row>
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------------
// Record an acquisition
// Calls the database function record_acquisition(), which does both
// writes (INSERT Acquisition + set Startup.status = 'Acquired') in one
// transaction, so the data can never be left half saved.
// ---------------------------------------------------------------------
const EMPTY_ACQUISITION = { startupno: '', acquirername: '', acquisitiondate: '', price: '' }

function RecordAcquisition({ startups, onChanged }) {
  const [form, setForm] = useState(EMPTY_ACQUISITION)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  async function save(event) {
    event.preventDefault()
    setMessage(null)
    const price = form.price === '' ? null : Number(form.price)

    if (!form.startupno || !form.acquirername.trim() || !form.acquisitiondate) {
      setMessage({ type: 'error', text: 'Please choose a startup and enter the acquirer and the date.' })
      return
    }
    if (price !== null && !(price > 0)) {
      setMessage({ type: 'error', text: 'The price must be a positive amount, or leave it empty if undisclosed.' })
      return
    }

    const startupNo = Number(form.startupno)
    const name = startups.find((s) => s.startupno === startupNo)?.startupname ?? 'The startup'
    setSaving(true)

    // One call = one transaction: the function inserts the Acquisition
    // AND sets the status, or does nothing at all (005_record_acquisition.sql).
    const { error } = await supabase.rpc('record_acquisition', {
      p_startupno: startupNo,
      p_acquirername: form.acquirername.trim(),
      p_acquisitiondate: form.acquisitiondate,
      p_priceusd: price,
    })
    setSaving(false)

    if (error) {
      // 42501 = not an admin, 23505 = already acquired, 23514 = bad amount.
      setMessage({ type: 'error', text: friendlyError(error, 'save this acquisition') })
      return
    }

    setMessage({ type: 'info', text: `${name} is now marked as Acquired by ${form.acquirername.trim()}.` })
    setForm(EMPTY_ACQUISITION)
    onChanged()
  }

  return (
    <Section title="Record an acquisition" subtitle="Use this when a startup has been bought. It marks the startup as Acquired. Each startup can be acquired once." className="flex-[1_1_320px]">
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        <label className="lbl text-sm">
          Startup
          <select className="fld" value={form.startupno} onChange={update('startupno')}>
            <option value="">{startups.length === 0 ? 'No startups to choose' : 'Choose a startup'}</option>
            {startups.map((startup) => (
              <option key={startup.startupno} value={startup.startupno}>
                {startup.startupname}
              </option>
            ))}
          </select>
          <span className="hint">Only startups that have not been acquired are listed.</span>
        </label>
        <label className="lbl text-sm">
          Acquirer
          <input className="fld" value={form.acquirername} onChange={update('acquirername')} placeholder="Company name" />
          <span className="hint">The company that bought the startup.</span>
        </label>
        <label className="lbl text-sm">
          Date
          <input className="fld" type="date" value={form.acquisitiondate} onChange={update('acquisitiondate')} />
          <span className="hint">When the deal was completed.</span>
        </label>
        <label className="lbl text-sm">
          Price (USD)
          <input className="fld" type="number" min="1" value={form.price} onChange={update('price')} placeholder="2500000" />
          <span className="hint">Optional. Leave empty if the price was not disclosed.</span>
        </label>
        {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}
        <button type="submit" className="btn btn-sm btn-blue self-start" disabled={saving}>
          {saving ? 'Saving...' : 'Save acquisition'}
        </button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------------
// Users: deactivate (and switch back on, in case of a mistake)
// ---------------------------------------------------------------------
function UserList({ users, onChanged }) {
  const { user: me } = useAuth()
  const { busy, message, act } = useAction(onChanged)

  function setActive(person, isActive) {
    if (!isActive && !window.confirm(`Deactivate ${person.fullname}? They will not be able to log in.`)) return
    act(
      person.userno,
      () => mustChange(supabase.from('profiles').update({ isactive: isActive }).eq('userno', person.userno)),
      isActive ? `${person.fullname} can log in again.` : `${person.fullname} was deactivated. Their data stays.`,
      'change this user',
    )
  }

  return (
    <Section title="Users" subtitle="Everyone with an account. Deactivate an account to stop that person logging in. Their data is kept, and you can reactivate them later." className="">
      <Message message={message} />
      {users.length === 0 && <NothingHere text="No users yet." />}
      {users.map((person) => (
        <Row key={person.userno}>
          <div className="min-w-0">
            <div className="text-base font-semibold">
              {person.fullname}
              {!person.isactive && (
                <span className="ml-2 align-middle">
                  <StatusChip status="Deactivated" />
                </span>
              )}
            </div>
            <div className="text-[13px] break-all text-muted">
              {person.email} · {person.role}
            </div>
          </div>
          {/* An admin cannot lock themselves out. */}
          {person.userno === me.id ? (
            <span className="text-sm text-muted">This is you</span>
          ) : person.isactive ? (
            <button type="button" className="btn btn-sm btn-red" disabled={busy !== null} onClick={() => setActive(person, false)}>
              {busy === person.userno ? 'Saving...' : 'Deactivate'}
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-line" disabled={busy !== null} onClick={() => setActive(person, true)}>
              {busy === person.userno ? 'Saving...' : 'Reactivate'}
            </button>
          )}
        </Row>
      ))}
    </Section>
  )
}
