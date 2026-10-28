// AuthContext: one place that knows who is logged in.
//
// Any component can call useAuth() to get:
//   user     the Supabase Auth user (or null)
//   profile  their row from the profiles table (fullname, role, ...)
//   role     'Founder' | 'Investor' | 'Admin' | null
//   loading  true while we are still finding out
//   notice   a message to show on the login page (e.g. deactivated)
//   signUp, logIn, logOut
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SIGNUP_ROLES } from '../lib/constants'
import { APP_NAME } from '../config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [profile, setProfile] = useState(null)
  // The user id the last profile load finished for. While it differs
  // from the current user id, the profile is still loading.
  const [profileLoadedFor, setProfileLoadedFor] = useState(null)
  const [notice, setNotice] = useState('')

  // 1. Find the current session when the app starts, then listen for
  //    log in / log out. Supabase keeps the session in the browser.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id ?? null

  // 2. Whenever the logged-in user changes, load their profile row.
  //    (Kept outside onAuthStateChange, as Supabase recommends.)
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileLoadedFor(null)
      return
    }
    let cancelled = false

    async function loadProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('userno, fullname, email, role, phone, isactive')
        .eq('userno', userId)
        .maybeSingle()
      if (cancelled) return

      if (error || !data) {
        setNotice('We could not load your profile. Please log in again.')
        setProfile(null)
        await supabase.auth.signOut()
      } else if (!data.isactive) {
        // Admin set isActive = false. The database already blocks all
        // their writes (002_rls.sql); here we also log them out.
        setNotice(
          `Your account has been deactivated by a ${APP_NAME} admin. ` +
            'Your data is kept, but you cannot log in. Please contact the team if this is a mistake.',
        )
        setProfile(null)
        await supabase.auth.signOut()
      } else {
        setProfile(data)
      }
      setProfileLoadedFor(userId)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Sign up. The extra fields go into options.data, which Supabase saves
  // as raw_user_meta_data. The trigger handle_new_user (002_rls.sql)
  // reads exactly these keys: fullName, role, phone.
  async function signUp({ email, password, fullName, role, phone }) {
    if (!SIGNUP_ROLES.includes(role)) {
      throw new Error('Please choose Founder or Investor.')
    }
    setNotice('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { fullName, role, phone } },
    })
    if (error) throw error
    // If "Confirm email" is on in Supabase, there is no session yet.
    return { needsEmailConfirm: !data.session }
  }

  async function logIn({ email, password }) {
    setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logOut() {
    await supabase.auth.signOut()
  }

  const loading = !sessionChecked || (userId !== null && profileLoadedFor !== userId)

  const value = {
    user: profile ? session.user : null, // only "logged in" once the profile is OK
    profile,
    role: profile?.role ?? null,
    loading,
    notice,
    clearNotice: () => setNotice(''),
    signUp,
    logIn,
    logOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Shortcut so components can write: const { user, role } = useAuth()
export function useAuth() {
  return useContext(AuthContext)
}
