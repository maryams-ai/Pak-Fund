// Startup list (screen 2).
//
// Data: view v_startup_directory (approved startups with city, industry
// and total funding already joined), 9 per page.
// Filters, sort and page number live in the URL (?q=pay&stage=Seed&page=2)
// so the Home search can link here and a filtered list can be shared.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLookups } from '../hooks/useLookups'
import { useSavedStartups } from '../hooks/useSavedStartups'
import { FUNDING_RANGES, STAGES } from '../lib/constants'
import { escapeLike } from '../lib/search'
import { friendlyError } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import StartupCard from '../components/StartupCard'
import SaveButton from '../components/SaveButton'
import Pagination from '../components/Pagination'
import { EmptyState, ErrorBox, Loading } from '../components/Status'

const PAGE_SIZE = 9

const SORTS = {
  funded: { label: 'Most funded', column: 'totalfundingusd', ascending: false },
  newest: { label: 'Newest', column: 'foundedyear', ascending: false },
  name: { label: 'Name A to Z', column: 'startupname', ascending: true },
}

const EMPTY_FILTERS = { q: '', industry: '', city: '', stage: '', funding: '' }

// Read the filters from the URL.
function readFilters(params) {
  return {
    q: params.get('q') ?? '',
    industry: params.get('industry') ?? '',
    city: params.get('city') ?? '',
    stage: params.get('stage') ?? '',
    funding: params.get('funding') ?? '',
    sort: SORTS[params.get('sort')] ? params.get('sort') : 'funded',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

// Build the URL query from filters, leaving out empty values and defaults.
function toParams(filters) {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'sort' && value === 'funded') return
    if (key === 'page' && value === 1) return
    if (String(value).trim() !== '') params[key] = String(value).trim()
  })
  return params
}

// Build the Supabase query for the current filters.
function buildQuery(filters) {
  let query = supabase
    .from('v_startup_directory')
    .select('startupno, startupname, tagline, cityname, industryname, stage, totalfundingusd', { count: 'exact' })

  if (filters.q) query = query.ilike('startupname', `%${escapeLike(filters.q)}%`)
  if (filters.industry) query = query.eq('industryno', filters.industry)
  if (filters.city) query = query.eq('cityno', filters.city)
  if (filters.stage) query = query.eq('stage', filters.stage)

  const range = FUNDING_RANGES.find((r) => r.value === filters.funding)
  if (range?.min !== undefined) query = query.gte('totalfundingusd', range.min)
  if (range?.max !== undefined) query = query.lt('totalfundingusd', range.max)

  const sort = SORTS[filters.sort]
  query = query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order('startupno', { ascending: true }) // tie-breaker so pages never overlap

  const from = (filters.page - 1) * PAGE_SIZE
  return query.range(from, from + PAGE_SIZE - 1)
}

export default function StartupList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsText = searchParams.toString()
  const filters = readFilters(searchParams)
  const { cities, industries } = useLookups()
  const savedIds = useSavedStartups()

  // The form keeps its own copy, so typing does not reload the list.
  // "Apply" copies it into the URL, and that triggers the reload.
  const [form, setForm] = useState({ ...EMPTY_FILTERS, ...filters })
  useEffect(() => {
    setForm({ ...EMPTY_FILTERS, ...readFilters(new URLSearchParams(paramsText)) })
  }, [paramsText])

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'done'
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  // Load the list whenever the URL (filters, sort, page) changes.
  useEffect(() => {
    let cancelled = false
    const current = readFilters(new URLSearchParams(paramsText))
    setStatus('loading')

    buildQuery(current).then(({ data, count, error: queryError }) => {
      if (cancelled) return
      if (queryError) {
        // Page number past the end (e.g. after a new filter): go to page 1.
        if (queryError.code === 'PGRST103' && current.page > 1) {
          setSearchParams(toParams({ ...current, page: 1 }), { replace: true })
          return
        }
        setError(friendlyError(queryError, 'load startups'))
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
  const hasFilters = ['q', 'industry', 'city', 'stage', 'funding'].some((key) => filters[key])

  return (
    <>
      <PageHeader
        title="Startups"
        subtitle="Browse every approved startup. Narrow the list by industry, city, stage or funding, then open a startup to see its team and funding history."
      />

      <div className="page-x pt-7">
        {/* ---------------- Filters ---------------- */}
        <form
          onSubmit={applyFilters}
          className="card flex flex-wrap items-end gap-4 p-5 sm:p-6"
        >
          <label className="lbl flex-[2_1_220px]">
            Startup name
            <input className="fld" value={form.q} onChange={update('q')} placeholder="For example: payments" />
          </label>
          <label className="lbl flex-[1_1_150px]">
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
          <label className="lbl flex-[1_1_130px]">
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
          <label className="lbl flex-[1_1_130px]">
            Stage
            <select className="fld" value={form.stage} onChange={update('stage')}>
              <option value="">Any stage</option>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="lbl flex-[1_1_150px]">
            Total funding
            <select className="fld" value={form.funding} onChange={update('funding')}>
              <option value="">Any amount</option>
              {FUNDING_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn btn-blue">
              Apply filters
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-line" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </form>

        {/* ---------------- Count + sort ---------------- */}
        <div className="mt-7 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-muted" aria-live="polite">
            {status === 'done' &&
              (total === 0 ? 'No startups found' : `Showing ${firstShown} to ${lastShown} of ${total} startups`)}
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

        {/* ---------------- Results ---------------- */}
        {status === 'loading' && <Loading text="Loading startups..." />}
        {status === 'error' && <ErrorBox message={error} onRetry={() => setAttempt((n) => n + 1)} />}
        {status === 'done' && rows.length === 0 && (
          <EmptyState
            title="No startups found"
            text={
              hasFilters
                ? 'No startup matches these filters. Try removing a filter or searching for a different name.'
                : 'No approved startups yet. Founders can list the first one.'
            }
            action={
              hasFilters ? (
                <button type="button" className="btn btn-line" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <Link to="/founder/startups/new" className="btn btn-blue">
                  List your startup
                </Link>
              )
            }
          />
        )}
        {status === 'done' && rows.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-6">
            {rows.map((startup) => (
              <StartupCard
                key={startup.startupno}
                startup={startup}
                action={<SaveButton startupNo={startup.startupno} alreadySaved={savedIds.has(startup.startupno)} />}
              />
            ))}
          </div>
        )}

        {/* ---------------- Pages ---------------- */}
        {status === 'done' && pageCount > 1 && (
          <Pagination page={filters.page} pageCount={pageCount} onGo={goToPage} />
        )}
      </div>
    </>
  )
}
