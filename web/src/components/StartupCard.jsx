// One startup card (Home "Featured startups" and the Startup list).
// `startup` is a row from the view v_startup_directory, so the field
// names are lowercase, exactly as Postgres returns them.
// `action` is an optional button in the bottom-right (e.g. Save).
import { Link } from 'react-router'
import { formatUsd, initialOf } from '../lib/format'

export default function StartupCard({ startup, action }) {
  return (
    <div className="card card-hover flex flex-col gap-4 p-6">
      <Link to={`/startups/${startup.startupno}`} className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary-soft text-xl font-bold text-primary">
          {initialOf(startup.startupname)}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-text">{startup.startupname}</div>
          <div className="text-sm text-muted">{startup.cityname}</div>
        </div>
      </Link>

      <div className="min-h-12 leading-normal text-ink-soft">{startup.tagline}</div>

      <div className="flex flex-wrap gap-2">
        <span className="chip chip-sky">{startup.industryname}</span>
        <span className="chip chip-plain">{startup.stage}</span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          <div className="text-[13px] text-muted">Total funding</div>
          <div className="text-[19px] font-bold">{formatUsd(startup.totalfundingusd)}</div>
        </div>
        {action}
      </div>
    </div>
  )
}
