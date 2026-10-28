// Loading, error, empty and welcome states, shared by every screen.
// dark = true for use on the dark background.

export function Loading({ text = 'Loading...', dark = false }) {
  return (
    <div role="status" className={`flex items-center gap-3 py-8 ${dark ? 'text-muted-dark' : 'text-muted'}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {text}
    </div>
  )
}

// `message` should already be friendly text (see lib/errors.js).
export function ErrorBox({ message, onRetry }) {
  return (
    <div role="alert" className="alert-error flex flex-wrap items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-sm btn-line">
          Try again
        </button>
      )}
    </div>
  )
}

// Tell the user what is missing AND what to do next: pass the next step
// as `action` (a button or link).
export function EmptyState({ title, text, action, dark = false }) {
  return (
    <div
      className={`rounded-[14px] border border-dashed px-6 py-10 text-center ${
        dark ? 'border-[#334155] text-muted-dark' : 'border-line-strong bg-surface text-muted'
      }`}
    >
      <div className={`text-lg font-semibold ${dark ? 'text-white' : 'text-text'}`}>{title}</div>
      {text && <p className="mx-auto mt-2 mb-0 max-w-md">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

// Friendly getting-started box shown at the top of a role's first screen.
// `steps` is an optional list of short strings shown as a numbered list.
export function WelcomeBox({ title, text, steps = [], action }) {
  return (
    <section className="rounded-[14px] border border-[#BFDBFE] bg-primary-soft p-6 sm:p-8">
      <h2 className="m-0 text-xl font-bold text-text">{title}</h2>
      {text && <p className="mt-2 mb-0 max-w-3xl text-ink-soft">{text}</p>}
      {steps.length > 0 && (
        <ol className={`mt-5 mb-0 grid list-none gap-4 p-0 ${steps.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-[15px] text-ink-soft">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}
