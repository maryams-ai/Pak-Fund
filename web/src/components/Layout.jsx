// Frame around every page except Login: header, the page, footer.
// <Outlet /> is where react-router puts the current page.
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import TopBar from './TopBar'
import { APP_NAME } from '../config'

export default function Layout() {
  const { pathname, hash } = useLocation()

  // Each page starts at the top, or at the section named in the link (#features).
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <footer className="on-dark bg-dark text-muted-dark">
        <div className="page-x grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="text-[22px] font-extrabold tracking-tight text-white">{APP_NAME}</div>
            <p className="mt-3 mb-0 max-w-sm text-[15px] leading-relaxed">
              Pakistan's startup funding database: discover startups, track funding rounds, connect founders and
              investors.
            </p>
          </div>
          <FooterColumn
            title="Explore"
            links={[
              ['/startups', 'Browse startups'],
              ['/investors', 'Find investors'],
              ['/dashboard', 'Funding dashboard'],
            ]}
          />
          <FooterColumn
            title="About"
            links={[
              ['/how-it-works', 'How it works'],
              ['/how-it-works#features', 'Features'],
              ['/how-it-works#about', 'About'],
            ]}
          />
          <FooterColumn
            title="Account"
            links={[
              ['/login?mode=login', 'Log in'],
              ['/login', 'Sign up'],
            ]}
          />
        </div>
        <div className="page-x border-t border-navy-line py-5 text-sm">
          © {new Date().getFullYear()} {APP_NAME}. Sample data only. Funding figures are illustrative.
        </div>
      </footer>
    </div>
  )
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold tracking-wide text-white">{title}</div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
        {links.map(([to, label]) => (
          <li key={label}>
            <Link to={to} className="hover:text-white hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
