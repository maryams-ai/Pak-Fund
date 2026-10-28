// Sign up / Log in (screen 6). Split screen: story on the left, form on the right.
//
// Sign up sends fullName, role and phone to Supabase Auth. The trigger
// handle_new_user then creates the profiles row. Only Founder or
// Investor can be picked; Admin is made by hand in the SQL editor.
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { APP_NAME } from '../config'
import { HOME_BY_ROLE, SIGNUP_ROLES } from '../lib/constants'

const ROLE_TEXT = {
  Founder: 'I want to list my startup and pitch to investors',
  Investor: 'I want to discover startups and review pitches',
}

// Turn Supabase error messages into plain words.
function friendlyError(message) {
  if (/invalid login credentials/i.test(message)) return 'Email or password is wrong.'
  if (/already registered/i.test(message)) return 'An account with this email already exists. Please log in.'
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first (check your inbox).'
  if (/database error saving new user/i.test(message)) return 'Sign-up failed. Please choose Founder or Investor and try again.'
  if (/password should be/i.test(message)) return 'Please choose a longer, stronger password.'
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the server. Please check your internet connection.'
  console.error('Auth error:', message) // details for debugging (F12)
  return 'Something went wrong. Please try again in a moment.'
}

export default function Login() {
  const { user, role, loading, notice, clearNotice, signUp, logIn } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const mode = searchParams.get('mode') === 'login' ? 'login' : 'signup'
  const isSignup = mode === 'signup'

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', role: 'Founder' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Once logged in (and the profile is loaded), go to the page the user
  // wanted, or to the home page of their role.
  useEffect(() => {
    if (!loading && user) {
      navigate(location.state?.from ?? HOME_BY_ROLE[role] ?? '/', { replace: true })
    }
  }, [loading, user, role, navigate, location.state])

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  function switchMode(newMode) {
    setError('')
    setInfo('')
    clearNotice()
    setSearchParams(newMode === 'login' ? { mode: 'login' } : {}, { replace: true, state: location.state })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (isSignup) {
        const { needsEmailConfirm } = await signUp({
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          phone: form.phone.trim(),
        })
        if (needsEmailConfirm) {
          switchMode('login')
          setInfo('Account created. Please confirm your email, then log in.')
        }
      } else {
        await logIn({ email: form.email.trim(), password: form.password })
      }
      // On success the useEffect above moves to the next page.
    } catch (err) {
      setError(friendlyError(err.message))
    } finally {
      setBusy(false)
    }
  }

  const tabClass = (active) =>
    `flex-1 min-h-11 rounded-lg font-semibold cursor-pointer ${
      active ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-muted hover:text-ink'
    }`

  return (
    <div className="flex min-h-screen flex-wrap">
      {/* Left: navy story panel */}
      <div className="flex flex-[1_1_420px] flex-col justify-between gap-10 on-dark bg-dark p-8 text-white sm:p-16">
        <Link to="/" className="text-[26px] font-extrabold tracking-tight">
          {APP_NAME}
        </Link>
        <div>
          <h1 className="m-0 max-w-xl text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Every big idea starts somewhere.
          </h1>
          <p className="mt-6 mb-0 max-w-lg text-lg leading-relaxed text-muted-dark">
            Share your story, and find investors who believe in it. From Lahore to Karachi, Islamabad to Peshawar,
            great startups can come from anywhere.
          </p>
        </div>
        <div className="text-muted-dark">Whether you are a founder or an investor, one account is all you need.</div>
      </div>

      {/* Right: the form */}
      <div className="flex flex-[1_1_480px] items-center justify-center bg-background p-4 py-10 sm:p-12">
        <form onSubmit={handleSubmit} className="card flex w-full max-w-md flex-col gap-5 p-6 sm:p-9">
          <div className="flex gap-1 rounded-[10px] bg-background p-1">
            <button type="button" className={tabClass(isSignup)} onClick={() => switchMode('signup')}>
              Sign up
            </button>
            <button type="button" className={tabClass(!isSignup)} onClick={() => switchMode('login')}>
              Log in
            </button>
          </div>

          <div>
            <h2 className="m-0 text-2xl font-semibold">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="mt-1 mb-0 text-muted">
              {isSignup ? 'It is free and takes about a minute. Choose the role that fits you.' : 'Log in to continue where you left off.'}
            </p>
          </div>

          {notice && <div className="alert-error">{notice}</div>}
          {info && <div className="alert-info">{info}</div>}

          {isSignup && (
            <>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 text-sm font-semibold">I am joining as</legend>
                <div className="grid grid-cols-2 gap-3">
                  {SIGNUP_ROLES.map((option) => {
                    const selected = form.role === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setForm({ ...form, role: option })}
                        className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-4 text-left ${
                          selected ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-line-strong'
                        }`}
                      >
                        <b>{option}</b>
                        <span className="text-sm text-muted">{ROLE_TEXT[option]}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <label className="lbl">
                Full name
                <input className="fld" required value={form.fullName} onChange={update('fullName')} placeholder="Ayesha Khan" />
                <span className="hint">Shown on your profile and on pitches you send.</span>
              </label>
              <label className="lbl">
                Phone (optional)
                <input className="fld" type="tel" value={form.phone} onChange={update('phone')} placeholder="03XX XXXXXXX" />
              </label>
            </>
          )}

          <label className="lbl">
            Email
            <input
              className="fld"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
            />
          </label>
          <label className="lbl">
            Password
            <input
              className="fld"
              type="password"
              required
              minLength={8}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={update('password')}
              placeholder="At least 8 characters"
            />
            {isSignup && <span className="hint">Use at least 8 characters.</span>}
          </label>

          {error && <div className="alert-error">{error}</div>}

          <button type="submit" className="btn btn-blue" disabled={busy}>
            {busy ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>

          <p className="m-0 text-sm text-muted">
            {isSignup ? 'Already have an account? ' : 'New to ' + APP_NAME + '? '}
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-primary hover:underline"
              onClick={() => switchMode(isSignup ? 'login' : 'signup')}
            >
              {isSignup ? 'Log in' : 'Create a free account'}
            </button>
          </p>
          <p className="m-0 text-[13px] text-muted">
            Your password is stored securely and is never shown to anyone, including {APP_NAME} staff.
          </p>
        </form>
      </div>
    </div>
  )
}
