// Shown by ProtectedRoute when a logged-in user opens a page for
// another role (e.g. an Investor opens /admin).
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { HOME_BY_ROLE } from '../lib/constants'

export default function NotAllowed({ allowedRoles }) {
  const { role } = useAuth()

  return (
    <div className="page-x pt-16">
      <div className="card mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="text-sm font-bold tracking-[0.14em] text-muted">NOT ALLOWED</div>
        <h1 className="mt-3 mb-3 text-3xl font-bold">This page is not available for your account.</h1>
        <p className="m-0 text-ink-soft">
          This page is only for <b>{allowedRoles.join(' or ')}</b> accounts. You are logged in as <b>{role}</b>.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn btn-line">
            Go to home
          </Link>
          <Link to={HOME_BY_ROLE[role] ?? '/'} className="btn btn-blue">
            Go to my area
          </Link>
        </div>
      </div>
    </div>
  )
}
