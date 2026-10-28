// "How it works" steps and "Features" grid. Used on Home and on the
// /how-it-works page so the wording stays the same in both places.
import { Link } from 'react-router'

const FOUNDER_STEPS = [
  ['Create your account', 'Sign up free and choose the Founder role.'],
  ['List your startup', 'Add your name, city, industry and stage. Add your team and past funding rounds when you are ready.'],
  ['Find the right investors', 'Filter investors by industry, ticket size and city, and see what they have backed before.'],
  ['Send a pitch and track it', 'Send one short message. You will see whether the investor has accepted or declined.'],
]

const INVESTOR_STEPS = [
  ['Create your account', 'Sign up free and choose the Investor role.'],
  ['Build your profile', 'Describe what you back: industries, ticket size and city. An admin verifies your profile.'],
  ['Discover startups', 'Search and filter startups, read their funding history and save the ones you like to your watchlist.'],
  ['Review pitches', 'Accept or decline pitches from founders in one inbox, and record your investments.'],
]

export const FEATURES = [
  ['Search and filters', 'Find startups by name, industry, city, stage and total funding.'],
  ['Funding timeline', 'See every funding round of a startup in date order, with amounts and investors.'],
  ['Investor profiles', 'Read what each investor backs, their ticket size and the companies in their portfolio.'],
  ['Pitch requests', 'Founders send a pitch to an investor and follow its status: Pending, Accepted or Declined.'],
  ['Watchlist', 'Save startups you want to follow and come back to them in one place.'],
  ['Funding dashboard', 'See total funding by industry and year, the most active investors and the biggest rounds.'],
]

function StepList({ title, steps }) {
  return (
    <div className="card p-6 sm:p-8">
      <h3 className="m-0 mb-6 text-xl font-bold text-text">{title}</h3>
      <ol className="m-0 flex list-none flex-col gap-5 p-0">
        {steps.map(([heading, text], index) => (
          <li key={heading} className="flex items-start gap-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-base font-bold text-white">
              {index + 1}
            </span>
            <div>
              <div className="font-semibold text-text">{heading}</div>
              <p className="m-0 mt-1 text-[15px] leading-relaxed text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function HowItWorks({ heading = 'How it works', id }) {
  return (
    <section id={id} className="page-x section-y">
      <div className="eyebrow">How it works</div>
      <h2 className="m-0 mt-2 mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h2>
      <p className="m-0 mb-10 max-w-2xl text-lg text-muted">
        Whether you are raising money or investing it, you can get started in a few minutes.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <StepList title="For founders" steps={FOUNDER_STEPS} />
        <StepList title="For investors" steps={INVESTOR_STEPS} />
      </div>
    </section>
  )
}

export function Features({ id }) {
  return (
    <section id={id} className="border-y border-border bg-surface">
      <div className="page-x section-y">
        <div className="eyebrow">Features</div>
        <h2 className="m-0 mt-2 mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything in one place</h2>
        <p className="m-0 mb-10 max-w-2xl text-lg text-muted">
          Tools to research the market, build relationships and keep track of what matters to you.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
          {FEATURES.map(([title, text], index) => (
            <div key={title} className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-base font-bold text-primary">
                {index + 1}
              </div>
              <h3 className="m-0 mt-4 mb-2 text-lg font-semibold">{title}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Dark closing banner with the two main buttons.
export function JoinBanner({ joinTo = '/login' }) {
  return (
    <section className="on-dark page-x">
      <div className="rounded-2xl bg-dark px-6 py-12 text-center text-white sm:px-12 sm:py-16">
        <h2 className="m-0 text-3xl font-bold tracking-tight">Ready to get started?</h2>
        <p className="mx-auto mt-3 mb-8 max-w-xl text-lg text-muted-dark">
          Browse the database for free, or create an account to list a startup or build an investor profile.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/startups" className="btn btn-lg btn-blue">
            Explore startups
          </Link>
          <Link to={joinTo} className="btn btn-lg btn-line-dark">
            Join as a founder or investor
          </Link>
        </div>
      </div>
    </section>
  )
}
