-- =====================================================================
-- Startup Funding Database (Pakistan)
-- 004_views_indexes.sql : reporting views and indexes
--
-- Run after 001, 002 (and optionally the seed).
--
-- WHY security_invoker = true ON EVERY VIEW
-- A normal Postgres view runs with the rights of its OWNER (postgres),
-- and postgres skips RLS. So a plain view over Startup would show
-- pending startups to everyone, even though the Startup table hides
-- them. With security_invoker = true the view runs with the rights of
-- the person ASKING, so the RLS policies from 002 still apply inside
-- the view. A visitor sees through the view exactly what they would
-- see in the table, never more.
--
-- Public views (list, search, dashboard, home page) also filter
-- isApproved / isVerified themselves. Without that, a logged-in founder
-- would see their own pending startup counted in the dashboard,
-- because RLS lets them see it.
-- =====================================================================


-- =====================================================================
-- PART A: VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. v_startup_total_funding
-- Total funding per startup = SUM of its rounds. It is calculated every
-- time, never stored, so it can never be out of date (no update
-- anomaly). LEFT JOIN + COALESCE: a startup with no rounds shows 0.
-- Not filtered on isApproved: RLS already decides which startups you
-- see (visitors: approved only; founders: also their own pending ones,
-- which the "My startups" screen needs).
-- ---------------------------------------------------------------------
create or replace view public.v_startup_total_funding
with (security_invoker = true) as
select s.startupNo,
       s.startupName,
       s.isApproved,
       count(r.roundNo)                    as roundCount,
       coalesce(sum(r.amountRaisedUsd), 0) as totalFundingUsd,
       max(r.roundDate)                    as lastRoundDate
from public.Startup s
left join public.FundingRound r on r.startupNo = s.startupNo
group by s.startupNo;


-- ---------------------------------------------------------------------
-- 2. v_startup_directory
-- One row per approved startup with everything a startup card needs:
-- name, tagline, city, industry, stage, status, total funding and the
-- date of the last round. Used by Home search and the Startup list.
-- Built on view 1 (a view can use another view).
-- ---------------------------------------------------------------------
create or replace view public.v_startup_directory
with (security_invoker = true) as
select s.startupNo,
       s.startupName,
       s.tagline,
       s.cityNo,
       c.cityName,
       c.province,
       s.industryNo,
       i.industryName,
       s.stage,
       s.status,
       s.foundedYear,
       s.teamSize,
       f.roundCount,
       f.totalFundingUsd,
       f.lastRoundDate
from public.Startup s
join public.City     c on c.cityNo     = s.cityNo
join public.Industry i on i.industryNo = s.industryNo
join public.v_startup_total_funding f on f.startupNo = s.startupNo
where s.isApproved;


-- ---------------------------------------------------------------------
-- 3. v_investor_summary
-- One row per verified investor for the Investor directory: type,
-- city, ticket range, number of investments, how many as lead, total
-- invested and the industries they back (as text for display, and as
-- an id array so the app can filter by industry).
-- Only investments in approved startups are counted. SUM skips NULL
-- (undisclosed) amounts, but COUNT(*) still counts that deal.
-- The two sub-queries are grouped separately so investments and
-- industries do not multiply each other in the join.
-- ---------------------------------------------------------------------
create or replace view public.v_investor_summary
with (security_invoker = true) as
select i.investorNo,
       i.investorName,
       i.investorType,
       i.cityNo,
       c.cityName,
       i.bio,
       i.minTicketUsd,
       i.maxTicketUsd,
       coalesce(p.investmentCount, 0)  as investmentCount,
       coalesce(p.leadCount, 0)        as leadCount,
       coalesce(p.totalInvestedUsd, 0) as totalInvestedUsd,
       ind.industries,
       ind.industryNos
from public.Investor i
left join public.City c on c.cityNo = i.cityNo
left join (
    select inv.investorNo,
           count(*)                               as investmentCount,
           count(*) filter (where inv.isLead)     as leadCount,
           sum(inv.amountUsd)                     as totalInvestedUsd
    from public.Investment inv
    join public.FundingRound r on r.roundNo   = inv.roundNo
    join public.Startup      s on s.startupNo = r.startupNo
    where s.isApproved
    group by inv.investorNo
) p on p.investorNo = i.investorNo
left join (
    select ii.investorNo,
           string_agg(x.industryName, ', ' order by x.industryName) as industries,
           array_agg(x.industryNo order by x.industryNo)            as industryNos
    from public.InvestorIndustry ii
    join public.Industry x on x.industryNo = ii.industryNo
    group by ii.investorNo
) ind on ind.investorNo = i.investorNo
where i.isVerified;


-- ---------------------------------------------------------------------
-- 4. v_investor_portfolio  (name from the brief)
-- One row per investment: which investor backed which startup, in
-- which round, how much and whether as lead. A join across five
-- tables. Used by Investor detail ("Portfolio") and Startup detail
-- ("Backed by"). Approved startups only.
-- ---------------------------------------------------------------------
create or replace view public.v_investor_portfolio
with (security_invoker = true) as
select inv.investmentNo,
       inv.investorNo,
       i.investorName,
       i.investorType,
       s.startupNo,
       s.startupName,
       ind.industryName,
       r.roundNo,
       r.roundType,
       r.roundDate,
       inv.amountUsd,
       inv.isLead
from public.Investment   inv
join public.Investor     i   on i.investorNo   = inv.investorNo
join public.FundingRound r   on r.roundNo      = inv.roundNo
join public.Startup      s   on s.startupNo    = r.startupNo
join public.Industry     ind on ind.industryNo = s.industryNo
where s.isApproved;


-- ---------------------------------------------------------------------
-- 5. v_pending_pitches  (name from the brief)
-- Pitches still waiting for an answer, with startup, investor and
-- sender names. No extra filter needed: RLS on PitchRequest means an
-- investor sees only pitches sent to them, a founder only the pitches
-- they sent, and a visitor nothing. Logged-in users only.
-- ---------------------------------------------------------------------
create or replace view public.v_pending_pitches
with (security_invoker = true) as
select p.requestNo,
       p.requestDate,
       p.userNo      as senderUserNo,
       pr.fullName   as senderName,
       p.startupNo,
       s.startupName,
       p.investorNo,
       i.investorName,
       p.message,
       p.status
from public.PitchRequest p
join public.Startup  s on s.startupNo  = p.startupNo
join public.Investor i on i.investorNo = p.investorNo
left join public.profiles pr on pr.userNo = p.userNo
where p.status = 'Pending';


-- ---------------------------------------------------------------------
-- 6. v_round_feed
-- Every round of an approved startup with its name, city and industry.
-- The app orders it by roundDate for the Home "Latest funding" strip
-- and by amountRaisedUsd for the Dashboard "Biggest rounds" table, so
-- those numbers also come from a view (brief section 9).
-- ---------------------------------------------------------------------
create or replace view public.v_round_feed
with (security_invoker = true) as
select r.roundNo,
       s.startupNo,
       s.startupName,
       c.cityName,
       i.industryName,
       r.roundType,
       r.roundDate,
       r.amountRaisedUsd,
       r.valuationUsd
from public.FundingRound r
join public.Startup  s on s.startupNo  = r.startupNo
join public.City     c on c.cityNo     = s.cityNo
join public.Industry i on i.industryNo = s.industryNo
where s.isApproved;


-- =====================================================================
-- Dashboard views (approved startups only, GROUP BY aggregations)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 7. v_funding_by_industry
-- Per industry: number of startups, number of rounds, total raised.
-- Starts from Industry with LEFT JOINs, so an industry with no funding
-- still appears with 0. count(DISTINCT startupNo) because the join to
-- rounds repeats each startup once per round.
-- ---------------------------------------------------------------------
create or replace view public.v_funding_by_industry
with (security_invoker = true) as
select ind.industryNo,
       ind.industryName,
       count(distinct s.startupNo)         as startupCount,
       count(r.roundNo)                    as roundCount,
       coalesce(sum(r.amountRaisedUsd), 0) as totalFundingUsd
from public.Industry ind
left join public.Startup s
       on s.industryNo = ind.industryNo and s.isApproved
left join public.FundingRound r
       on r.startupNo = s.startupNo
group by ind.industryNo, ind.industryName;


-- ---------------------------------------------------------------------
-- 8. v_industry_funding_by_year  (name from the brief)
-- Same totals split by industry AND year. The Dashboard year filter
-- uses it: where fundingYear = 2024.
-- ---------------------------------------------------------------------
create or replace view public.v_industry_funding_by_year
with (security_invoker = true) as
select ind.industryNo,
       ind.industryName,
       extract(year from r.roundDate)::int as fundingYear,
       count(*)                            as roundCount,
       sum(r.amountRaisedUsd)              as totalFundingUsd
from public.FundingRound r
join public.Startup  s   on s.startupNo   = r.startupNo
join public.Industry ind on ind.industryNo = s.industryNo
where s.isApproved
group by ind.industryNo, ind.industryName, extract(year from r.roundDate);


-- ---------------------------------------------------------------------
-- 9. v_funding_by_city
-- Per city: startups listed (Dashboard "Startups per city"), rounds and
-- total raised. LEFT JOINs keep cities with no startups (count 0).
-- ---------------------------------------------------------------------
create or replace view public.v_funding_by_city
with (security_invoker = true) as
select c.cityNo,
       c.cityName,
       c.province,
       count(distinct s.startupNo)         as startupCount,
       count(r.roundNo)                    as roundCount,
       coalesce(sum(r.amountRaisedUsd), 0) as totalFundingUsd
from public.City c
left join public.Startup s
       on s.cityNo = c.cityNo and s.isApproved
left join public.FundingRound r
       on r.startupNo = s.startupNo
group by c.cityNo, c.cityName, c.province;


-- ---------------------------------------------------------------------
-- 10. v_funding_by_year
-- Per year: rounds, total raised, average round and how many different
-- startups raised. Feeds the "Funding by year" chart and the KPI tiles
-- (sum the rows for "all years").
-- ---------------------------------------------------------------------
create or replace view public.v_funding_by_year
with (security_invoker = true) as
select extract(year from r.roundDate)::int as fundingYear,
       count(*)                            as roundCount,
       count(distinct r.startupNo)         as startupCount,
       sum(r.amountRaisedUsd)              as totalFundingUsd,
       round(avg(r.amountRaisedUsd), 2)    as avgRoundUsd
from public.FundingRound r
join public.Startup s on s.startupNo = r.startupNo
where s.isApproved
group by extract(year from r.roundDate);


-- ---------------------------------------------------------------------
-- 11. v_top_investors  (name from the brief)
-- Verified investors ranked by number of deals, then by amount. Built
-- on view 3. RANK() is a window function: equal scores share a rank.
-- The app takes the first five rows.
-- ---------------------------------------------------------------------
create or replace view public.v_top_investors
with (security_invoker = true) as
select investorNo,
       investorName,
       investorType,
       cityName,
       investmentCount,
       leadCount,
       totalInvestedUsd,
       rank() over (order by investmentCount desc, totalInvestedUsd desc) as activityRank
from public.v_investor_summary
where investmentCount > 0;


-- ---------------------------------------------------------------------
-- 12. v_startups_by_stage
-- Number of approved startups and their total funding per stage. The
-- stage list is written out with a sort order, so the chart always
-- shows Idea -> Growth in order, including stages with 0 startups.
-- ---------------------------------------------------------------------
create or replace view public.v_startups_by_stage
with (security_invoker = true) as
select st.stage,
       st.stageOrder,
       count(distinct s.startupNo)         as startupCount,
       coalesce(sum(r.amountRaisedUsd), 0) as totalFundingUsd
from (values ('Idea', 1), ('Pre-Seed', 2), ('Seed', 3),
             ('Series A', 4), ('Series B+', 5), ('Growth', 6)) as st (stage, stageOrder)
left join public.Startup s
       on s.stage = st.stage and s.isApproved
left join public.FundingRound r
       on r.startupNo = s.startupNo
group by st.stage, st.stageOrder;


-- ---------------------------------------------------------------------
-- Who may read the views. The view itself adds no rights: because of
-- security_invoker, RLS on the tables underneath still decides.
-- ---------------------------------------------------------------------
grant select on
    public.v_startup_total_funding,
    public.v_startup_directory,
    public.v_investor_summary,
    public.v_investor_portfolio,
    public.v_round_feed,
    public.v_funding_by_industry,
    public.v_industry_funding_by_year,
    public.v_funding_by_city,
    public.v_funding_by_year,
    public.v_top_investors,
    public.v_startups_by_stage
to anon, authenticated;

revoke all on public.v_pending_pitches from anon;
grant select on public.v_pending_pitches to authenticated;


-- =====================================================================
-- PART B: INDEXES
-- An index is like the index at the back of a book: Postgres jumps to
-- the matching rows instead of reading the whole table (Seq Scan).
-- PRIMARY KEY and UNIQUE constraints already create an index; foreign
-- keys do NOT, so they are added here. Each index speeds up reads but
-- makes every insert/update a little slower, so only columns used in
-- joins, filters and sorting get one.
-- (Timing demo with and without indexes: supabase/perf/index_timing.sql)
-- =====================================================================

-- Trigram extension: lets an index help ILIKE '%text%' searches (it
-- splits names into 3-letter pieces). Supabase keeps extensions in the
-- "extensions" schema.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------- Startup --------------------------------
create index if not exists ix_startup_city        on public.Startup (cityNo);       -- FK, filter by city
create index if not exists ix_startup_industry    on public.Startup (industryNo);   -- FK, filter by industry
create index if not exists ix_startup_user        on public.Startup (userNo);       -- FK, "My startups", RLS owner check
create index if not exists ix_startup_stage       on public.Startup (stage);        -- filter by stage
create index if not exists ix_startup_name        on public.Startup (startupName);  -- exact match, sort A to Z
create index if not exists ix_startup_name_trgm   on public.Startup
    using gin (startupName extensions.gin_trgm_ops);                                -- search box: ILIKE '%pay%'

-- isApproved is true for almost every row, so a normal index on it
-- would rarely be used. A PARTIAL index stores only the few pending
-- rows: tiny, and exactly what the Admin review list asks for.
create index if not exists ix_startup_pending     on public.Startup (startupNo) where not isApproved;

-- ---------------------------- Investor -------------------------------
-- (userNo already has an index from its UNIQUE constraint)
create index if not exists ix_investor_city       on public.Investor (cityNo);      -- FK, filter by city
create index if not exists ix_investor_unverified on public.Investor (investorNo) where not isVerified;  -- Admin queue

-- ---------------------------- FundingRound ---------------------------
-- (startupNo, roundDate) serves the FK join AND the funding timeline,
-- which lists one startup's rounds by date.
create index if not exists ix_round_startup_date  on public.FundingRound (startupNo, roundDate);
create index if not exists ix_round_date          on public.FundingRound (roundDate);  -- year filters, latest rounds

-- ---------------------------- Investment -----------------------------
-- (roundNo is covered by UNIQUE (roundNo, investorNo), which starts with roundNo)
create index if not exists ix_investment_investor on public.Investment (investorNo);   -- FK, investor portfolio

-- ---------------------------- PitchRequest ---------------------------
create index if not exists ix_pitch_sender        on public.PitchRequest (userNo);                -- "Pitches you sent"
create index if not exists ix_pitch_investor      on public.PitchRequest (investorNo, status);    -- Inbox, pending first
create index if not exists ix_pitch_startup       on public.PitchRequest (startupNo);             -- FK, cascade deletes

-- ---------------------------- Junction tables ------------------------
-- A composite PK (a, b) only helps searches that start with a, so the
-- second column gets its own index.
create index if not exists ix_startupfounder_founder    on public.StartupFounder (founderNo);
create index if not exists ix_investorindustry_industry on public.InvestorIndustry (industryNo);
create index if not exists ix_watchlist_startup         on public.Watchlist (startupNo);

-- Refresh the planner's statistics so it chooses well between the
-- table scan and the new indexes.
analyze public.City, public.Industry, public.Investor, public.Startup,
        public.StartupFounder, public.FundingRound, public.Investment,
        public.PitchRequest, public.InvestorIndustry, public.Watchlist;
