// Guards a group of routes by role.
//
//   <Route element={<ProtectedRoute roles={['Founder']} />}> ... </Route>
//
// - still checking the login  -> show "loading"
// - not logged in             -> go to /login, then come back here
// - logged in, wrong role     -> friendly "not allowed" page
// - allowed                   -> show the page (<Outlet />)
//
// This only hides screens. The real protection is RLS in the database:
// even if someone skips this check, Supabase refuses the data.
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { Loading } from './Status'
import NotAllowed from '../pages/NotAllowed'

export default function ProtectedRoute({ roles }) {
  const { user, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading text="Checking your account..." />

  if (!user) {
    return <Navigate to="/login?mode=login" replace state={{ from: location.pathname + location.search }} />
  }

  if (!roles.includes(role)) return <NotAllowed allowedRoles={roles} />

  return <Outlet />
}
