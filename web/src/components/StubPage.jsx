// Placeholder used by the screens that are built in step 6.
// It already shows which tables and views the real screen will use.
import PageHeader from './PageHeader'

export default function StubPage({ title, subtitle, breadcrumb, uses = [] }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} breadcrumb={breadcrumb} />
      <div className="page-x pt-8">
        <div className="card max-w-2xl p-8">
          <span className="chip chip-sky">Coming soon</span>
          <p className="mt-4 mb-0 text-ink-soft">
            This page is not available yet. Please check back soon.
          </p>
          {uses.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-base font-semibold">Database objects it will use</h2>
              <ul className="m-0 flex flex-wrap gap-2 p-0">
                {uses.map((name) => (
                  <li key={name} className="chip chip-plain list-none font-mono">
                    {name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  )
}
