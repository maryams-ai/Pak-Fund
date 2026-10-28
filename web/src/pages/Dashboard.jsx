// Funding dashboard (screen 7). Layout from mockups/Dashboard.dc.html.
//
// Reads ONLY the dashboard views from 004 (brief section 9: numbers come
// from views, never from stored totals). All views count approved
// startups only. Writes: nothing.
//   v_funding_by_year           KPI tiles, "Funding by year" columns, year list
//   v_funding_by_industry       "Funding by industry" (all years)
//   v_industry_funding_by_year  "Funding by industry" (one year)
//   v_top_investors             "Most active investors", active-investor count
//   v_round_feed                "Biggest rounds"
//   v_funding_by_city           "Startups per city"
//   v_startups_by_stage         "Startups by stage"
// Charts are plain CSS bars: each bar's width/height is its share of
// the largest value.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { formatMonthYear, formatUsd } from '../lib/format'
import { friendlyError } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

// Loads every section. `year` is a number, or '' for all years.
async function loadDashboard(year) {
  const industryQuery = year
    ? supabase
        .from('v_industry_funding_by_year')
        .select('industryno, industryname, totalfundingusd')
        .eq('fundingyear', year)
    : supabase.from('v_funding_by_industry').select('industryno, industryname, totalfundingusd')

  let biggestQuery = supabase
    .from('v_round_feed')
    .select('roundno, startupno, startupname, roundtype, rounddate, amountraisedusd')
    .order('amountraisedusd', { ascending: false })
    .limit(5)
  if (year) biggestQuery = biggestQuery.gte('rounddate', `${year}-01-01`).lte('rounddate', `${year}-12-31`)

  const results = await Promise.all([
    supabase.from('v_funding_by_year').select('*').order('fundingyear', { ascending: true }),
    industryQuery.order('totalfundingusd', { ascending: false }),
    supabase.from('v_top_investors').select('*').order('activityrank', { ascending: true }).limit(5),
    supabase.from('v_top_investors').select('investorno', { count: 'exact', head: true }),
    biggestQuery,
    supabase.from('v_funding_by_city').select('*').gt('startupcount', 0).order('startupcount', { ascending: false }).limit(6),
    supabase.from('v_startups_by_stage').select('*').order('stageorder', { ascending: true }),
  ])

  const failed = results.find((result) => result.error)
  if (failed) throw failed.error

  const [years, industries, investors, activeCount, biggest, cities, stages] = results
  return {
    years: years.data,
    industries: industries.data.filter((row) => Number(row.totalfundingusd) > 0),
    investors: investors.data,
    activeInvestors: activeCount.count ?? 0,
    biggest: biggest.data,
    cities: cities.data,
    stages: stages.data,
  }
}

// Share of the largest value, as a CSS percentage (at least 2% so a
// tiny bar is still visible).
function share(value, max) {
  if (!max) return '0%'
  return `${Math.max(2, Math.round((Number(value) / max) * 100))}%`
}

export default function Dashboard() {
  const [year, setYear] = useState('') // '' = all years
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'done'
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadDashboard(year ? Number(year) : '')
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(friendlyError(err, 'load the dashboard'))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [year, attempt])

  // Year list for the filter comes from the data itself (newest first).
  const yearOptions = data ? [...data.years].reverse().map((row) => row.fundingyear) : []

  return (
    <>
      <PageHeader
        title="Funding dashboard"
        subtitle="Pakistan's startup funding at a glance: see where the money goes, which investors are most active and which rounds are the biggest."
        action={
          <label className="flex items-center gap-2.5 text-sm font-semibold text-ink-soft">
            Show year
            <select className="fld w-auto" value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="page-x pt-8">
        {status === 'loading' && <Loading text="Loading dashboard..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}
        {status === 'done' && data.years.length === 0 && (
          <EmptyState
            title="No funding data yet"
            text="Charts appear here once approved startups add their funding rounds. In the meantime, you can browse the startups that are listed."
            action={
              <Link to="/startups" className="btn btn-blue">
                Browse startups
              </Link>
            }
          />
        )}
        {status === 'done' && data.years.length > 0 && <DashboardBody data={data} year={year ? Number(year) : null} />}
      </div>
    </>
  )
}

function DashboardBody({ data, year }) {
  // KPI tiles: add up the rows of v_funding_by_year (one year, or all).
  const yearRows = year ? data.years.filter((row) => row.fundingyear === year) : data.years
  const totalFunding = yearRows.reduce((sum, row) => sum + Number(row.totalfundingusd), 0)
  const roundCount = yearRows.reduce((sum, row) => sum + Number(row.roundcount), 0)
  const averageRound = roundCount ? totalFunding / roundCount : 0

  const maxIndustry = Math.max(0, ...data.industries.map((row) => Number(row.totalfundingusd)))
  const maxYear = Math.max(0, ...data.years.map((row) => Number(row.totalfundingusd)))
  const maxStage = Math.max(0, ...data.stages.map((row) => Number(row.startupcount)))

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- KPI tiles ---------------- */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Tile
          label={`Total funding${year ? ` in ${year}` : ''}`}
          value={formatUsd(totalFunding)}
          hint="Money raised by all startups"
        />
        <Tile
          label={`Funding rounds${year ? ` in ${year}` : ''}`}
          value={roundCount}
          hint="Number of rounds raised"
        />
        <Tile label="Active investors" value={data.activeInvestors} hint="Investors with at least one investment" />
        <Tile label="Average round size" value={formatUsd(averageRound)} hint="Total funding divided by rounds" />
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        {/* ---------------- Funding by industry: horizontal bars ---------------- */}
        <Panel
          className="flex-[1_1_520px]"
          title="Funding by industry"
          note="Which industries attract the most money. A longer bar means more funding (USD)."
        >
          {data.industries.length === 0 ? (
            <p className="m-0 text-muted">No funding recorded{year ? ` in ${year}` : ''}.</p>
          ) : (
            data.industries.map((row) => (
              <div key={row.industryno} className="grid grid-cols-[minmax(90px,140px)_minmax(0,1fr)_64px] items-center gap-3.5 py-[7px] text-[15px]">
                <span className="truncate font-medium" title={row.industryname}>{row.industryname}</span>
                <div className="h-[22px] rounded-md bg-border">
                  <div className="h-[22px] rounded-md bg-brand" style={{ width: share(row.totalfundingusd, maxIndustry) }} />
                </div>
                <span className="text-right font-bold">{formatUsd(row.totalfundingusd)}</span>
              </div>
            ))
          )}
        </Panel>

        {/* ---------------- Funding by year: vertical columns ---------------- */}
        <Panel className="flex-[1_1_400px]" title="Funding by year" note="How much funding startups raised in each year (USD). The selected year is highlighted.">
          <div className="flex h-[230px] items-end gap-3 border-b border-line px-1.5">
            {data.years.map((row) => (
              <div key={row.fundingyear} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-bold sm:text-sm">{formatUsd(row.totalfundingusd)}</span>
                <div
                  className={`w-full max-w-14 rounded-t-md ${year && row.fundingyear !== year ? 'bg-primary/30' : 'bg-brand'}`}
                  style={{ height: share(row.totalfundingusd, maxYear) }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 px-1.5 pt-2 text-sm font-medium text-muted">
            {data.years.map((row) => (
              <span key={row.fundingyear} className="flex-1 text-center">
                {row.fundingyear}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        {/* ---------------- Most active investors ---------------- */}
        <Panel className="flex-[1_1_400px]" title="Most active investors" note="Investors ranked by how many investments they have made, with the total amount invested.">
          {data.investors.length === 0 && <p className="m-0 text-muted">No investments recorded yet.</p>}
          {data.investors.map((row) => (
            <Link
              key={row.investorno}
              to={`/investors/${row.investorno}`}
              className="flex items-center justify-between gap-3 border-t border-line py-[13px]"
            >
              <span className="flex items-center gap-3">
                <b className="w-[26px] text-muted">{row.activityrank}</b>
                <span className="font-semibold">{row.investorname}</span>
              </span>
              <span className="text-muted">
                {row.investmentcount} deals · <b className="text-ink">{formatUsd(row.totalinvestedusd)}</b>
              </span>
            </Link>
          ))}
        </Panel>

        {/* ---------------- Biggest rounds ---------------- */}
        <Panel
          className="flex-[1_1_520px]"
          title="Biggest rounds"
          note={`The five largest funding rounds${year ? ` in ${year}` : ''}. Select a row to open the startup.`}
        >
          {data.biggest.length === 0 ? (
            <p className="m-0 text-muted">No rounds{year ? ` in ${year}` : ''}.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[420px] grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-3 py-2.5 text-[13px] font-bold tracking-[0.06em] text-muted">
                <span>STARTUP</span>
                <span>ROUND</span>
                <span>DATE</span>
                <span className="text-right">AMOUNT</span>
              </div>
              {data.biggest.map((row) => (
                <Link
                  key={row.roundno}
                  to={`/startups/${row.startupno}`}
                  className="grid min-w-[420px] grid-cols-[1.4fr_1fr_0.8fr_0.8fr] items-center gap-3 border-t border-line py-[13px] text-[15px]"
                >
                  <span className="font-semibold">{row.startupname}</span>
                  <span>{row.roundtype}</span>
                  <span className="text-muted">{formatMonthYear(row.rounddate)}</span>
                  <span className="text-right font-bold text-primary">{formatUsd(row.amountraisedusd)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        {/* ---------------- Startups per city ---------------- */}
        <Panel className="flex-[2_1_520px]" title="Startups per city" note="Number of listed startups in each city, across all years.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
            {data.cities.map((row) => (
              <div key={row.cityno} className="rounded-[10px] border border-line bg-page p-[18px]">
                <div className="text-3xl font-bold text-primary">{row.startupcount}</div>
                <div className="text-[15px] font-medium">{row.cityname}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---------------- Startups by stage ---------------- */}
        <Panel className="flex-[1_1_340px]" title="Startups by stage" note="How many startups are at each stage, from first idea to growth.">
          {data.stages.map((row) => (
            <div key={row.stage} className="grid grid-cols-[90px_minmax(0,1fr)_32px] items-center gap-3 py-[7px] text-[15px]">
              <span className="font-medium">{row.stage}</span>
              <div className="h-[18px] rounded-md bg-border">
                <div className="h-[18px] rounded-md bg-primary" style={{ width: row.startupcount ? share(row.startupcount, maxStage) : '0%' }} />
              </div>
              <span className="text-right font-bold">{row.startupcount}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

function Tile({ label, value, hint }) {
  return (
    <div className="card p-6">
      <div className="text-sm font-semibold text-ink-soft">{label}</div>
      <div className="my-1 text-4xl font-bold tracking-tight text-primary">{value}</div>
      <div className="text-sm text-muted">{hint}</div>
    </div>
  )
}

function Panel({ title, note, className = '', children }) {
  return (
    <section className={`card min-w-0 p-6 sm:p-7 ${className}`}>
      <h2 className="mt-0 mb-1 text-xl font-bold">{title}</h2>
      <p className="mt-0 mb-5 text-sm text-muted">{note}</p>
      {children}
    </section>
  )
}
