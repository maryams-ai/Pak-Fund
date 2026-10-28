// White header. The links depend on the role; on phones they collapse
// behind a "Menu" button.
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { APP_NAME } from '../config'
import { HOME_BY_ROLE } from '../lib/constants'

// Menu links per role: [path, label]
const PUBLIC_LINKS = [
  ['/startups', 'Browse startups'],
  ['/investors', 'Find investors'],
  ['/dashboard', 'Funding dashboard'],
  ['/how-it-works', 'How it works'],
]

const LINKS = {
  visitor: PUBLIC_LINKS,
  Founder: [
    ['/startups', 'Browse startups'],
    ['/investors', 'Find investors'],
    ['/dashboard', 'Funding dashboard'],
    ['/founder/startups', 'My startups'],
    ['/founder/pitch', 'Pitch requests'],
  ],
  Investor: [
    ['/startups', 'Browse startups'],
    ['/dashboard', 'Funding dashboard'],
    ['/watchlist', 'Watchlist'],
    ['/investor/inbox', 'Pitch inbox'],
    ['/investor/profile', 'My profile'],
  ],
  Admin: [
    ['/startups', 'Browse startups'],
    ['/investors', 'Find investors'],
    ['/dashboard', 'Funding dashboard'],
    ['/admin', 'Admin panel'],
  ],
}

// Active link gets a blue underline and darker text.
function menuClass({ isActive }) {
  return `block whitespace-nowrap rounded-md px-1 py-2 text-[15px] font-medium transition-colors lg:border-b-2 lg:rounded-none ${
    isActive
      ? 'border-primary text-primary lg:border-primary'
      : 'border-transparent text-ink-soft hover:text-text'
  }`
}

export default function TopBar() {
  const { user, profile, role, logOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const links = LINKS[role] ?? LINKS.visitor
  const close = () => setOpen(false)

  async function handleLogOut() {
    close()
    await logOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="page-x flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-8 xl:gap-10">
          <Link to="/" onClick={close} className="text-[22px] font-extrabold tracking-tight text-text">
            {APP_NAME}
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-5 xl:gap-7 lg:flex">
            {links.map(([path, label]) => (
              <NavLink key={path} to={path} className={menuClass}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <UserMenu profile={profile} role={role} onLogOut={handleLogOut} />
          ) : (
            <>
              <Link to="/login?mode=login" className="btn btn-sm btn-line">
                Log in
              </Link>
              <Link to="/login" className="btn btn-sm btn-blue">
                Sign up free
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn-sm btn-line lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="page-x border-t border-border pt-2 pb-5 lg:hidden">
          <nav aria-label="Main" className="flex flex-col">
            {links.map(([path, label]) => (
              <NavLink key={path} to={path} className={menuClass} onClick={close}>
                {label}
              </NavLink>
            ))}
            {user && role === 'Founder' && (
              <NavLink to="/watchlist" className={menuClass} onClick={close}>
                Watchlist
              </NavLink>
            )}
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <span className="text-[15px] font-medium text-ink-soft">{profile.fullname}</span>
                <span className="chip chip-sky">{role}</span>
                <button type="button" onClick={handleLogOut} className="btn btn-sm btn-line">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login?mode=login" onClick={close} className="btn btn-sm btn-line">
                  Log in
                </Link>
                <Link to="/login" onClick={close} className="btn btn-sm btn-blue">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

// Avatar button with a dropdown: who you are, your workspace, watchlist, log out.
function UserMenu({ profile, role, onLogOut }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = profile?.fullname ?? 'Account'
  const itemClass =
    'block w-full cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-[15px] font-medium text-ink-soft hover:bg-background hover:text-text'

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 hover:border-line-strong"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate text-[14px] font-semibold text-text">{name.split(' ')[0]}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
          <div className="border-b border-border px-3 pt-2 pb-3">
            <div className="truncate font-semibold text-text">{name}</div>
            <span className="chip chip-sky mt-1.5">{role}</span>
          </div>
          <div className="pt-2">
            <Link to={HOME_BY_ROLE[role] ?? '/'} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              My workspace
            </Link>
            {(role === 'Founder' || role === 'Investor') && (
              <Link to="/watchlist" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
                Watchlist
              </Link>
            )}
            <button type="button" role="menuitem" onClick={onLogOut} className={`${itemClass} text-danger-ink hover:text-danger-ink`}>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
