-- =====================================================================
-- Startup Funding Database (Pakistan)
-- perf/index_timing.sql : query time WITHOUT vs WITH indexes
--
-- Run in the Supabase SQL editor (as postgres) AFTER 004, because the
-- name-search test uses the pg_trgm extension created there.
-- Takes about half a minute. The last statement prints the comparison.
--
-- It works on separate demo copies of the tables in their own schema
-- "perf", filled with 200,000 generated startups and 500,000 generated
-- rounds. Your real app tables are never touched, and the perf schema
-- is not exposed through the Supabase API. Remove it afterwards with:
--     drop schema perf cascade;
--
-- Steps:
--   1. Create perf.Startup and perf.FundingRound (primary keys only,
--      no other indexes) and fill them with generated rows.
--   2. Time six typical app queries: each runs once to warm the cache,
--      then 5 times; the average is stored.
--   3. Create the same indexes as 004 and time the queries again.
--   4. Show both times side by side with the speed-up.
-- Exact numbers change from run to run and machine to machine; the
-- difference between the two columns is what matters.
-- =====================================================================

set statement_timeout = '10min';

drop schema if exists perf cascade;
create schema perf;


-- ---------------------------------------------------------------------
-- 1. Demo tables and generated data
-- setseed makes random() give the same data on every run.
-- ---------------------------------------------------------------------
create table perf.Startup (
    startupNo    bigint primary key,
    startupName  text    not null,
    cityNo       int     not null,
    industryNo   int     not null,
    stage        text    not null,
    isApproved   boolean not null
);

create table perf.FundingRound (
    roundNo          bigint primary key,
    startupNo        bigint not null references perf.Startup (startupNo),
    roundType        text   not null,
    roundDate        date   not null,
    amountRaisedUsd  numeric(14,2) not null
);

select setseed(0.42);

-- 200,000 startups named 'Startup 000001' ... 'Startup 200000',
-- spread over 11 cities, 10 industries and 6 stages; 90% approved.
insert into perf.Startup (startupNo, startupName, cityNo, industryNo, stage, isApproved)
select n,
       'Startup ' || lpad(n::text, 6, '0'),
       1 + floor(random() * 11)::int,
       1 + floor(random() * 10)::int,
       (array['Idea', 'Pre-Seed', 'Seed', 'Series A', 'Series B+', 'Growth'])[1 + floor(random() * 6)::int],
       random() < 0.9
from generate_series(1, 200000) as n;

-- 500,000 rounds for random startups, dated 2014 to 2025,
-- between $10K and $5M each.
insert into perf.FundingRound (roundNo, startupNo, roundType, roundDate, amountRaisedUsd)
select n,
       1 + floor(random() * 200000)::bigint,
       (array['Angel', 'Pre-Seed', 'Seed', 'Series A', 'Series B'])[1 + floor(random() * 5)::int],
       date '2014-01-01' + floor(random() * 4383)::int,
       round((10000 + random() * 4990000)::numeric, -3)
from generate_series(1, 500000) as n;

analyze perf.Startup, perf.FundingRound;


-- ---------------------------------------------------------------------
-- 2. The test queries and a timing helper
-- Each query is the kind the app runs on the list, search, detail and
-- dashboard screens.
-- ---------------------------------------------------------------------
create table perf.demo_query (
    queryNo    int primary key,
    label      text not null,
    usesIndex  text not null,
    sqlText    text not null
);

insert into perf.demo_query values
    (1, 'Find a startup by exact name',
        'ix_perf_startup_name',
        $q$select * from perf.Startup where startupName = 'Startup 123456'$q$),
    (2, 'Search box: name contains "23456"',
        'ix_perf_startup_name_trgm',
        $q$select * from perf.Startup where startupName ilike '%23456%'$q$),
    (3, 'Filter: one city and one stage',
        'ix_perf_startup_city + ix_perf_startup_stage',
        $q$select * from perf.Startup where cityNo = 5 and stage = 'Growth'$q$),
    (4, 'Funding timeline of one startup',
        'ix_perf_round_startup_date',
        $q$select * from perf.FundingRound where startupNo = 123456 order by roundDate$q$),
    (5, 'Rounds in one month (March 2023)',
        'ix_perf_round_date',
        $q$select * from perf.FundingRound
           where roundDate between date '2023-03-01' and date '2023-03-31'$q$),
    (6, 'Join: total funding of one startup by name',
        'ix_perf_startup_name + ix_perf_round_startup_date',
        $q$select s.startupName, sum(r.amountRaisedUsd)
           from perf.Startup s
           join perf.FundingRound r on r.startupNo = s.startupNo
           where s.startupName = 'Startup 123456'
           group by s.startupName$q$);

create table perf.timing (
    queryNo  int  not null references perf.demo_query (queryNo),
    phase    text not null check (phase in ('without', 'with')),
    avgMs    numeric(10,3) not null,
    primary key (queryNo, phase)
);

-- Runs a query once to warm up, then p_runs times, and returns the
-- average time in milliseconds. count(*) around it makes Postgres
-- produce every row without sending them to the screen.
create function perf.time_query(p_sql text, p_runs int default 5)
returns numeric
language plpgsql
as $$
declare
    v_start  timestamptz;
    v_total  interval := interval '0';
    v_dummy  bigint;
begin
    execute 'select count(*) from (' || p_sql || ') q' into v_dummy;
    for i in 1 .. p_runs loop
        v_start := clock_timestamp();
        execute 'select count(*) from (' || p_sql || ') q' into v_dummy;
        v_total := v_total + (clock_timestamp() - v_start);
    end loop;
    return round((extract(epoch from v_total) * 1000 / p_runs)::numeric, 3);
end;
$$;


-- ---------------------------------------------------------------------
-- 3a. Time WITHOUT indexes (only the primary keys exist)
-- ---------------------------------------------------------------------
insert into perf.timing (queryNo, phase, avgMs)
select queryNo, 'without', perf.time_query(sqlText)
from perf.demo_query;


-- ---------------------------------------------------------------------
-- 3b. Create the same indexes as in 004, then time again
-- ---------------------------------------------------------------------
create index ix_perf_startup_name       on perf.Startup (startupName);
create index ix_perf_startup_name_trgm  on perf.Startup using gin (startupName extensions.gin_trgm_ops);
create index ix_perf_startup_city       on perf.Startup (cityNo);
create index ix_perf_startup_stage      on perf.Startup (stage);
create index ix_perf_round_startup_date on perf.FundingRound (startupNo, roundDate);
create index ix_perf_round_date         on perf.FundingRound (roundDate);

analyze perf.Startup, perf.FundingRound;

insert into perf.timing (queryNo, phase, avgMs)
select queryNo, 'with', perf.time_query(sqlText)
from perf.demo_query;


-- ---------------------------------------------------------------------
-- 4. Result: one row per query
-- ---------------------------------------------------------------------
select q.queryNo,
       q.label,
       q.usesIndex,
       w.avgMs                                         as msWithoutIndex,
       i.avgMs                                         as msWithIndex,
       round(w.avgMs / nullif(i.avgMs, 0), 1) || 'x'   as speedUp
from perf.demo_query q
join perf.timing w on w.queryNo = q.queryNo and w.phase = 'without'
join perf.timing i on i.queryNo = q.queryNo and i.phase = 'with'
order by q.queryNo;


-- =====================================================================
-- OPTIONAL, FOR THE VIVA: see the plan Postgres chooses
-- Select ONE block below and press Run.
--
-- With the indexes (look for "Index Scan" or "Bitmap Index Scan"):
--   explain analyze
--   select * from perf.FundingRound where startupNo = 123456 order by roundDate;
--
-- Pretend the indexes are gone (look for "Seq Scan" = reads every row):
--   begin;
--   set local enable_indexscan  = off;
--   set local enable_bitmapscan = off;
--   explain analyze
--   select * from perf.FundingRound where startupNo = 123456 order by roundDate;
--   rollback;
--
-- Compare "Execution Time" at the bottom of the two outputs.
-- =====================================================================
