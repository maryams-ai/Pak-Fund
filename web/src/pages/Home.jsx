// Home (screen 1).
//
// Data:
//   Latest funding    -> view v_round_feed, newest 4 rounds
//   Featured startups -> view v_startup_directory, 4 most funded
//   Filter dropdowns  -> tables city, industry (useLookups)
// The search form does not query here; it opens the Startup list with
// the filters in the URL (/startups?q=pay&city=1), and the list loads.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLookups } from '../hooks/useLookups'
import { FUNDING_RANGES, STAGES } from '../lib/constants'
import { formatDate, formatUsd } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { APP_NAME } from '../config'
import StartupCard from '../components/StartupCard'
import { Features, HowItWorks, JoinBanner } from '../components/InfoSections'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

// Loads one small list from a view. Returns { rows, status, error, retry }.
// status is 'loading', 'error' or 'done'.
function useViewRows(buildQuery) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    buildQuery().then(({ data, error: queryError }) => {
      if (cancelled) return
      if (queryError) {
        setError(friendlyError(queryError, 'load this section'))
        setStatus('error')
      } else {
        setRows(data)
        setStatus('done')
      }
    })
    return () => {
      cancelled = true
    }
    // buildQuery is a fixed function below, so only `attempt` re-runs it.
  }, [attempt])

  return { rows, status, error, retry: () => setAttempt((n) => n + 1) }
}

const loadLatestRounds = () =>
  supabase
    .from('v_round_feed')
    .select('roundno, startupno, startupname, cityname, industryname, roundtype, rounddate, amountraisedusd')
    .order('rounddate', { ascending: false })
    .limit(4)

const loadFeaturedStartups = () =>
  supabase
    .from('v_startup_directory')
    .select('startupno, startupname, tagline, cityname, industryname, stage, totalfundingusd')
    .order('totalfundingusd', { ascending: false })
    .limit(4)

export default function Home() {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { cities, industries } = useLookups()
  const latest = useViewRows(loadLatestRounds)
  const featured = useViewRows(loadFeaturedStartups)

  const [search, setSearch] = useState({ q: '', industry: '', city: '', stage: '', funding: '' })

  function update(field) {
    return (event) => setSearch({ ...search, [field]: event.target.value })
  }

  // Put only the filled-in filters into the URL of the Startup list.
  function handleSearch(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    Object.entries(search).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim())
    })
    navigate(`/startups?${params}`)
  }

  // The "Join" button: sign-up for visitors, the right workspace for members.
  const joinLink = !user
    ? '/login'
    : role === 'Founder'
      ? '/founder/startups'
      : role === 'Investor'
        ? '/investor/profile'
        : '/admin'
  const joinLabel = user ? 'Go to my workspace' : 'Join as a founder or investor'

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="on-dark bg-dark text-white">
        <div className="page-x flex flex-wrap items-center gap-12 pt-16 pb-24 lg:pt-24 lg:pb-32">
          <div className="min-w-0 flex-[1_1_520px]">
            <div className="eyebrow">Pakistan's startup funding database</div>
            <h1 className="m-0 mt-3 text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl lg:text-[56px]">
              Discover startups. Track funding. Connect founders and investors.
            </h1>
            <p className="mt-6 mb-8 max-w-xl text-lg leading-relaxed text-muted-dark">
              {APP_NAME} is Pakistan's startup funding database: discover startups, track funding rounds, connect
              founders and investors.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/startups" className="btn btn-lg btn-blue">
                Explore startups
              </Link>
              <Link to={joinLink} className="btn btn-lg btn-line-dark">
                {joinLabel}
              </Link>
            </div>
          </div>

          {/* Latest funding panel (v_round_feed) */}
          <div className="w-full max-w-[560px] min-w-0 flex-[1_1_380px] rounded-2xl border border-navy-line bg-navy-card p-6">
            <div className="mb-1 text-[13px] font-bold tracking-[0.12em] text-muted-dark">LATEST FUNDING ROUNDS</div>
            <p className="mt-0 mb-4 text-sm text-muted-dark">The newest rounds raised by startups in the database.</p>

            {latest.status === 'loading' && <Loading dark text="Loading latest rounds..." />}
            {latest.status === 'error' && <ErrorBox message={latest.error} onRetry={latest.retry} />}
            {latest.status === 'done' && latest.rows.length === 0 && (
              <EmptyState dark title="No funding rounds yet" text="Rounds added by approved startups will appear here." />
            )}
            {latest.status === 'done' &&
              latest.rows.map((round) => (
                <Link
                  key={round.roundno}
                  to={`/startups/${round.startupno}`}
                  className="mb-3 flex items-center justify-between gap-3 rounded-[10px] border border-navy-line bg-navy-deep p-4 last:mb-0 hover:border-[#334155]"
                >
                  <div className="min-w-0">
                    <div className="text-lg font-semibold">{round.startupname}</div>
                    <div className="text-sm text-muted-dark">
                      {round.cityname} · {round.industryname}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      {formatUsd(round.amountraisedusd)}{' '}
                      <span className="font-semibold text-muted-dark">{round.roundtype}</span>
                    </div>
                    <div className="text-xs text-muted-dark">{formatDate(round.rounddate)}</div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* ---------------- Search ---------------- */}
      <section className="page-x relative z-10 -mt-12">
        <form onSubmit={handleSearch} className="card p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-lg font-bold">Search the database</h2>
            <span className="text-sm text-muted">Type a name, or narrow the results with the filters.</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="lbl min-w-[240px] flex-[2_1_240px]">
              Startup name
              <input value={search.q} onChange={update('q')} placeholder="For example: payments" className="fld" />
            </label>
            <label className="lbl min-w-[150px] flex-[1_1_150px]">
              Industry
              <select className="fld" value={search.industry} onChange={update('industry')}>
                <option value="">All industries</option>
                {industries.map((i) => (
                  <option key={i.industryno} value={i.industryno}>
                    {i.industryname}
                  </option>
                ))}
              </select>
            </label>
            <label className="lbl min-w-[130px] flex-[1_1_130px]">
              City
              <select className="fld" value={search.city} onChange={update('city')}>
                <option value="">Any city</option>
                {cities.map((c) => (
                  <option key={c.cityno} value={c.cityno}>
                    {c.cityname}
                  </option>
                ))}
              </select>
            </label>
            <label className="lbl min-w-[130px] flex-[1_1_130px]">
              Stage
              <select className="fld" value={search.stage} onChange={update('stage')}>
                <option value="">Any stage</option>
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="lbl min-w-[150px] flex-[1_1_150px]">
              Total funding
              <select className="fld" value={search.funding} onChange={update('funding')}>
                <option value="">Any amount</option>
                {FUNDING_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn btn-blue w-full sm:w-auto">
                Search startups
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* ---------------- Featured startups (v_startup_directory) ---------------- */}
      <section className="page-x pt-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 mb-2 text-3xl font-bold tracking-tight sm:text-4xl">Featured startups</h2>
            <p className="m-0 max-w-2xl text-lg text-muted">The startups that have raised the most funding so far.</p>
          </div>
          <Link to="/startups" className="text-[16px] font-semibold text-primary hover:underline">
            View all startups
          </Link>
        </div>
        {featured.status === 'loading' && <Loading text="Loading startups..." />}
        {featured.status === 'error' && <ErrorBox message={featured.error} onRetry={featured.retry} />}
        {featured.status === 'done' && featured.rows.length === 0 && (
          <EmptyState
            title="No startups listed yet"
            text="Approved startups will show up here. Founders can add the first one."
            action={
              <Link to={user && role === 'Founder' ? '/founder/startups/new' : '/login'} className="btn btn-blue">
                List a startup
              </Link>
            }
          />
        )}
        {featured.status === 'done' && featured.rows.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-6">
            {featured.rows.map((startup) => (
              <StartupCard key={startup.startupno} startup={startup} />
            ))}
          </div>
        )}
      </section>

      <HowItWorks />
      <Features />

      <div className="pt-16 sm:pt-20">
        <JoinBanner joinTo={joinLink} />
      </div>
    </>
  )
}
