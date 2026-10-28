import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="page-x pt-16">
      <div className="card mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="text-sm font-bold tracking-[0.14em] text-muted">404</div>
        <h1 className="mt-3 mb-3 text-3xl font-bold">Page not found.</h1>
        <p className="m-0 text-ink-soft">The address may be wrong, or the page was moved.</p>
        <Link to="/" className="btn btn-blue mt-7">
          Go to home
        </Link>
      </div>
    </div>
  )
}
