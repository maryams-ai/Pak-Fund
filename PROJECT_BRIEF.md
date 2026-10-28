# Startup Funding Database (Pakistan): Project Brief

Paste this whole file into a new Claude chat as the first message, then use Prompt A (design phase) or Prompt B (build phase) from the end of the file.

---

## 1. What this project is

A Crunchbase-style web app for the Pakistani startup ecosystem. It stores startups, founders, investors, funding rounds, individual investments and acquisitions, and lets people search, filter and read reports on top of that data.

- It is a university Database course project (BS AI, COMSATS Lahore) and will also be reused for a Web Technologies course, so it must be a complete, dynamic app with many screens.
- Pakistani focus: profiles of Pakistani investors, and a side for local startup founders to list their startups and pitch to investors.
- Reference product: Crunchbase (closest competitor). We keep its structure and search filters, and add an investor portfolio page, a funding dashboard and a pitch request flow.
- Planned dataset: Kaggle "Startup Investments (Crunchbase 2013 snapshot)" for volume (about 100k+ rows, needed to show index vs no-index query timing), plus manually added Pakistani startups and investors.
- Backend and database: **Supabase** (PostgreSQL, Auth, Row Level Security).
- Build tool: **Claude Code** inside VS Code. First step is design: screens, flows and UI.

## 2. Users and roles

| Role | Can do |
|---|---|
| Visitor (no login) | Search and browse startups, investors, dashboard |
| Founder | Sign up, submit startups, add team, add funding rounds, send pitch requests, save startups |
| Investor | Create investor profile, set industries and ticket size, browse startups, accept or decline pitches, record investments, save startups |
| Admin | Manage cities and industries, verify investor profiles, remove fake startups, record acquisitions, deactivate users |

## 3. Data model (13 tables)

Naming style: `...No` for ids (becomes `uuid` or `bigint` in Postgres, see section 7). PK = primary key, FK = foreign key, UQ = unique.

| Table | Columns |
|---|---|
| City | **cityNo** PK, cityName, province, country |
| Industry | **industryNo** PK, industryName, description |
| AppUser | **userNo** PK, fullName, email UQ, passwordHash, role (Admin/Founder/Investor), phone, isActive, createdAt |
| Investor | **investorNo** PK, userNo FK (nullable, UQ), cityNo FK (nullable), investorName, investorType (Angel/VC Firm/Corporate/Accelerator/Individual), bio, website, linkedinUrl, minTicketUsd, maxTicketUsd, isVerified |
| Startup | **startupNo** PK, cityNo FK, industryNo FK, userNo FK (submitted by), startupName, tagline, description, foundedYear, website, stage (Idea/Pre-Seed/Seed/Series A/Series B+/Growth), status (Active/Acquired/Closed), teamSize |
| Founder | **founderNo** PK, fullName, email, linkedinUrl, bio |
| StartupFounder | (startupNo FK, founderNo FK) composite PK, roleTitle, joinedYear |
| FundingRound | **roundNo** PK, startupNo FK, roundType, roundDate, amountRaisedUsd, valuationUsd |
| Investment | **investmentNo** PK, roundNo FK, investorNo FK, amountUsd, isLead; UQ(roundNo, investorNo) |
| Acquisition | **acquisitionNo** PK, startupNo FK (UQ), acquirerName, acquisitionDate, priceUsd |
| PitchRequest | **requestNo** PK, userNo FK (sender), investorNo FK, startupNo FK, message, status (Pending/Accepted/Declined), requestDate |
| InvestorIndustry | (investorNo FK, industryNo FK) composite PK |
| Watchlist | (userNo FK, startupNo FK) composite PK, savedAt |

Relationships (18 foreign keys): City to Startup, City to Investor (optional), Industry to Startup, Startup to FundingRound, FundingRound to Investment, Investor to Investment, Startup to Acquisition (0..1), AppUser to Startup (submits), AppUser to Investor (manages, 0..1), AppUser/Investor/Startup to PitchRequest, and the junction tables StartupFounder, InvestorIndustry, Watchlist.

Design rules already decided:
- A startup's total funding is **not stored**. It is computed by a view from FundingRound (avoids update anomalies, good normalization talking point).
- City and Industry are lookup tables so names are not repeated.
- Amounts are in USD.
- Tables are created parent first, child second.

## 4. Screens (14) and the tables each one uses

1. **Home / Search**: search bar, filters (industry, city, stage, funding range), featured startups. Tables: Startup, Industry, City.
2. **Startup list**: cards with name, tagline, industry, city, stage, total funding. Sort and paginate.
3. **Startup detail**: description, founders and roles, funding timeline, investors who backed it, similar startups, save button, "Send pitch" button. Tables: Startup, StartupFounder, Founder, FundingRound, Investment, Investor.
4. **Investor directory**: filter by industry, ticket size, city, type, verified only.
5. **Investor detail**: bio, ticket size, industries, portfolio (companies backed), contact via pitch. Tables: Investor, InvestorIndustry, Investment.
6. **Dashboard**: total funding by industry and year, most active investors, biggest rounds, startups per city. Powered by views.
7. **Sign up / Login**: role selection (Founder or Investor). Supabase Auth.
8. **Founder: my startups** and **Add / Edit startup** form.
9. **Founder: team and funding rounds** for a startup (add founders, add rounds).
10. **Pitch request**: pick investor, pick own startup, write message; list of sent pitches with status.
11. **Investor: my profile** (create and edit profile, pick industries).
12. **Investor: received pitches**: accept or decline, and record an investment into a round.
13. **Watchlist**: saved startups.
14. **Admin panel**: manage cities and industries, verify investors, moderate startups, record acquisitions, deactivate users.

## 5. Key user flows

- Visitor: Home, search, startup detail, investor detail, dashboard (no login).
- Founder: sign up, create startup, add team, add round, browse investors, send pitch, track status.
- Investor: sign up, create profile, browse startups, save to watchlist, accept or decline pitches, record investment.
- Admin: verify investor profiles, maintain lookup lists, handle acquisitions.

## 6. Database course requirements this must also show

- ERD and relational schema (already made).
- Normalization up to 3NF.
- Joins across five or six tables, GROUP BY aggregations.
- Views for common reports: `v_startup_total_funding`, `v_investor_portfolio`, `v_industry_funding_by_year`, `v_top_investors`, `v_pending_pitches`.
- Indexes on startupName, industryNo, stage, cityNo, roundDate, and a demo comparing query time with and without index on a table of 100k+ rows.
- Constraints: PK, FK, UNIQUE (email, Investor.userNo, Acquisition.startupNo, Investment(roundNo, investorNo)), CHECK (amounts positive, maxTicket >= minTicket, enum values), NOT NULL.

## 7. Moving from SQL Server style to Supabase (PostgreSQL)

The ERD was drawn in SQL Server style. For Supabase:
- `AppUser` becomes a `profiles` table whose id is the same uuid as `auth.users`. Supabase Auth stores the password, so **drop `passwordHash`**. Keep fullName, role, phone, isActive, createdAt.
- Types: INT IDENTITY becomes `bigint generated always as identity` (or `uuid` for user ids); NVARCHAR becomes `text`; BIT becomes `boolean`; DATETIME2 becomes `timestamptz`; MONEY or DECIMAL becomes `numeric(14,2)`.
- Enums (role, stage, status, roundType) as `text` with CHECK constraints, or Postgres enums.
- Turn on **Row Level Security** on every table. Public read for Startup, Investor (verified), FundingRound, Investment, lookups. Founders can write only their own startups, rounds and pitches. Investors can edit only their own profile and see only pitches addressed to them. Admin can do everything (role check via the profiles table).
- Views for reports; indexes after data is loaded.
- Keep the relational schema and ERD names so the viva documents still match.

## 8. Open decisions

- Frontend framework: recommended **React + Vite + Tailwind + supabase-js** (works well with Claude Code). Next.js is also fine. Flutter web is possible but less suited to a Web Technologies course.
- Whether sir requires SQL Server: if yes, keep the SQL Server script for the course and use Supabase only for the live app.
- Visual style: clean, professional, light theme with one accent colour, data-heavy but readable (tables, cards, charts). Responsive for mobile.

## 9. Design update (mockups are done)

The design phase is finished. 15 high-fidelity HTML mockups exist (put them in a `mockups/` folder next to this file). Build the React screens to match them.

- **App name:** placeholder "PakFund". Final name not chosen yet (options: Beej, Sarmaya, Uraan, Naya Qadam). Keep the name in one config constant so it can be changed in one place.
- **Style:** Crunchbase-inspired. Dark navy hero and footer, light sections, one electric-blue accent, gold for the main call-to-action. Font: Hanken Grotesk. Rounded cards (12 to 14px), thin borders, almost no shadows.
- **Colours:** navy `#10293A`, deep navy `#0A1E2C`, dark border `#1F3A4B`, blue `#1565FF`, light background `#F1F6FA`, light border `#D9E4EC`, ink `#0B1F2E`, muted text `#4A6272` (light pages) and `#B9C9D4` (dark pages), gold `#F8D08A`, sky chip `#D6EBFA`.
- **Buttons:** one shared style. 48px high, 10px radius, 28px side padding, 12 to 16px gap between buttons. Primary blue, secondary gold, outline for the rest, red outline for destructive actions (Remove, Deactivate). Small variant 40px.
- **Copy tone:** warm Roman Urdu for headings aimed at users (for example "Aapka idea, sahi investor tak."), plain English for labels and data.
- **Sample data in mockups is fictional** (Rozgar Pay, Ravi Ventures, etc.). Seed data in the database may use real Pakistani startups and investors, but amounts must come from real sources or be clearly marked as sample.

### The 15 screens (14 from section 4, plus Startup list and Team and rounds split out)

Public: 1 Home / Search, 2 Startup list, 3 Startup detail, 4 Investor directory, 5 Investor detail.
Account and dashboard: 6 Sign up / Log in (role: Founder or Investor), 7 Dashboard.
Founder: 8 My startups, 9 Add / Edit startup, 10 Team and funding rounds, 11 Send pitch (with list of sent pitches and status).
Investor: 12 My profile (with verification status), 13 Received pitches (Accept / Decline, record investment), 14 Watchlist.
Admin: 15 Admin panel (verify investors, review startups, cities, industries, acquisitions, deactivate users).

### What each main button does (for wiring to Supabase)

- Search and filters: query Startup / Investor with filters, join to City and Industry.
- Save: insert into Watchlist. Remove: delete from Watchlist.
- Send pitch: insert into PitchRequest with status Pending.
- Accept / Decline: update PitchRequest.status.
- Save investment: insert into Investment (UNIQUE roundNo + investorNo must show a friendly error on duplicate).
- Save and add team: insert Startup, then Founder and StartupFounder rows.
- Add round: insert into FundingRound (amounts must be positive).
- Verify / Reject: update Investor.isVerified. Approve / Remove: moderate Startup.
- Save acquisition: insert into Acquisition and set Startup.status to Acquired.
- Deactivate: set profiles.isActive to false.
- Dashboard numbers come only from the views in section 6, never from stored totals.

---

## Prompt A: design phase (screens and UI)

```
I am building a web app called "Startup Funding Database (Pakistan)", a Crunchbase-style platform for Pakistani startups and investors. The full project brief is pasted above.

Act as a senior product designer. Do the design phase only, no backend code yet.

1. Propose the information architecture and navigation (public pages, founder area, investor area, admin area).
2. Design all 14 screens from the brief. For each screen give: purpose, layout sections, the data fields shown, buttons and actions, empty and error states, and which tables it reads or writes.
3. Produce a clean, professional visual style: colour palette (one accent colour), typography, spacing, card and table styles, chart styles for the dashboard.
4. Build high-fidelity, responsive HTML/CSS mockups (use sample Pakistani startups, investors and cities such as Lahore, Karachi, Islamabad) for the most important screens first: Home/Search, Startup detail, Investor directory, Dashboard, and Founder "Add startup" form. Then the rest.
5. Keep the design implementable with React + Tailwind and a Supabase backend.

Work screen by screen and ask me before moving to the next group of screens.
```

## Prompt B: build phase (Claude Code, later)

```
Project: "Startup Funding Database (Pakistan)", a Crunchbase-style web app. The brief with the 13-table data model, roles and 14 screens is in PROJECT_BRIEF.md in this folder. Backend is Supabase (PostgreSQL, Auth, RLS). Frontend is React + Vite + Tailwind with supabase-js.

Work in this order and stop after each step for my review:
1. Write the SQL migration for all tables (parent tables first), with PK, FK, UNIQUE, CHECK and NOT NULL constraints, adapted for Supabase as described in section 7 of the brief.
2. Write RLS policies per role.
3. Write seed data: lookup tables, 30 Pakistani startups, 15 investors, rounds and investments. Then a script to bulk-load the Kaggle Crunchbase CSV for the indexing demo.
4. Create the reporting views and the indexes, plus a SQL file that compares query time with and without indexes.
5. Scaffold the React app, auth, routing and role-based layouts.
6. Build the screens one by one from the design files, connected to Supabase.
7. Add a README with setup steps and the list of SQL features for my viva.

Ask me before making any decision that changes the schema.
```
