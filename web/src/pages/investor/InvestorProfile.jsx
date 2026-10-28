// Investor: My profile (screen 12). Layout from mockups/InvestorProfile.dc.html.
//
// First time: sign-up (handle_new_user in 002_rls.sql) creates only a
// profiles row, NOT an Investor row. So the first "Save profile"
// INSERTs the Investor row; every later save UPDATEs it.
//
// Reads:
//   Investor          my own row (RLS "Investors can read their own profile",
//                     works even before an admin verifies me)
//   InvestorIndustry  the industries I ticked
//   City, Industry    dropdown and checkboxes (hooks/useLookups.js)
// Writes:
//   INSERT Investor   RLS "Investors can create one unverified profile for
//                     themselves": role Investor, userno = me, isverified =
//                     false. UNIQUE (userNo) allows only one per user.
//   UPDATE Investor   RLS "Investors can update their own profile". We never
//                     send isverified or userno: the guard trigger
//                     protect_investor lets only an admin change those.
//   INSERT / DELETE InvestorIndustry
//                     RLS "Investors can manage their own industries"
//                     (investorno = my_investor_no()).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLookups } from '../../hooks/useLookups'
import { INVESTOR_TYPES } from '../../lib/constants'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { ErrorBox, Loading, WelcomeBox } from '../../components/Status'

const EMPTY_FORM = {
  investorname: '',
  investortype: 'Angel',
  cityno: '',
  minticketusd: '',
  maxticketusd: '',
  bio: '',
  website: '',
  linkedinurl: '',
}

async function loadMyInvestor(userId) {
  // maybeSingle: returns null (not an error) when there is no row yet.
  const investor = await supabase
    .from('investor')
    .select('investorno, investorname, investortype, cityno, minticketusd, maxticketusd, bio, website, linkedinurl, isverified')
    .eq('userno', userId)
    .maybeSingle()
  if (investor.error) throw investor.error
  if (!investor.data) return { investor: null, industryNos: [] }

  const industries = await supabase
    .from('investorindustry')
    .select('industryno')
    .eq('investorno', investor.data.investorno)
  if (industries.error) throw industries.error

  return { investor: investor.data, industryNos: industries.data.map((row) => row.industryno) }
}

// Empty text box -> NULL in the database.
function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

export default function InvestorProfile() {
  const { user, profile } = useAuth()
  const { cities, industries, error: lookupError } = useLookups()

  const [investor, setInvestor] = useState(null) // my Investor row, or null = first time
  const [savedIndustries, setSavedIndustries] = useState([]) // industryno list in the database
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const [form, setForm] = useState(EMPTY_FORM)
  const [picked, setPicked] = useState([]) // industryno list ticked on screen
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'error' | 'info', text }

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadMyInvestor(user.id)
      .then((result) => {
        if (cancelled) return
        setInvestor(result.investor)
        setSavedIndustries(result.industryNos)
        setPicked(result.industryNos)
        if (result.investor) {
          // Copy the row into the form. NULL becomes '' for the inputs.
          const row = result.investor
          setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, row[key] ?? ''])))
        } else {
          // First time: start with the name from sign-up.
          setForm({ ...EMPTY_FORM, investorname: profile.fullname })
        }
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load your profile'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [user.id, profile.fullname, attempt])

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  function toggleIndustry(industryNo) {
    setPicked((current) =>
      current.includes(industryNo) ? current.filter((n) => n !== industryNo) : [...current, industryNo],
    )
  }

  async function save(event) {
    event.preventDefault()
    setMessage(null)

    // Same rules as the CHECK constraints on Investor (001_schema.sql),
    // checked here first so the user gets a clear message.
    const min = form.minticketusd === '' ? null : Number(form.minticketusd)
    const max = form.maxticketusd === '' ? null : Number(form.maxticketusd)
    if (!form.investorname.trim()) {
      setMessage({ type: 'error', text: 'Please enter your name or your firm name.' })
      return
    }
    if ((min !== null && !(min > 0)) || (max !== null && !(max > 0))) {
      setMessage({ type: 'error', text: 'Ticket sizes must be positive amounts in USD.' })
      return
    }
    if (min !== null && max !== null && max < min) {
      setMessage({ type: 'error', text: 'The maximum ticket must be the same as or bigger than the minimum.' })
      return
    }

    const row = {
      investorname: form.investorname.trim(),
      investortype: form.investortype,
      cityno: form.cityno === '' ? null : Number(form.cityno),
      minticketusd: min,
      maxticketusd: max,
      bio: textOrNull(form.bio),
      website: textOrNull(form.website),
      linkedinurl: textOrNull(form.linkedinurl),
    }

    setSaving(true)
    try {
      // 1. Save the Investor row (insert the first time, update after).
      let investorNo = investor?.investorno
      if (investor) {
        const { error: updateError } = await supabase.from('investor').update(row).eq('investorno', investorNo)
        if (updateError) throw updateError
      } else {
        // isverified is not sent: the column default is false, which is
        // exactly what the RLS insert policy demands.
        const { data, error: insertError } = await supabase
          .from('investor')
          .insert({ ...row, userno: user.id })
          .select('investorno, isverified')
          .single()
        if (insertError) throw insertError
        investorNo = data.investorno
        setInvestor({ ...row, investorno: data.investorno, isverified: data.isverified })
      }

      // 2. Industries: add the newly ticked ones, delete the unticked ones.
      const toAdd = picked.filter((n) => !savedIndustries.includes(n))
      const toRemove = savedIndustries.filter((n) => !picked.includes(n))
      if (toAdd.length > 0) {
        const { error: addError } = await supabase
          .from('investorindustry')
          .insert(toAdd.map((industryNo) => ({ investorno: investorNo, industryno: industryNo })))
        if (addError) throw addError
      }
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('investorindustry')
          .delete()
          .eq('investorno', investorNo)
          .in('industryno', toRemove)
        if (removeError) throw removeError
      }
      setSavedIndustries(picked)
      if (investor) setInvestor({ ...investor, ...row })

      setMessage({
        type: 'info',
        text: investor ? 'Profile saved.' : 'Profile created. An admin will review it before it appears in the directory.',
      })
    } catch (err) {
      setMessage({ type: 'error', text: friendlyError(err, 'save your profile') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="My investor profile"
        subtitle="This is your public page for founders. Describe what you back so the right startups can find you and send you pitches."
      />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading your profile..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}

        {status === 'done' && (
          <div className="mb-6">
            <WelcomeBox
              title={investor ? 'Your next steps' : 'Welcome! Here is how to get started'}
              text={
                investor
                  ? 'Your profile is saved. Here is what happens next.'
                  : 'Set up your investor profile in a few minutes. Founders can only pitch you after it is verified.'
              }
              steps={[
                investor ? 'Profile created. You can edit it any time.' : 'Create your profile using the form below.',
                'Wait for an admin to verify it. Verified profiles appear in the investor directory.',
                'Receive pitches in your pitch inbox, then accept or decline them.',
              ]}
            />
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-wrap items-start gap-6">
            {/* ---------------- Profile form ---------------- */}
            <form onSubmit={save} noValidate className="card flex min-w-0 flex-[999_1_560px] flex-col gap-6 p-6 sm:p-8">
              <div>
                <h2 className="m-0 text-2xl font-bold">Profile details</h2>
                <p className="mt-1 mb-0 text-muted">This is what founders see on your public page.</p>
              </div>

              {lookupError && <div className="alert-error">Cities and industries could not be loaded. Please reload.</div>}

              <label className="lbl text-[15px]">
                Investor or firm name
                <input className="fld" value={form.investorname} onChange={update('investorname')} placeholder="Ravi Ventures" />
                <span className="hint">The name founders will see. Use your firm name if you invest through one.</span>
              </label>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-5">
                <label className="lbl text-[15px]">
                  Type
                  <select className="fld" value={form.investortype} onChange={update('investortype')}>
                    {INVESTOR_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <span className="hint">Choose the option that best describes you.</span>
                </label>
                <label className="lbl text-[15px]">
                  City
                  <select className="fld" value={form.cityno} onChange={update('cityno')}>
                    <option value="">Not set</option>
                    {cities.map((city) => (
                      <option key={city.cityno} value={city.cityno}>
                        {city.cityname}
                      </option>
                    ))}
                  </select>
                  <span className="hint">Where you are based.</span>
                </label>
                <label className="lbl text-[15px]">
                  Minimum ticket (USD)
                  <input className="fld" type="number" min="1" value={form.minticketusd} onChange={update('minticketusd')} placeholder="25000" />
                  <span className="hint">The smallest investment you usually make, in US dollars.</span>
                </label>
                <label className="lbl text-[15px]">
                  Maximum ticket (USD)
                  <input className="fld" type="number" min="1" value={form.maxticketusd} onChange={update('maxticketusd')} placeholder="500000" />
                  <span className="hint">The largest investment you usually make, in US dollars.</span>
                </label>
              </div>

              <label className="lbl text-[15px]">
                About you
                <textarea
                  className="fld resize-y"
                  rows={5}
                  value={form.bio}
                  onChange={update('bio')}
                  placeholder="What do you invest in, and how do you help founders?"
                />
                <span className="hint">Two or three sentences: the sectors and stages you like, and how you help founders.</span>
              </label>

              <fieldset className="lbl m-0 border-0 p-0 text-[15px]">
                <legend className="mb-1 p-0">Industries you back</legend>
                <p className="hint mt-0 mb-2">Tick every sector you invest in. Founders can filter investors by these.</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
                  {industries.map((industry) => (
                    <label
                      key={industry.industryno}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line-strong bg-white px-3.5 py-3 text-base font-medium"
                    >
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] accent-brand"
                        checked={picked.includes(industry.industryno)}
                        onChange={() => toggleIndustry(industry.industryno)}
                      />
                      {industry.industryname}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-5">
                <label className="lbl text-[15px]">
                  Website
                  <input className="fld" type="url" value={form.website} onChange={update('website')} placeholder="https://" />
                  <span className="hint">Optional. Start with https://</span>
                </label>
                <label className="lbl text-[15px]">
                  LinkedIn
                  <input className="fld" value={form.linkedinurl} onChange={update('linkedinurl')} placeholder="linkedin.com/in/..." />
                  <span className="hint">Optional. A link to your LinkedIn profile.</span>
                </label>
              </div>

              {message && <div className={message.type === 'error' ? 'alert-error' : 'alert-info'}>{message.text}</div>}

              <div className="flex flex-wrap justify-end gap-4 border-t border-line pt-6">
                {/* The public page (v_investor_summary) shows verified investors only. */}
                {investor?.isverified && (
                  <Link to={`/investors/${investor.investorno}`} className="btn btn-line">
                    Preview public page
                  </Link>
                )}
                <button type="submit" className="btn btn-blue" disabled={saving}>
                  {saving ? 'Saving...' : investor ? 'Save profile' : 'Create profile'}
                </button>
              </div>
            </form>

            {/* ---------------- Side column ---------------- */}
            <aside className="flex w-full max-w-[380px] min-w-0 flex-[1_1_300px] flex-col gap-5">
              <VerificationBox investor={investor} />
              <div className="card p-[26px]">
                <h3 className="mt-0 mb-2.5 text-lg font-semibold">What founders see</h3>
                <p className="m-0 text-[15px] leading-relaxed text-ink-soft">
                  Your name, type, city, ticket range, industries and portfolio. Your email is never shown. Founders
                  contact you through a pitch request.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  )
}

// Green box once an admin has verified, amber box while waiting.
function VerificationBox({ investor }) {
  if (investor?.isverified) {
    return (
      <div className="rounded-[14px] border border-[#6EE7B7] bg-success-soft p-[26px]">
        <div className="text-[13px] font-bold tracking-widest text-success-ink">VERIFICATION</div>
        <div className="my-3">
          <StatusChip status="Verified" />
        </div>
        <p className="m-0 text-[15px] leading-relaxed text-success-ink">
          Your profile is in the public directory and founders can send you pitches.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-[14px] border border-[#FCD34D] bg-warning-soft p-[26px]">
      <div className="text-[13px] font-bold tracking-widest text-warning-ink">VERIFICATION</div>
      <div className="my-3">
        {investor ? <StatusChip status="Pending" /> : <span className="chip chip-plain">Profile not created yet</span>}
      </div>
      <p className="m-0 text-[15px] leading-relaxed text-warning-ink">
        An admin checks new investor profiles. Only verified investors show in the public directory and can receive
        pitches.
      </p>
    </div>
  )
}
