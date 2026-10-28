// Previous, up to 5 page numbers around the current page, Next.
export default function Pagination({ page, pageCount, onGo }) {
  if (pageCount <= 1) return null

  const start = Math.max(1, Math.min(page - 2, pageCount - 4))
  const end = Math.min(pageCount, start + 4)
  const pages = []
  for (let p = start; p <= end; p += 1) pages.push(p)

  return (
    <nav aria-label="Pages" className="mt-11 flex flex-wrap justify-center gap-3">
      <button type="button" className="btn btn-sm btn-line" disabled={page === 1} onClick={() => onGo(page - 1)}>
        Previous
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onGo(p)}
          className={`btn btn-sm ${p === page ? 'bg-primary text-white' : 'btn-line'}`}
        >
          {p}
        </button>
      ))}
      <button type="button" className="btn btn-sm btn-line" disabled={page === pageCount} onClick={() => onGo(page + 1)}>
        Next
      </button>
    </nav>
  )
}
