// Startup detail (screen 3). Layout from mockups/Startup.dc.html.
//
// Reads (all read-only; RLS shows approved startups to everyone):
//   v_startup_directory   name, tagline, city, industry, stage, totals
//   Startup               description, website, owner (userno)
//   FundingRound          the funding timeline
//   StartupFounder+Founder the team (a join through the junction table)
//   v_investor_portfolio  "Backed by"
//   v_startup_directory   similar startups (same industry)
// Writes: Watchlist (Save button). "Send pitch" opens the pitch page.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSavedStartups } from '../hooks/useSavedStartups'
import { useCanPitch } from '../hooks/useCanPitch'
import { formatMonthYear, formatUsd, initialOf, shortUrl } from '../lib/format'
import { friendlyError } from '../lib/errors'
import SaveButton from '../components/SaveButton'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

// One investor can join several rounds of the same startup. The mockup
// shows each backer once, so add up their amounts and mark them "Lead"
// if they led any round. NULL (undisclosed) amounts are skipped.
function groupBackers(rows) {
  const byInvestor = new Map()
  for (const row of rows) {
    const backer = byInvestor.get(row.investorno) ?? {
      investorno: row.investorno,
      investorname: row.investorname,
      total: 0,
      hasAmount: false,
      isLead: false,
    }
    if (row.amountusd !== null) {
      backer.total += Number(row.amountusd)
      backer.hasAmount = true
    }
    if (row.islead) backer.isLead = true
    byInvestor.set(row.investorno, backer)
  }
  return [...byInvestor.values()].sort((a, b) => b.total - a.total)
}

// Loads everything this page needs. Returns null if the startup is not
// public (not approved, or the id does not exist).
async function loadStartup(id) {
  const [directory, details, rounds, team, backers] = await Promise.all([
    supabase.from('v_startup_directory').select('*').eq('startupno', id).maybeSingle(),
    supabase.from('startup').select('description, website, userno').eq('startupno', id).maybeSingle(),
    supabase
      .from('fundinground')
      .select('roundno, roundtype, rounddate, amountraisedusd, valuationusd')
      .eq('startupno', id)
      .order('rounddate', { ascending: false }),
    // founder(...) follows the foreign key StartupFounder.founderNo -> Founder
    supabase
      .from('startupfounder')
      .select('roletitle, joinedyear, founder ( founderno, fullname )')
      .eq('startupno', id)
      .order('joinedyear', { ascending: true }),
    supabase.from('v_investor_portfolio').select('investorno, investorname, amountusd, islead').eq('startupno', id),
  ])

  const failed = [directory, details, rounds, team, backers].find((result) => result.error)
  if (failed) throw failed.error
  if (!directory.data) return null

  const similar = await supabase
    .from('v_startup_directory')
    .select('startupno, startupname, cityname, stage, tagline')
    .eq('industryno', directory.data.industryno)
    .neq('startupno', id)
    .order('totalfundingusd', { ascending: false })
    .limit(3)
  if (similar.error) throw similar.error

  return {
    startup: { ...directory.data, ...details.data },
    rounds: rounds.data,
    team: team.data,
    backers: groupBackers(backers.data),
    similar: similar.data,
  }
}

export default function StartupDetail() {
  const { startupNo } = useParams()
  const id = Number(startupNo)
  const { user } = useAuth()
  const savedIds = useSavedStartups()
  const canPitch = useCanPitch()

  const [page, setPage] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'notfound' | 'done'
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setStatus('notfound')
      return
    }
    let cancelled = false
    setStatus('loading')
    loadStartup(id)
      .then((result) => {
        if (cancelled) return
        setPage(result)
        setStatus(result ? 'done' : 'notfound')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load this startup'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (status === 'loading') {
    return (
      <div className="page-x">
        <Loading text="Loading startup..." />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="page-x pt-10">
        <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    )
  }
  if (status === 'notfound') {
    return (
      <div className="page-x pt-10">
        <EmptyState
          title="Startup not found"
          text="This startup does not exist, or it is still waiting for admin review and is not public yet."
          action={
            <Link to="/startups" className="btn btn-blue">
              Browse startups
            </Link>
          }
        />
      </div>
    )
  }

  const { startup, rounds, team, backers, similar } = page
  // If the founder is looking at their own startup, pre-select it on the pitch page.
  const pitchLink = startup.userno === user?.id ? `/founder/pitch?startup=${startup.startupno}` : '/founder/pitch'

  return (
    <>
      {/* ---------------- Header ---------------- */}
      <div className="border-b border-border bg-surface">
        <div className="page-x py-10">
          <div className="mb-5 text-sm text-muted [&_a]:text-primary [&_a]:hover:underline">
            <Link to="/startups">Startups</Link> / {startup.industryname} / {startup.startupname}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 flex-[1_1_520px] items-center gap-5">
              <div className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-2xl bg-primary-soft text-[32px] font-bold text-primary">
                {initialOf(startup.startupname)}
              </div>
              <div className="min-w-0">
                <h1 className="m-0 text-3xl font-bold tracking-tight sm:text-4xl">{startup.startupname}</h1>
                <div className="mt-1.5 mb-3.5 text-lg text-muted">{startup.tagline}</div>
                <div className="flex flex-wrap gap-2">
                  <span className="chip chip-sky">{startup.industryname}</span>
                  <span className="chip chip-plain">
                    {startup.cityname}
                    {startup.province ? `, ${startup.province}` : ''}
                  </span>
                  <span className="chip chip-plain">{startup.stage}</span>
                  <span className="chip chip-plain">{startup.status}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <SaveButton
                startupNo={startup.startupno}
                alreadySaved={savedIds.has(startup.startupno)}
                label="Save to watchlist"
                small={false}
              />
              {canPitch && (
                <Link to={pitchLink} className="btn btn-blue">
                  Send pitch
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="page-x flex flex-wrap items-start gap-8 pt-10">
        {/* ---------------- Main column ---------------- */}
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-10">
          <section>
            <h2 className="mt-0 mb-3 text-2xl font-bold">Overview</h2>
            <p className="m-0 max-w-[760px] text-[17px] leading-relaxed text-ink-soft">
              {startup.description || 'The founders have not added a description yet.'}
            </p>
          </section>

          <section>
            <h2 className="mt-0 mb-1 text-2xl font-bold">Funding timeline</h2>
            <p className="mt-0 mb-4 text-muted">Every funding round this startup has raised, in date order.</p>
            {rounds.length === 0 ? (
              <EmptyState title="No funding rounds yet" text="This startup has not added any funding rounds. Check back later." />
            ) : (
              <div className="card overflow-x-auto">
                <div className="grid min-w-[520px] grid-cols-[1.1fr_1fr_1fr_1fr] gap-3 bg-page px-5 py-3 text-[13px] font-bold tracking-[0.06em] text-muted">
                  <span>DATE</span>
                  <span>ROUND</span>
                  <span>AMOUNT</span>
                  <span>VALUATION</span>
                </div>
                {rounds.map((round) => (
                  <div
                    key={round.roundno}
                    className="grid min-w-[520px] grid-cols-[1.1fr_1fr_1fr_1fr] items-center gap-3 border-t border-line px-5 py-4"
                  >
                    <span className="text-muted">{formatMonthYear(round.rounddate)}</span>
                    <span className="font-semibold">{round.roundtype}</span>
                    <span className="font-bold text-brand">{formatUsd(round.amountraisedusd)}</span>
                    <span>{round.valuationusd === null ? 'Not disclosed' : formatUsd(round.valuationusd)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mt-0 mb-1 text-2xl font-bold">Backed by</h2>
            <p className="mt-0 mb-4 text-muted">Investors who took part in this startup's funding rounds.</p>
            {backers.length === 0 ? (
              <EmptyState title="No investors listed yet" text="Verified investors who back this startup will appear here once a round with investors is added." />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4">
                {backers.map((backer) => (
                  <Link
                    key={backer.investorno}
                    to={`/investors/${backer.investorno}`}
                    className="card card-hover flex items-center gap-3.5 p-[18px]"
                  >
                    <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-sky font-bold text-sky-ink">
                      {initialOf(backer.investorname)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{backer.investorname}</div>
                      <div className="text-sm text-muted">
                        {backer.isLead ? 'Lead' : 'Investor'} · {backer.hasAmount ? formatUsd(backer.total) : 'Undisclosed'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {similar.length > 0 && (
            <section>
              <h2 className="mt-0 mb-4 text-2xl font-bold">Similar startups</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
                {similar.map((other) => (
                  <Link key={other.startupno} to={`/startups/${other.startupno}`} className="card card-hover block p-[18px]">
                    <div className="text-[17px] font-semibold">{other.startupname}</div>
                    <div className="mt-1 mb-2.5 text-sm text-muted">
                      {other.cityname} · {other.stage}
                    </div>
                    <div className="text-[15px] text-ink-soft">{other.tagline}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ---------------- Side column ---------------- */}
        <aside className="flex w-full max-w-[380px] min-w-0 flex-[1_1_300px] flex-col gap-5">
          <div className="card p-6">
            <div className="text-sm text-muted">Total funding</div>
            <div className="text-4xl leading-tight font-bold text-primary">{formatUsd(startup.totalfundingusd)}</div>
            <div className="mt-1 text-sm text-muted">
              Sum of {startup.roundcount} {startup.roundcount === 1 ? 'round' : 'rounds'}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="mt-0 mb-3.5 text-lg font-semibold">Facts</h3>
            <Fact label="Founded" value={startup.foundedyear ?? 'Not given'} />
            <Fact label="Team size" value={startup.teamsize ?? 'Not given'} />
            <Fact label="Stage" value={startup.stage} />
            <Fact
              label="Website"
              value={
                startup.website ? (
                  <a href={startup.website} target="_blank" rel="noreferrer" className="text-brand">
                    {shortUrl(startup.website)}
                  </a>
                ) : (
                  'Not given'
                )
              }
            />
          </div>

          <div className="card p-6">
            <h3 className="mt-0 mb-3.5 text-lg font-semibold">Founders</h3>
            {team.length === 0 && <p className="m-0 text-[15px] text-muted">No team members added yet.</p>}
            {team.map((member) => (
              <div key={member.founder.founderno} className="flex items-center gap-3 border-t border-line py-2.5">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
                  {initialOf(member.founder.fullname)}
                </div>
                <div>
                  <div className="text-[15px] font-semibold">{member.founder.fullname}</div>
                  <div className="text-sm text-muted">{member.roletitle}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}

// One "label ..... value" line in the Facts box.
function Fact({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-2.5 text-[15px]">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}
