// Investor detail (screen 5). Layout from mockups/InvestorDetail.dc.html.
//
// Reads (read-only; RLS shows verified investors to everyone):
//   v_investor_summary    name, type, city, bio, ticket range, counts, industries
//   Investor              website and LinkedIn
//   v_investor_portfolio  every investment in an approved startup
// Writes: nothing. "Pitch this investor" opens the pitch page.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useCanPitch } from '../hooks/useCanPitch'
import { formatTicket, formatUsd, initialOf, shortUrl } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

// Returns null if this investor is not in the public directory.
async function loadInvestor(id) {
  const [summary, links, portfolio] = await Promise.all([
    supabase.from('v_investor_summary').select('*').eq('investorno', id).maybeSingle(),
    supabase.from('investor').select('website, linkedinurl').eq('investorno', id).maybeSingle(),
    supabase
      .from('v_investor_portfolio')
      .select('investmentno, startupno, startupname, roundtype, rounddate, amountusd, islead')
      .eq('investorno', id)
      .order('rounddate', { ascending: false }),
  ])

  const failed = [summary, links, portfolio].find((result) => result.error)
  if (failed) throw failed.error
  if (!summary.data) return null

  return { investor: { ...summary.data, ...links.data }, portfolio: portfolio.data }
}

export default function InvestorDetail() {
  const { investorNo } = useParams()
  const id = Number(investorNo)
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
    loadInvestor(id)
      .then((result) => {
        if (cancelled) return
        setPage(result)
        setStatus(result ? 'done' : 'notfound')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load this investor'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (status === 'loading') {
    return (
      <div className="page-x">
        <Loading text="Loading investor..." />
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
          title="Investor not found"
          text="This investor does not exist, or the profile has not been verified by an admin yet."
          action={
            <Link to="/investors" className="btn btn-blue">
              Browse investors
            </Link>
          }
        />
      </div>
    )
  }

  const { investor, portfolio } = page
  const industries = investor.industries ? investor.industries.split(', ') : []
  const pitchLink = `/founder/pitch?investor=${investor.investorno}`

  return (
    <>
      {/* ---------------- Header ---------------- */}
      <div className="border-b border-border bg-surface">
        <div className="page-x py-10">
          <div className="mb-5 text-sm text-muted [&_a]:text-primary [&_a]:hover:underline">
            <Link to="/investors">Investors</Link> / {investor.investorname}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex min-w-0 flex-[1_1_480px] items-center gap-5">
              <div className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-2xl bg-primary-soft text-[32px] font-bold text-primary">
                {initialOf(investor.investorname)}
              </div>
              <div className="min-w-0">
                <h1 className="m-0 text-3xl font-bold tracking-tight sm:text-4xl">{investor.investorname}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* The view only contains verified investors */}
                  <span className="chip badge-success">Verified</span>
                  <span className="chip chip-plain">{investor.investortype}</span>
                  {investor.cityname && <span className="chip chip-plain">{investor.cityname}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {investor.website && (
                <a href={investor.website} target="_blank" rel="noreferrer" className="btn btn-line">
                  Visit website
                </a>
              )}
              {canPitch && (
                <Link to={pitchLink} className="btn btn-blue">
                  Pitch this investor
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
            <h2 className="mt-0 mb-3 text-2xl font-bold">About</h2>
            <p className="m-0 max-w-[760px] text-[17px] leading-relaxed text-ink-soft">
              {investor.bio || 'This investor has not written a bio yet.'}
            </p>
          </section>

          <section>
            <h2 className="mt-0 mb-3.5 text-2xl font-bold">Invests in</h2>
            {industries.length === 0 ? (
              <p className="m-0 text-muted">No industries chosen yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {industries.map((name) => (
                  <span key={name} className="chip chip-sky px-4 py-2 text-[15px]">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mt-0 mb-1 text-2xl font-bold">Portfolio</h2>
            <p className="mt-0 mb-4 text-muted">Startups this investor has backed, with the round and amount.</p>
            {portfolio.length === 0 ? (
              <EmptyState title="No public investments yet" text="Investments in approved startups will appear here once this investor is recorded in a funding round." />
            ) : (
              <div className="card overflow-x-auto">
                <div className="grid min-w-[520px] grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 bg-page px-5 py-3 text-[13px] font-bold tracking-[0.06em] text-muted">
                  <span>STARTUP</span>
                  <span>ROUND</span>
                  <span>AMOUNT</span>
                  <span>ROLE</span>
                </div>
                {portfolio.map((item) => (
                  <Link
                    key={item.investmentno}
                    to={`/startups/${item.startupno}`}
                    className="grid min-w-[520px] grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-3 border-t border-line px-5 py-4"
                  >
                    <span className="font-semibold">{item.startupname}</span>
                    <span>{item.roundtype}</span>
                    <span className="font-bold text-brand">{formatUsd(item.amountusd)}</span>
                    <span className="text-muted">{item.islead ? 'Lead' : 'Investor'}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Side column ---------------- */}
        <aside className="flex w-full max-w-[380px] min-w-0 flex-[1_1_300px] flex-col gap-5">
          <div className="card p-6">
            <div className="text-sm text-muted">Typical ticket size</div>
            <div className="text-3xl leading-tight font-bold text-primary">
              {formatTicket(investor.minticketusd, investor.maxticketusd)}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="mt-0 mb-3.5 text-lg font-semibold">Quick facts</h3>
            <Fact label="Investments" value={investor.investmentcount} />
            <Fact label="As lead" value={investor.leadcount} />
            <Fact label="Total invested" value={formatUsd(investor.totalinvestedusd)} />
            {investor.linkedinurl && (
              <Fact
                label="LinkedIn"
                value={
                  <a href={investor.linkedinurl} target="_blank" rel="noreferrer" className="text-brand">
                    {shortUrl(investor.linkedinurl).replace(/^linkedin\.com\/(in|company)\//i, '')}
                  </a>
                }
              />
            )}
          </div>

          {canPitch && (
            <Link to={pitchLink} className="btn btn-blue w-full">
              Send a pitch request
            </Link>
          )}
        </aside>
      </div>
    </>
  )
}

// One "label ..... value" line in the Quick facts box.
function Fact({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-2.5 text-[15px]">
      <span className="text-muted">{label}</span>
      <b className="text-right">{value}</b>
    </div>
  )
}
