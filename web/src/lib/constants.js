// Fixed lists that match the CHECK constraints in 001_schema.sql.

// Roles a user may pick when signing up. 'Admin' is NOT here on
// purpose; the database trigger handle_new_user also rejects it.
export const SIGNUP_ROLES = ['Founder', 'Investor']

export const INVESTOR_TYPES = ['Angel', 'VC Firm', 'Corporate', 'Accelerator', 'Individual']

export const STAGES =['Idea', 'Pre-Seed', 'Seed', 'Series A', 'Series B+', 'Growth']

// Same list as the CHECK constraint ck_round_type on FundingRound.
export const ROUND_TYPES = [
  'Angel', 'Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+',
  'Venture', 'Debt', 'Grant', 'Private Equity', 'Other',
]

// Funding filter options. min is inclusive, max is exclusive.
export const FUNDING_RANGES = [
  { value: 'under500k', label: 'Under $500K', max: 500000 },
  { value: '500k-5m', label: '$500K to $5M', min: 500000, max: 5000000 },
  { value: 'over5m', label: 'Over $5M', min: 5000000 },
]

// Where each role lands after logging in.
export const HOME_BY_ROLE = {
  Founder: '/founder/startups',
  Investor: '/investor/profile',
  Admin: '/admin',
}
