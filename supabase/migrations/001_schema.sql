-- =====================================================================
-- Startup Funding Database (Pakistan)
-- 001_schema.sql : tables and constraints (Supabase / PostgreSQL)
--
-- Order: parent tables first, child tables after, so every FOREIGN KEY
-- points at a table that already exists.
--
-- Naming: camelCase without quotes, same as the ERD. PostgreSQL stores
-- unquoted names in lowercase (cityNo is stored as cityno), so queries
-- may use either spelling.
--
-- Type mapping from the SQL Server ERD:
--   INT IDENTITY  -> bigint generated always as identity
--   NVARCHAR      -> text
--   BIT           -> boolean
--   DATETIME2     -> timestamptz
--   MONEY/DECIMAL -> numeric(14,2)   (all amounts in USD)
--   AppUser       -> profiles (id = auth.users.id, no passwordHash)
--
-- Enum-like columns use text + CHECK (... IN (...)).
-- Row Level Security is enabled in 002 (do not expose this schema
-- through the API before 002 is applied).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. City  (lookup)
-- One row per city. Startups and investors point here instead of
-- typing the city name again and again.
-- ---------------------------------------------------------------------
create table City (
    cityNo    bigint generated always as identity primary key,
    cityName  text not null,
    province  text,
    country   text not null default 'Pakistan',
    constraint uq_city_name unique nulls not distinct (cityName, province, country)
);


-- ---------------------------------------------------------------------
-- 2. Industry  (lookup)
-- List of sectors such as FinTech or AgriTech.
-- ---------------------------------------------------------------------
create table Industry (
    industryNo    bigint generated always as identity primary key,
    industryName  text not null,
    description   text,
    constraint uq_industry_name unique (industryName)
);


-- ---------------------------------------------------------------------
-- 3. profiles  (was AppUser in the ERD)
-- One row per person who signs up. Its id is the same uuid that
-- Supabase Auth gives the user, so login and profile are linked 1:1.
-- The password is kept by Supabase Auth, not here.
-- ---------------------------------------------------------------------
create table profiles (
    userNo     uuid primary key
               references auth.users (id) on delete cascade,
    fullName   text not null,
    email      text not null,
    role       text not null,
    phone      text,
    isActive   boolean not null default true,
    createdAt  timestamptz not null default now(),
    constraint uq_profiles_email unique (email),
    constraint ck_profiles_email check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint ck_profiles_role  check (role in ('Admin', 'Founder', 'Investor'))
);


-- ---------------------------------------------------------------------
-- 4. Investor
-- A person or firm that puts money into startups. It may be managed by
-- one app user (userNo), or have no user if an admin or the import
-- added it. One user can manage at most one investor profile (UNIQUE).
-- ---------------------------------------------------------------------
create table Investor (
    investorNo    bigint generated always as identity primary key,
    userNo        uuid
                  references profiles (userNo) on delete set null,
    cityNo        bigint
                  references City (cityNo) on delete restrict,
    investorName  text not null,
    investorType  text not null,
    bio           text,
    website       text,
    linkedinUrl   text,
    minTicketUsd  numeric(14,2),
    maxTicketUsd  numeric(14,2),
    isVerified    boolean not null default false,
    constraint uq_investor_user   unique (userNo),
    constraint ck_investor_type   check (investorType in
        ('Angel', 'VC Firm', 'Corporate', 'Accelerator', 'Individual')),
    constraint ck_investor_min    check (minTicketUsd > 0),
    constraint ck_investor_max    check (maxTicketUsd > 0),
    constraint ck_investor_ticket check (maxTicketUsd >= minTicketUsd)
);


-- ---------------------------------------------------------------------
-- 5. Startup
-- The main table: one row per company. It belongs to one city and one
-- industry, and records which user submitted it (NULL = added by an
-- admin or the import). Total funding is NOT stored here; a view adds
-- up FundingRound instead (no update anomalies).
-- isApproved: new listings stay hidden until an admin approves them.
-- ---------------------------------------------------------------------
create table Startup (
    startupNo    bigint generated always as identity primary key,
    cityNo       bigint not null
                 references City (cityNo) on delete restrict,
    industryNo   bigint not null
                 references Industry (industryNo) on delete restrict,
    userNo       uuid
                 references profiles (userNo) on delete set null,
    startupName  text not null,
    tagline      text,
    description  text,
    foundedYear  int,
    website      text,
    stage        text not null,
    status       text not null default 'Active',
    teamSize     int,
    isApproved   boolean not null default false,
    constraint ck_startup_tagline check (char_length(tagline) <= 90),
    constraint ck_startup_year    check (foundedYear between 1900 and 2100),
    constraint ck_startup_stage   check (stage in
        ('Idea', 'Pre-Seed', 'Seed', 'Series A', 'Series B+', 'Growth')),
    constraint ck_startup_status  check (status in ('Active', 'Acquired', 'Closed')),
    constraint ck_startup_team    check (teamSize > 0)
);


-- ---------------------------------------------------------------------
-- 6. Founder
-- A person who started or runs a startup. Kept separate from Startup
-- because one person can found several startups.
-- ---------------------------------------------------------------------
create table Founder (
    founderNo    bigint generated always as identity primary key,
    fullName     text not null,
    email        text,
    linkedinUrl  text,
    bio          text,
    constraint ck_founder_email check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);


-- ---------------------------------------------------------------------
-- 7. StartupFounder  (junction: Startup M:N Founder)
-- Links founders to startups and says what role each person has there.
-- The pair (startupNo, founderNo) is the primary key, so the same
-- person cannot be added twice to the same startup.
-- ---------------------------------------------------------------------
create table StartupFounder (
    startupNo   bigint not null
                references Startup (startupNo) on delete cascade,
    founderNo   bigint not null
                references Founder (founderNo) on delete cascade,
    roleTitle   text not null,
    joinedYear  int,
    constraint pk_startup_founder primary key (startupNo, founderNo),
    constraint ck_sf_joined_year  check (joinedYear between 1900 and 2100)
);


-- ---------------------------------------------------------------------
-- 8. FundingRound
-- One fundraising event of a startup (e.g. Seed, March 2024, $900K).
-- A startup has many rounds. Amounts must be positive; valuation may
-- be unknown (NULL = not disclosed).
-- ---------------------------------------------------------------------
create table FundingRound (
    roundNo          bigint generated always as identity primary key,
    startupNo        bigint not null
                     references Startup (startupNo) on delete cascade,
    roundType        text not null,
    roundDate        date not null,
    amountRaisedUsd  numeric(14,2) not null,
    valuationUsd     numeric(14,2),
    constraint ck_round_type      check (roundType in
        ('Angel', 'Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+',
         'Venture', 'Debt', 'Grant', 'Private Equity', 'Other')),
    constraint ck_round_amount    check (amountRaisedUsd > 0),
    constraint ck_round_valuation check (valuationUsd > 0)
);


-- ---------------------------------------------------------------------
-- 9. Investment
-- Which investor put money into which round, how much, and whether
-- they led it. UNIQUE (roundNo, investorNo): an investor appears only
-- once per round. amountUsd may be NULL when the amount is undisclosed.
-- ---------------------------------------------------------------------
create table Investment (
    investmentNo  bigint generated always as identity primary key,
    roundNo       bigint not null
                  references FundingRound (roundNo) on delete cascade,
    investorNo    bigint not null
                  references Investor (investorNo) on delete restrict,
    amountUsd     numeric(14,2),
    isLead        boolean not null default false,
    constraint uq_investment_round_investor unique (roundNo, investorNo),
    constraint ck_investment_amount         check (amountUsd > 0)
);


-- ---------------------------------------------------------------------
-- 10. Acquisition
-- Records that a startup was bought by another company. UNIQUE on
-- startupNo: a startup can be acquired at most once (0..1).
-- priceUsd may be NULL when the price was not made public.
-- ---------------------------------------------------------------------
create table Acquisition (
    acquisitionNo    bigint generated always as identity primary key,
    startupNo        bigint not null
                     references Startup (startupNo) on delete cascade,
    acquirerName     text not null,
    acquisitionDate  date not null,
    priceUsd         numeric(14,2),
    constraint uq_acquisition_startup unique (startupNo),
    constraint ck_acquisition_price   check (priceUsd > 0)
);


-- ---------------------------------------------------------------------
-- 11. PitchRequest
-- A founder (userNo) asks an investor to look at one of their startups.
-- Starts as Pending; the investor changes it to Accepted or Declined.
-- ---------------------------------------------------------------------
create table PitchRequest (
    requestNo    bigint generated always as identity primary key,
    userNo       uuid not null
                 references profiles (userNo) on delete cascade,
    investorNo   bigint not null
                 references Investor (investorNo) on delete cascade,
    startupNo    bigint not null
                 references Startup (startupNo) on delete cascade,
    message      text not null,
    status       text not null default 'Pending',
    requestDate  timestamptz not null default now(),
    constraint ck_pitch_message check (char_length(message) between 1 and 800),
    constraint ck_pitch_status  check (status in ('Pending', 'Accepted', 'Declined'))
);


-- ---------------------------------------------------------------------
-- 12. InvestorIndustry  (junction: Investor M:N Industry)
-- The sectors an investor likes to back. Composite primary key, so the
-- same industry cannot be ticked twice for one investor.
-- ---------------------------------------------------------------------
create table InvestorIndustry (
    investorNo  bigint not null
                references Investor (investorNo) on delete cascade,
    industryNo  bigint not null
                references Industry (industryNo) on delete restrict,
    constraint pk_investor_industry primary key (investorNo, industryNo)
);


-- ---------------------------------------------------------------------
-- 13. Watchlist  (junction: profiles M:N Startup)
-- Startups a user saved to follow. Composite primary key, so a user
-- can save the same startup only once.
-- ---------------------------------------------------------------------
create table Watchlist (
    userNo     uuid not null
               references profiles (userNo) on delete cascade,
    startupNo  bigint not null
               references Startup (startupNo) on delete cascade,
    savedAt    timestamptz not null default now(),
    constraint pk_watchlist primary key (userNo, startupNo)
);
