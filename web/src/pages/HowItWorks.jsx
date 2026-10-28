// /how-it-works: a plain explanation of what the site does, for first-time visitors.
// Static page, no database calls. The footer links to #features and #about.
import { Link } from 'react-router'
import { APP_NAME } from '../config'
import PageHeader from '../components/PageHeader'
import { Features, HowItWorks, JoinBanner } from '../components/InfoSections'
import { useAuth } from '../context/AuthContext'

export default function HowItWorksPage() {
  const { user } = useAuth()

  return (
    <>
      <PageHeader
        title="How it works"
        subtitle={`Learn what ${APP_NAME} does and how founders and investors use it, step by step.`}
      />

      <HowItWorks heading="Get started in four steps" />
      <Features id="features" />

      <section id="about" className="page-x section-y">
        <div className="eyebrow">About</div>
        <h2 className="m-0 mt-2 mb-3 text-3xl font-bold tracking-tight sm:text-4xl">About {APP_NAME}</h2>
        <div className="max-w-3xl space-y-4 text-lg leading-relaxed text-ink-soft">
          <p className="m-0">
            {APP_NAME} is Pakistan's startup funding database. It brings startups, funding rounds and investors into one
            place, so founders can find the right people to back them and investors can discover and follow promising
            companies.
          </p>
          <p className="m-0">
            Anyone can browse startups, investors and the funding dashboard without an account. Create a free account to
            list a startup, build an investor profile, save startups to a watchlist or send and receive pitches.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link to="/startups" className="btn btn-blue">
            Explore startups
          </Link>
          {!user && (
            <Link to="/login" className="btn btn-line">
              Create a free account
            </Link>
          )}
        </div>
      </section>

      <JoinBanner joinTo={user ? '/' : '/login'} />
    </>
  )
}
