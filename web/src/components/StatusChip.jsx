// Coloured status badge:
// green = good (Live, Accepted, Approved, Verified),
// amber = waiting (Pending, review), red = no (Declined),
// grey = anything else (Closed, Acquired).
const COLOURS = {
  green: 'badge-success',
  amber: 'badge-warning',
  red: 'badge-danger',
  grey: 'bg-page text-ink-soft border border-line',
}

const TONE_BY_STATUS = {
  Live: 'green',
  Approved: 'green',
  Verified: 'green',
  Accepted: 'green',
  Pending: 'amber',
  'Waiting for admin review': 'amber',
  Declined: 'red',
  Deactivated: 'red',
}

export default function StatusChip({ status }) {
  const tone = TONE_BY_STATUS[status] ?? 'grey'
  return <span className={`chip whitespace-nowrap ${COLOURS[tone]}`}>{status}</span>
}
