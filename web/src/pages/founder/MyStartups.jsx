// Founder: My startups (screen 8). Layout from mockups/MyStartups.dc.html.
//
// Reads (RLS lets a founder see their own rows, approved or not):
//   Startup (+ City, Industry)   the founder's startups and review status
//   v_startup_total_funding      total funding per startup
//   StartupFounder               team size per startup
//   PitchRequest (+ Investor)    pitches sent, and the "Recent pitches" box
// Writes: nothing (buttons open the other founder screens).
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatUsd, initialOf } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import StatusChip from '../../components/StatusChip'
import PageHeader from '../../components/PageHeader'
import { EmptyState, ErrorBox, Loading, WelcomeBox } from '../../components/Status'

// The label on each startup card.
function reviewLabel(startup) {
  if (!startup.isapproved) return 'Waiting for admin review'
  return startup.status === 'Active' ? 'Live' : startup.status
}

async function loadMyStartups(userId) {
  // city(...) and industry(...) follow the foreign keys from Startup.
  const startups = await supabase
    .from('startup')
    .select('startupno, startupname, stage, status, isapproved, city ( cityname ), industry ( industryname )')
    .eq('userno', userId)
    .order('startupno', { ascending: true })
  if (startups.error) throw startups.error

  const ids = startups.data.map((s) => s.startupno)
  const [totals, team, pitches] = await Promise.all([
    supabase.from('v_startup_total_funding').select('startupno, totalfundingusd').in('startupno', ids),
    supabase.from('startupfounder').select('startupno').in('startupno', ids),
    supabase
      .from('pitchrequest')
      .select('requestno, startupno, status, requestdate, investor ( investorname ), startup ( startupname )')
      .eq('userno', userId)
      .order('requestdate', { ascending: false }),
  ])
  const failed = [totals, team, pitches].find((result) => result.error)
  if (failed) throw failed.error

  // Count rows per startup in JavaScript (small lists).
  const countBy = (rows) =>
    rows.reduce((counts, row) => ({ ...counts, [row.startupno]: (counts[row.startupno] ?? 0) + 1 }), {})
  const teamCount = countBy(team.data)
  const pitchCount = countBy(pitches.data)
  const totalById = Object.fromEntries(totals.data.map((row) => [row.startupno, row.totalfundingusd]))

  return {
    startups: startups.data.map((s) => ({
      ...s,
      total: totalById[s.startupno] ?? 0,
      team: teamCount[s.startupno] ?? 0,
      pitches: pitchCount[s.startupno] ?? 0,
    })),
    recentPitches: pitches.data.slice(0, 3),
  }
}

export default function MyStartups() {
  const { user, profile } = useAuth()
  const location = useLocation()
  const flash = location.state?.flash // e.g. "Changes saved." after editing

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadMyStartups(user.id)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load your startups'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [user.id, attempt])

  const firstName = profile.fullname.split(' ')[0]

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle="This is your workspace. Manage your startups, add your team and funding rounds, and follow the pitches you have sent."
        action={
          <Link to="/founder/startups/new" className="btn btn-blue">
            Add a startup
          </Link>
        }
      />

      <div className="page-x pt-8">
        <WelcomeBox
          title="Getting started: from listing to your first pitch"
          text="Follow these four steps. Each startup card below shows where you are."
          steps={[
            'Add your startup with a name, city, industry and stage.',
            'Wait for admin approval. Once approved, your startup is public.',
            'Add your team members and past funding rounds.',
            'Send a pitch to a verified investor and track the answer.',
          ]}
          action={
            status === 'done' && data.startups.length === 0 ? (
              <Link to="/founder/startups/new" className="btn btn-blue">
                Add your first startup
              </Link>
            ) : null
          }
        />
      </div>

      <div className="page-x flex flex-wrap items-start gap-8 pt-8">
        {/* ---------------- My startups ---------------- */}
        <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <div>
            <h2 className="m-0 text-2xl font-bold">My startups</h2>
            <p className="mt-1 mb-0 text-muted">Every startup you have added, with its review status, funding and team.</p>
          </div>
          {flash && <div className="alert-info">{flash}</div>}

          {status === 'loading' && <Loading text="Loading your startups..." />}
          {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}
          {status === 'done' && data.startups.length === 0 && (
            <EmptyState
              title="You have not added a startup yet"
              text="Add your first startup to get started. An admin reviews it before it becomes public, and you can add your team and funding rounds while you wait."
              action={
                <Link to="/founder/startups/new" className="btn btn-blue">
                  Add a startup
                </Link>
              }
            />
          )}
          {status === 'done' &&
            data.startups.map((startup) => <MyStartupCard key={startup.startupno} startup={startup} />)}
        </section>

        {/* ---------------- Side column ---------------- */}
        <aside className="flex w-full max-w-[400px] min-w-0 flex-[1_1_320px] flex-col gap-5">
          <div className="card p-[26px]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 text-lg font-semibold">Recent pitches</h3>
              <Link to="/founder/pitch" className="text-sm font-semibold text-primary hover:underline">
                See all
              </Link>
            </div>
            {status === 'done' && data.recentPitches.length === 0 && (
              <p className="m-0 border-t border-line pt-3 text-[15px] text-muted">No pitches sent yet. Once your startup is approved, you can pitch a verified investor.</p>
            )}
            {status === 'done' &&
              data.recentPitches.map((pitch) => (
                <div key={pitch.requestno} className="flex items-center justify-between gap-2.5 border-t border-line py-[13px] text-[15px]">
                  <div className="min-w-0">
                    <div className="font-semibold">{pitch.investor?.investorname ?? 'Investor'}</div>
                    <div className="text-[13px] text-muted">
                      {pitch.startup?.startupname} · {formatDate(pitch.requestdate)}
                    </div>
                  </div>
                  <StatusChip status={pitch.status} />
                </div>
              ))}
          </div>

          <div className="card p-[26px]">
            <h3 className="mt-0 mb-2 text-lg font-semibold">Ready to send your first pitch?</h3>
            <p className="mt-0 mb-[18px] text-[15px] leading-relaxed text-muted">
              Complete your team and funding rounds first. A complete profile builds investor trust.
            </p>
            <Link to="/investors" className="btn btn-sm btn-blue">
              Browse investors
            </Link>
          </div>
        </aside>
      </div>
    </>
  )
}

function MyStartupCard({ startup }) {
  const meta = [startup.industry?.industryname, startup.city?.cityname, startup.stage].filter(Boolean).join(' · ')

  return (
    <div className="card flex flex-col gap-5 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-primary-soft text-2xl font-bold text-primary">
            {initialOf(startup.startupname)}
          </div>
          <div>
            <div className="text-xl font-semibold text-text">{startup.startupname}</div>
            <div className="text-[15px] text-muted">{meta}</div>
          </div>
        </div>
        <StatusChip status={reviewLabel(startup)} />
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-[15px] text-muted">
        <span>
          Total funding <b className="text-[17px] text-ink">{formatUsd(startup.total)}</b>
        </span>
        <span>
          Team <b className="text-[17px] text-ink">{startup.team}</b>
        </span>
        <span>
          Pitches sent <b className="text-[17px] text-ink">{startup.pitches}</b>
        </span>
      </div>

      {!startup.isapproved && (
        <p className="m-0 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          An admin is reviewing this startup. It becomes public once approved, and then you can send pitches. You can
          add your team and funding rounds in the meantime.
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Link to={`/founder/startups/${startup.startupno}/edit`} className="btn btn-sm btn-line">
          Edit details
        </Link>
        <Link to={`/founder/startups/${startup.startupno}/team`} className="btn btn-sm btn-line">
          Team and rounds
        </Link>
        {/* Only approved startups have a public page and can pitch (RLS rule). */}
        {startup.isapproved && (
          <>
            <Link to={`/startups/${startup.startupno}`} className="btn btn-sm btn-line">
              View public page
            </Link>
            <Link to={`/founder/pitch?startup=${startup.startupno}`} className="btn btn-sm btn-blue">
              Send a pitch
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
