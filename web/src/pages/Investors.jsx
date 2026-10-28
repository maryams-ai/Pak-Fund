// Investor directory (screen 4). Layout from mockups/Investors.dc.html.
//
// Reads: view v_investor_summary (verified investors only, with deal
// counts and industries), plus City and Industry for the dropdowns.
// Writes: nothing.
// Filters, sort and page live in the URL, like the Startup list.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLookups } from '../hooks/useLookups'
import { INVESTOR_TYPES } from '../lib/constants'
import { formatTicket, initialOf } from '../lib/format'
import { escapeLike } from '../lib/search'
import { friendlyError } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

const PAGE_SIZE = 6

const SORTS = {
  active: { label: 'Most active', column: 'investmentcount', ascending: false },
  name: { label: 'Name A to Z', column: 'investorname', ascending: true },
  ticket: { label: 'Ticket size', column: 'maxticketusd', ascending: false },
}

const EMPTY_FILTERS = { q: '', industry: '', city: '', type: '' }

function readFilters(params) {
  return {
    q: params.get('q') ?? '',
    industry: params.get('industry') ?? '',
    city: params.get('city') ?? '',
    type: params.get('type') ?? '',
    sort: SORTS[params.get('sort')] ? params.get('sort') : 'active',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

// Only non-empty, non-default values go into the URL.
function toParams(filters) {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'sort' && value === 'active') return
    if (key === 'page' && value === 1) return
    if (String(value).trim() !== '') params[key] = String(value).trim()
  })
  return params
}

function buildQuery(filters) {
  let query = supabase
    .from('v_investor_summary')
    .select('investorno, investorname, investortype, cityname, bio, minticketusd, maxticketusd, investmentcount, industries', {
      count: 'exact',
    })

  if (filters.q) query = query.ilike('investorname', `%${escapeLike(filters.q)}%`)
  if (filters.type) query = query.eq('investortype', filters.type)
  if (filters.city) query = query.eq('cityno', filters.city)
  // industrynos is an array of ids; "contains" keeps investors whose
  // array includes the chosen industry (SQL: industryNos @> ARRAY[3]).
  if (filters.industry) query = query.contains('industrynos', [Number(filters.industry)])

  const sort = SORTS[filters.sort]
  query = query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order('investorno', { ascending: true }) // tie-breaker so pages never overlap

  const from = (filters.page - 1) * PAGE_SIZE
  return query.range(from, from + PAGE_SIZE - 1)
}

export default function Investors() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsText = searchParams.toString()
  const filters = readFilters(searchParams)
  const { cities, industries } = useLookups()

  // The form keeps its own copy until "Apply filters" is pressed.
  const [form, setForm] = useState({ ...EMPTY_FILTERS, ...filters })
  useEffect(() => {
    setForm({ ...EMPTY_FILTERS, ...readFilters(new URLSearchParams(paramsText)) })
  }, [paramsText])

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'done'
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const current = readFilters(new URLSearchParams(paramsText))
    setStatus('loading')

    buildQuery(current).then(({ data, count, error: queryError }) => {
      if (cancelled) return
      if (queryError) {
        // Page number past the end: go back to page 1.
        if (queryError.code === 'PGRST103' && current.page > 1) {
          setSearchParams(toParams({ ...current, page: 1 }), { replace: true })
          return
        }
        setError(friendlyError(queryError, 'load investors'))
        setStatus('error')
        return
      }
      setRows(data)
      setTotal(count ?? 0)
      setStatus('done')
    })

    return () => {
      cancelled = true
    }
  }, [paramsText, attempt, setSearchParams])

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  function applyFilters(event) {
    event.preventDefault()
    setSearchParams(toParams({ ...form, sort: filters.sort, page: 1 }))
  }

  function clearFilters() {
    setSearchParams(toParams({ ...EMPTY_FILTERS, sort: filters.sort, page: 1 }))
  }

  function changeSort(event) {
    setSearchParams(toParams({ ...filters, sort: event.target.value, page: 1 }))
  }

  function goToPage(page) {
    setSearchParams(toParams({ ...filters, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstShown = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1
  const lastShown = Math.min(filters.page * PAGE_SIZE, total)
  const hasFilters = ['q', 'industry', 'city', 'type'].some((key) => filters[key])

  return (
    <>
      <PageHeader title="Investors" subtitle="Find verified investors by industry, city and type. Open a profile to see their ticket size and portfolio, then send a pitch." />

      <div className="page-x flex flex-wrap items-start gap-8 pt-10">
        {/* ---------------- Filters ---------------- */}
        <form
          onSubmit={applyFilters}
          className="card flex w-full min-w-0 flex-[1_1_260px] flex-col gap-[18px] p-6 lg:max-w-[300px]"
        >
          <div className="text-lg font-semibold">Filters</div>
          <label className="lbl text-sm">
            Investor name
            <input className="fld" value={form.q} onChange={update('q')} placeholder="Investor or firm name" />
          </label>
          <label className="lbl text-sm">
            Industry
            <select className="fld" value={form.industry} onChange={update('industry')}>
              <option value="">All industries</option>
              {industries.map((i) => (
                <option key={i.industryno} value={i.industryno}>
                  {i.industryname}
                </option>
              ))}
            </select>
          </label>
          <label className="lbl text-sm">
            City
            <select className="fld" value={form.city} onChange={update('city')}>
              <option value="">Any city</option>
              {cities.map((c) => (
                <option key={c.cityno} value={c.cityno}>
                  {c.cityname}
                </option>
              ))}
            </select>
          </label>
          <label className="lbl text-sm">
            Investor type
            <select className="fld" value={form.type} onChange={update('type')}>
              <option value="">All types</option>
              {INVESTOR_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <p className="m-0 text-[13px] text-muted">Only investors verified by an admin are listed.</p>
          <button type="submit" className="btn btn-blue w-full">
            Apply filters
          </button>
          <button type="button" className="btn btn-line w-full" onClick={clearFilters}>
            Clear all
          </button>
        </form>

        {/* ---------------- Results ---------------- */}
        <div className="min-w-0 flex-[999_1_560px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-muted" aria-live="polite">
              {status === 'done' &&
                (total === 0 ? 'No investors found' : `Showing ${firstShown} to ${lastShown} of ${total} investors`)}
            </div>
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              Sort by
              <select className="fld w-auto" value={filters.sort} onChange={changeSort}>
                {Object.entries(SORTS).map(([value, sort]) => (
                  <option key={value} value={value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status === 'loading' && <Loading text="Loading investors..." />}
          {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}
          {status === 'done' && rows.length === 0 && (
            <EmptyState
              title="No investors found"
              text={
                hasFilters
                  ? 'No investor matches these filters. Try removing a filter or searching for a different name.'
                  : 'No verified investors yet. Investors appear here after an admin verifies their profile.'
              }
              action={
                hasFilters && (
                  <button type="button" className="btn btn-line" onClick={clearFilters}>
                    Clear filters
                  </button>
                )
              }
            />
          )}
          {status === 'done' && rows.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-5">
              {rows.map((investor) => (
                <InvestorCard key={investor.investorno} investor={investor} />
              ))}
            </div>
          )}

          {status === 'done' && <Pagination page={filters.page} pageCount={pageCount} onGo={goToPage} />}
        </div>
      </div>
    </>
  )
}

// One investor card. Shows the first two industries as chips.
function InvestorCard({ investor }) {
  const tags = investor.industries ? investor.industries.split(', ').slice(0, 2) : []

  return (
    <Link to={`/investors/${investor.investorno}`} className="card card-hover flex flex-col gap-3.5 p-6">
      <div className="flex items-center gap-3.5">
        <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-primary">
          {initialOf(investor.investorname)}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-text">{investor.investorname}</div>
          <div className="text-sm text-muted">
            {investor.investortype}
            {investor.cityname ? ` · ${investor.cityname}` : ''}
          </div>
        </div>
      </div>
      <div className="text-[15px] leading-normal text-ink-soft">{investor.bio}</div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="chip chip-sky">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex justify-between gap-3 border-t border-line pt-3.5 text-sm text-muted">
        <span>
          Typical ticket <b className="text-ink">{formatTicket(investor.minticketusd, investor.maxticketusd)}</b>
        </span>
        <span>
          {investor.investmentcount} {investor.investmentcount === 1 ? 'investment' : 'investments'}
        </span>
      </div>
    </Link>
  )
}
