// Title band under the header: heading plus a short subtitle that says
// what the page is for and what the user can do on it.
export default function PageHeader({ title, subtitle, breadcrumb, action, children }) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="page-x py-10">
        {breadcrumb && <div className="mb-3 text-sm text-muted [&_a]:text-primary [&_a]:hover:underline">{breadcrumb}</div>}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <h1 className="m-0 text-3xl font-bold tracking-tight text-text sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-3 mb-0 max-w-3xl text-base text-muted sm:text-lg">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  )
}
