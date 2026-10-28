-- =====================================================================
-- Startup Funding Database (Pakistan)
-- tests/rls_checks.sql : shows that the RLS policies and guard
-- triggers in 002_rls.sql (and the admin check in 005) work.
--
-- How to run: paste the whole file into the Supabase SQL editor and
-- press Run (or: psql -f supabase/tests/rls_checks.sql). Run it after
-- 001, 002 and 005, on a dev project. The last statement prints one
-- row per test with PASS or FAIL.
--
-- How it works:
--   * Setup runs as postgres, which bypasses RLS, and creates test
--     users, startups and investors whose names start with "RLS Test".
--   * Each test "logs in" the way the API does: SET ROLE authenticated
--     (or anon) and put the user id into request.jwt.claims, which is
--     what auth.uid() reads. Then it tries something, catches any error,
--     switches back to postgres and records the result.
--   * All test rows are deleted at the end (and at the start, in case
--     an earlier run stopped half way).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helpers (pg_temp = exist only for this session)
-- ---------------------------------------------------------------------
drop table if exists pg_temp.rls_results;
create temp table rls_results (
    id        int generated always as identity,
    test      text,
    expected  text,
    got       text,
    passed    boolean
);

create function pg_temp.log(p_test text, p_expected text, p_got text, p_passed boolean)
returns void language sql
as $$ insert into rls_results (test, expected, got, passed)
      values (p_test, p_expected, p_got, coalesce(p_passed, false)); $$;

create function pg_temp.cleanup()
returns void language plpgsql
as $$
begin
    -- rounds, investments, team links, pitches and watchlist rows go
    -- with the startup (ON DELETE CASCADE)
    delete from public.Startup  where startupName like 'RLS Test%';
    delete from public.Investor where investorName like 'RLS Test%';
    -- profiles go with the auth user (ON DELETE CASCADE)
    delete from auth.users      where email like 'rls-test-%@example.com';
    delete from public.City     where cityName = 'RLS Test City';
    delete from public.Industry where industryName = 'RLS Test Industry';
end;
$$;

select pg_temp.cleanup();


-- ---------------------------------------------------------------------
-- Setup (as postgres)
--   ...0001  founder,  owns "RLS Test Approved" and "RLS Test Pending"
--   ...0002  investor, manages "RLS Test Investor One" (unverified)
--   ...0003  founder,  owns "RLS Test Other Founder"
--   ...0004  founder,  deactivated by admin
-- Inserting into auth.users is what Supabase Auth does at sign-up, so
-- this also fires the on_auth_user_created trigger.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-a000-000000000001', 'rls-test-founder@example.com',
     '{"fullName": "RLS Test Founder", "role": "Founder"}'),
    ('00000000-0000-4000-a000-000000000002', 'rls-test-investor@example.com',
     '{"fullName": "RLS Test Investor", "role": "Investor"}'),
    ('00000000-0000-4000-a000-000000000003', 'rls-test-founder2@example.com',
     '{"fullName": "RLS Test Founder Two", "role": "Founder"}'),
    ('00000000-0000-4000-a000-000000000004', 'rls-test-inactive@example.com',
     '{"fullName": "RLS Test Inactive", "role": "Founder"}');

update public.profiles set isActive = false
where userNo = '00000000-0000-4000-a000-000000000004';

insert into public.City (cityName, province) values ('RLS Test City', 'Test');
insert into public.Industry (industryName) values ('RLS Test Industry');

insert into public.Startup (cityNo, industryNo, userNo, startupName, stage, isApproved)
select c.cityNo, i.industryNo, v.userNo::uuid, v.startupName, 'Seed', v.isApproved
from public.City c
cross join public.Industry i
cross join (values
    ('00000000-0000-4000-a000-000000000001', 'RLS Test Approved',      true),
    ('00000000-0000-4000-a000-000000000001', 'RLS Test Pending',       false),
    ('00000000-0000-4000-a000-000000000003', 'RLS Test Other Founder', true)
) as v (userNo, startupName, isApproved)
where c.cityName = 'RLS Test City' and i.industryName = 'RLS Test Industry';

insert into public.Investor (userNo, investorName, investorType, isVerified) values
    ('00000000-0000-4000-a000-000000000002', 'RLS Test Investor One', 'Angel',   false),
    (null,                                   'RLS Test Investor Two', 'VC Firm', true);

-- One pitch to each investor, both from "RLS Test Approved"
insert into public.PitchRequest (userNo, investorNo, startupNo, message)
select '00000000-0000-4000-a000-000000000001', i.investorNo, s.startupNo, 'RLS test pitch'
from public.Investor i
cross join public.Startup s
where i.investorName like 'RLS Test Investor%' and s.startupName = 'RLS Test Approved';


-- =====================================================================
-- Tests
-- =====================================================================

-- 1. Nobody can sign up as Admin ---------------------------------------
do $$
declare v_got text := 'no error';
begin
    begin
        insert into auth.users (id, email, raw_user_meta_data) values
            ('00000000-0000-4000-a000-000000000009', 'rls-test-admin@example.com',
             '{"fullName": "RLS Test Sneaky", "role": "Admin"}');
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    perform pg_temp.log('Sign-up with role Admin is rejected',
        'error 22023', v_got, v_got like '22023%');
end $$;

-- 2. Normal sign-up creates a Founder profile --------------------------
do $$
declare v_got text;
begin
    select role || ' / ' || fullName into v_got
    from public.profiles where userNo = '00000000-0000-4000-a000-000000000001';
    perform pg_temp.log('Sign-up as Founder creates the profile',
        'Founder / RLS Test Founder', v_got, v_got = 'Founder / RLS Test Founder');
end $$;

-- 3. Visitor sees approved startups only -------------------------------
do $$
declare v_approved int; v_pending int;
begin
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_approved from public.Startup where startupName = 'RLS Test Approved';
    select count(*) into v_pending  from public.Startup where startupName = 'RLS Test Pending';
    reset role;
    perform pg_temp.log('Visitor sees approved startup, not pending one',
        'approved 1, pending 0',
        format('approved %s, pending %s', v_approved, v_pending),
        v_approved = 1 and v_pending = 0);
end $$;

-- 4. Founder sees their own pending startup ----------------------------
do $$
declare v_pending int;
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    select count(*) into v_pending from public.Startup where startupName = 'RLS Test Pending';
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder sees own pending startup',
        'pending 1', format('pending %s', v_pending), v_pending = 1);
end $$;

-- 5. Founder can edit normal columns of their own startup --------------
do $$
declare v_rows int := 0; v_got text;
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        update public.Startup set tagline = 'Edited by RLS test'
        where startupName = 'RLS Test Pending';
        get diagnostics v_rows = row_count;
        v_got := v_rows || ' row updated';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder can edit tagline of own startup',
        '1 row updated', v_got, v_got = '1 row updated');
end $$;

-- 6. Founder cannot approve their own startup --------------------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        update public.Startup set isApproved = true
        where startupName = 'RLS Test Pending';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder cannot set isApproved',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 7. Founder cannot make themselves Admin ------------------------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        update public.profiles set role = 'Admin'
        where userNo = '00000000-0000-4000-a000-000000000001';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder cannot change own role to Admin',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 8. Founder cannot add a round to someone else's startup --------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        insert into public.FundingRound (startupNo, roundType, roundDate, amountRaisedUsd)
        select startupNo, 'Seed', current_date, 100000
        from public.Startup where startupName = 'RLS Test Other Founder';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder cannot add round to another founder''s startup',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 9. Founder cannot pitch from a startup that is not approved ----------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        insert into public.PitchRequest (userNo, investorNo, startupNo, message)
        select '00000000-0000-4000-a000-000000000001', i.investorNo, s.startupNo, 'Hello'
        from public.Investor i cross join public.Startup s
        where i.investorName = 'RLS Test Investor Two' and s.startupName = 'RLS Test Pending';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Founder cannot pitch from unapproved startup',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 10. Investor sees only pitches addressed to them ---------------------
do $$
declare v_seen int;
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
    select count(*) into v_seen from public.PitchRequest where message = 'RLS test pitch';
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Investor sees only own pitches (1 of 2)',
        'sees 1', format('sees %s', v_seen), v_seen = 1);
end $$;

-- 11. Investor cannot verify themselves --------------------------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
    begin
        update public.Investor set isVerified = true
        where investorName = 'RLS Test Investor One';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Investor cannot set isVerified',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 12. Investor cannot rewrite a pitch, only answer it ------------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
    begin
        update public.PitchRequest set message = 'Changed by investor'
        where message = 'RLS test pitch';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Investor cannot change pitch message',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 13. Investor can accept a pitch addressed to them --------------------
do $$
declare v_rows int := 0; v_got text;
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
    begin
        update public.PitchRequest set status = 'Accepted'
        where message = 'RLS test pitch';
        get diagnostics v_rows = row_count;
        v_got := v_rows || ' row updated';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Investor can accept own pitch (other one untouched)',
        '1 row updated', v_got, v_got = '1 row updated');
end $$;

-- 14. Deactivated user cannot write ------------------------------------
do $$
declare v_got text := 'no error';
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000004", "role": "authenticated"}', true);
    begin
        insert into public.Watchlist (userNo, startupNo)
        select '00000000-0000-4000-a000-000000000004', startupNo
        from public.Startup where startupName = 'RLS Test Approved';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform pg_temp.log('Deactivated user cannot save to watchlist',
        'error 42501', v_got, v_got like '42501%');
end $$;

-- 15. SQL editor / seed script (postgres) CAN change protected columns -
do $$
declare v_got text := 'no error';
begin
    begin
        update public.Startup set isApproved = true where startupName = 'RLS Test Pending';
        select 'isApproved = ' || isApproved into v_got
        from public.Startup where startupName = 'RLS Test Pending';
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    perform pg_temp.log('postgres (SQL editor) can set isApproved',
        'isApproved = true', v_got, v_got = 'isApproved = true');
end $$;

-- 16. Non-admin cannot call record_acquisition() (005) -----------------
-- The founder calls the function on their own startup. The is_admin()
-- check inside must refuse it, and nothing may be saved: no Acquisition
-- row and the status still Active.
do $$
declare v_got text := 'no error'; v_saved text;
begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
        '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
    begin
        perform public.record_acquisition(
            (select startupNo from public.Startup where startupName = 'RLS Test Approved'),
            'RLS Test Buyer', current_date, 1000000);
    exception when others then v_got := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- Check as postgres that nothing changed.
    select s.status || ', acquisitions ' || count(a.acquisitionNo) into v_saved
    from public.Startup s
    left join public.Acquisition a on a.startupNo = s.startupNo
    where s.startupName = 'RLS Test Approved'
    group by s.status;

    perform pg_temp.log('Founder cannot call record_acquisition (nothing saved)',
        'error 42501 / Active, acquisitions 0', v_got || ' / ' || v_saved,
        v_got like '42501%' and v_saved = 'Active, acquisitions 0');
end $$;


-- ---------------------------------------------------------------------
-- Clean up and show the results
-- ---------------------------------------------------------------------
select pg_temp.cleanup();

select id,
       case when passed then 'PASS' else 'FAIL' end as result,
       test,
       expected,
       got
from rls_results
order by id;
