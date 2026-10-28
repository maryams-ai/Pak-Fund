// Small helpers that turn database values into text for the screen.

// 1400000 -> "$1.4M", 450000 -> "$450K", 0 -> "$0", null -> "Undisclosed"
export function formatUsd(amount) {
  if (amount === null || amount === undefined) return 'Undisclosed'
  const n = Number(amount)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

// Investor ticket range: "$100K to $1M", "From $25K", "Up to $80K"
export function formatTicket(min, max) {
  if (min != null && max != null) return `${formatUsd(min)} to ${formatUsd(max)}`
  if (min != null) return `From ${formatUsd(min)}`
  if (max != null) return `Up to ${formatUsd(max)}`
  return 'Not set'
}

// "https://www.rozgarpay.example/" -> "rozgarpay.example"
export function shortUrl(url) {
  return (url ?? '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

// "2024-03-10" -> "Mar 2024"
export function formatMonthYear(dateText) {
  if (!dateText) return ''
  const date = new Date(`${dateText}T00:00:00`)
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

// "2025-10-08T11:30:00+05:00" or "2025-10-08" -> "8 Oct 2025"
export function formatDate(dateText) {
  if (!dateText) return ''
  const date = dateText.length === 10 ? new Date(`${dateText}T00:00:00`) : new Date(dateText)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// First letter of a name, used for the square logo placeholder.
export function initialOf(name) {
  return (name ?? '?').trim().charAt(0).toUpperCase()
}
