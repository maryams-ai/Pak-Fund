// Founder: Add / Edit startup (screen 9). Layout from mockups/AddStartup.dc.html.
//
// /founder/startups/new          -> INSERT into Startup
// /founder/startups/:id/edit     -> UPDATE that Startup
//
// RLS rules this relies on (002_rls.sql):
//   INSERT "Founders can submit startups for review":
//      role is Founder, userno = the logged-in user, isApproved = false
//      -> so we send userno: user.id and isapproved: false.
//   UPDATE "Founders can update their own startups":
//      only rows where userno = the logged-in user.
//   Guard trigger protect_startup: a founder can never change
//      isApproved, the owner, or set status Acquired -> we never send those.
// Reads: City and Industry for the dropdowns, and the startup when editing.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLookups } from '../../hooks/useLookups'
import { STAGES } from '../../lib/constants'
import { friendlyError } from '../../lib/errors'
import PageHeader from '../../components/PageHeader'
import { EmptyState, ErrorBox, Loading } from '../../components/Status'

const THIS_YEAR = new Date().getFullYear()
const EMPTY_FORM = {
  startupname: '',
  tagline: '',
  description: '',
  industryno: '',
  cityno: '',
  stage: '',
  status: 'Active',
  foundedyear: '',
  teamsize: '',
  website: '',
}

// Returns { field: 'message' } for every problem; empty object = valid.
// The database checks the same rules again (CHECK constraints).
function validate(form) {
  const errors = {}
  if (!form.startupname.trim()) errors.startupname = 'Please enter the startup name.'
  if (form.tagline.length > 90) errors.tagline = `Tagline is ${form.tagline.length} characters. The limit is 90.`
  if (!form.industryno) errors.industryno = 'Please choose an industry.'
  if (!form.cityno) errors.cityno = 'Please choose a city.'
  if (!form.stage) errors.stage = 'Please choose a stage.'
  if (form.foundedyear !== '') {
    const year = Number(form.foundedyear)
    if (!Number.isInteger(year) || year < 1990 || year > THIS_YEAR) {
      errors.foundedyear = `Founded year must be between 1990 and ${THIS_YEAR}.`
    }
  }
  if (form.teamsize !== '') {
    const size = Number(form.teamsize)
    if (!Number.isInteger(size) || size < 1) errors.teamsize = 'Team size must be a whole number, 1 or more.'
  }
  return errors
}

// Turn the form into a database row ('' becomes NULL).
function toRow(form) {
  const website = form.website.trim()
  return {
    startupname: form.startupname.trim(),
    tagline: form.tagline.trim() || null,
    description: form.description.trim() || null,
    industryno: Number(form.industryno),
    cityno: Number(form.cityno),
    stage: form.stage,
    status: form.status,
    foundedyear: form.foundedyear === '' ? null : Number(form.foundedyear),
    teamsize: form.teamsize === '' ? null : Number(form.teamsize),
    // Add https:// if the founder typed just "rozgarpay.pk"
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
  }
}

export default function AddStartup() {
  const { startupNo } = useParams()
  const editId = startupNo ? Number(startupNo) : null
  const { user } = useAuth()
  const navigate = useNavigate()
  const { cities, industries, error: lookupError } = useLookups()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loadStatus, setLoadStatus] = useState(editId ? 'loading' : 'done') // 'loading' | 'error' | 'notfound' | 'done'
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Edit mode: load the startup and check that this founder owns it.
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    setLoadStatus('loading')
    supabase
      .from('startup')
      .select('userno, startupname, tagline, description, industryno, cityno, stage, status, foundedyear, teamsize, website')
      .eq('startupno', editId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          friendlyError(error, 'load this startup')
          setLoadStatus('error')
        } else if (!data || data.userno !== user.id) {
          setLoadStatus('notfound')
        } else {
          // null from the database becomes '' in the form
          const values = Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, data[key] ?? '']))
          setForm({ ...values, industryno: String(data.industryno), cityno: String(data.cityno) })
          setLoadStatus('done')
        }
      })
    return () => {
      cancelled = true
    }
  }, [editId, user.id, attempt])

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    const row = toRow(form)
    let result
    if (editId) {
      result = await supabase.from('startup').update(row).eq('startupno', editId)
    } else {
      // userno links the founder as owner; isapproved false = pending review.
      result = await supabase
        .from('startup')
        .insert({ ...row, userno: user.id, isapproved: false })
        .select('startupno')
        .single()
    }
    setSaving(false)

    if (result.error) {
      setSaveError(friendlyError(result.error, 'save your startup'))
      return
    }
    if (editId) {
      navigate('/founder/startups', { state: { flash: 'Changes saved.' } })
    } else {
      navigate(`/founder/startups/${result.data.startupno}/team`, {
        state: { flash: 'Startup saved. It is waiting for admin review. Now add your team and funding rounds.' },
      })
    }
  }

  const title = editId ? 'Edit your startup' : 'Add your startup'

  if (loadStatus !== 'done') {
    return (
      <>
        <PageHeader title={title} breadcrumb={<Link to="/founder/startups">My startups</Link>} />
        <div className="page-x pt-8">
          {loadStatus === 'loading' && <Loading text="Loading startup..." />}
          {loadStatus === 'error' && (
            <ErrorBox message="We could not load this startup right now. Please try again." onRetry={() => setAttempt((n) => n + 1)} />
          )}
          {loadStatus === 'notfound' && (
            <EmptyState
              title="This is not your startup"
              text="You can only edit startups that you added yourself."
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
        title={title}
        subtitle={
          editId
            ? 'Update the details investors see on your startup page.'
            : 'Tell investors what your startup does. An admin reviews every new listing before it becomes public.'
        }
        breadcrumb={
          <>
            <Link to="/founder/startups">My startups</Link> / {editId ? 'Edit startup' : 'Add startup'}
          </>
        }
      />

      <div className="page-x flex flex-wrap items-start gap-8 pt-8">
        {/* ---------------- Steps ---------------- */}
        <nav className="card w-full min-w-0 flex-[1_1_240px] rounded-xl p-3 lg:max-w-[270px]" aria-label="Steps">
          <Step number={1} label="Startup details" active />
          <Step number={2} label="Team members" to={editId && `/founder/startups/${editId}/team`} />
          <Step number={3} label="Funding rounds" to={editId && `/founder/startups/${editId}/team`} />
          <Step number={4} label="Pitch requests" to="/founder/pitch" />
        </nav>

        {/* ---------------- Form ---------------- */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="card flex min-w-0 flex-[999_1_560px] flex-col gap-6 rounded-xl p-6 sm:p-9"
        >
          <div>
            <h2 className="m-0 text-2xl font-bold">Startup details</h2>
            <p className="mt-1 mb-0 text-muted">The basics investors look at first. You can edit them later.</p>
          </div>

          {lookupError && <div className="alert-error">We could not load the city and industry lists. Please reload.</div>}

          <Field label="Startup name" error={errors.startupname} hint="Use the name people know you by.">
            <input className="fld" value={form.startupname} onChange={update('startupname')} placeholder="e.g. Rozgar Pay" />
          </Field>

          <Field
            label="Tagline"
            error={errors.tagline}
            hint={`Shown on startup cards. Up to 90 characters (${form.tagline.length}/90).`}
          >
            <input className="fld" value={form.tagline} onChange={update('tagline')} placeholder="One line on what you do" />
          </Field>

          <Field label="Description" hint="A few sentences: the problem you solve, your solution and who it is for.">
            <textarea
              className="fld resize-y"
              rows={5}
              value={form.description}
              onChange={update('description')}
              placeholder="What problem do you solve, and for whom?"
            />
          </Field>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
            <Field label="Industry" error={errors.industryno} hint="Pick the sector that fits best. Investors filter by it.">
              <select className="fld" value={form.industryno} onChange={update('industryno')}>
                <option value="">Select industry</option>
                {industries.map((i) => (
                  <option key={i.industryno} value={i.industryno}>
                    {i.industryname}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City" error={errors.cityno} hint="Where your team is mainly based.">
              <select className="fld" value={form.cityno} onChange={update('cityno')}>
                <option value="">Select city</option>
                {cities.map((c) => (
                  <option key={c.cityno} value={c.cityno}>
                    {c.cityname}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stage" error={errors.stage} hint="Be honest. Investors filter by stage.">
              <select className="fld" value={form.stage} onChange={update('stage')}>
                <option value="">Select stage</option>
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" hint="Active if you are operating. Choose Closed if you have shut down.">
              {/* Acquired is set only by an admin, so it is offered only if already set. */}
              <select className="fld" value={form.status} onChange={update('status')} disabled={form.status === 'Acquired'}>
                <option>Active</option>
                <option>Closed</option>
                {form.status === 'Acquired' && <option>Acquired</option>}
              </select>
            </Field>
            <Field label="Founded year" error={errors.foundedyear} hint="The year your company started.">
              <input
                className="fld"
                type="number"
                min="1990"
                max={THIS_YEAR}
                value={form.foundedyear}
                onChange={update('foundedyear')}
                placeholder="2022"
              />
            </Field>
            <Field label="Team size" error={errors.teamsize} hint="Everyone working on the startup, founders included.">
              <input className="fld" type="number" min="1" value={form.teamsize} onChange={update('teamsize')} placeholder="10" />
            </Field>
          </div>

          <Field label="Website" hint="Optional. Start with https://">
            <input className="fld" type="url" value={form.website} onChange={update('website')} placeholder="https://" />
          </Field>

          {Object.keys(errors).length > 0 && <div className="alert-error">Please fix the highlighted fields.</div>}
          {saveError && <div className="alert-error">{saveError}</div>}

          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-6">
            <Link to="/founder/startups" className="btn btn-line">
              Cancel
            </Link>
            <button type="submit" className="btn btn-blue" disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Save changes' : 'Save and add team'}
            </button>
          </div>
        </form>

        {/* ---------------- Help column ---------------- */}
        <aside className="flex w-full min-w-0 flex-[1_1_280px] flex-col gap-4 lg:max-w-[340px]">
          <div className="rounded-xl border border-[#BFDBFE] bg-primary-soft p-6">
            <h3 className="mt-0 mb-2.5 text-lg font-semibold">Next, reach investors</h3>
            <p className="m-0 text-[15px] leading-normal text-ink-soft">
              After saving, add your team and funding rounds. Once an admin approves your startup, you can pick an investor and send a pitch.
            </p>
          </div>
          <div className="card rounded-xl p-6">
            <h3 className="mt-0 mb-2.5 text-lg font-semibold">Tips</h3>
            <p className="m-0 text-[15px] leading-relaxed text-ink-soft">
              A clear tagline and honest stage help investors filter you in. An admin reviews new listings before they go
              public.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}

// A labelled form field with an optional hint and error message.
function Field({ label, error, hint, children }) {
  return (
    <label className="lbl text-[15px]">
      {label}
      {children}
      {hint && !error && <span className="text-[13px] font-normal text-muted">{hint}</span>}
      {error && <span className="text-[13px] font-medium text-danger-ink">{error}</span>}
    </label>
  )
}

// One step in the left menu. Without `to` it is shown but not clickable.
function Step({ number, label, to, active = false }) {
  const className = `block rounded-lg px-3.5 py-3 text-[15px] ${
    active ? 'bg-primary font-semibold text-white' : to ? 'font-medium text-muted' : 'font-medium text-muted'
  }`
  const text = `${number}  ${label}`
  return to && !active ? (
    <Link to={to} className={className}>
      {text}
    </Link>
  ) : (
    <div className={className}>{text}</div>
  )
}
