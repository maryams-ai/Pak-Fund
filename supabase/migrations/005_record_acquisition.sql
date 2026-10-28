-- =====================================================================
-- Startup Funding Database (Pakistan)
-- 005_record_acquisition.sql : record an acquisition in ONE transaction
--
-- Run after 001, 002 and 004.
--
-- WHY A FUNCTION
-- Recording an acquisition needs two writes:
--   1. INSERT a row into Acquisition
--   2. UPDATE Startup.status to 'Acquired'
-- If the app sends them as two separate requests and the second one
-- fails, the database is left half done (an Acquisition row, but the
-- startup still says Active). A function call is one statement, so
-- PostgreSQL runs everything inside it as ONE transaction: either both
-- writes happen, or (on any error) neither does. This is atomicity,
-- the "A" in ACID.
--
-- Same style as add_team_member in 002_rls.sql:
--   security definer      runs with the owner's rights, so the two
--                         writes are not blocked by RLS or by the
--                         protect_startup guard trigger ...
--   is_admin() check      ... which is why the function itself checks
--                         that the caller is an active Admin first.
--   search_path = ''      nobody can hijack it with a fake table name.
-- All CHECK, UNIQUE and FOREIGN KEY constraints still apply.
--
-- Frontend: supabase.rpc('record_acquisition', { p_startupno, p_acquirername,
--             p_acquisitiondate, p_priceusd })
-- =====================================================================

create or replace function public.record_acquisition(
    p_startupNo        bigint,
    p_acquirerName     text,
    p_acquisitionDate  date,
    p_priceUsd         numeric default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
    v_status         text;
    v_acquisitionNo  bigint;
begin
    -- 1. Only an active Admin may record acquisitions.
    if not public.is_admin() then
        raise exception 'Only an admin can record an acquisition'
            using errcode = '42501';
    end if;

    -- 2. Find the startup. FOR UPDATE locks the row, so two admins
    --    pressing Save at the same moment cannot both get through.
    select status into v_status
    from public.Startup
    where startupNo = p_startupNo
    for update;

    if not found then
        raise exception 'Startup % does not exist', p_startupNo
            using errcode = '23503';
    end if;

    -- 3. A startup can be acquired only once.
    if v_status = 'Acquired'
       or exists (select 1 from public.Acquisition where startupNo = p_startupNo) then
        raise exception 'This startup is already acquired'
            using errcode = '23505';
    end if;

    -- 4. The two writes. If either fails, both are undone.
    insert into public.Acquisition (startupNo, acquirerName, acquisitionDate, priceUsd)
    values (p_startupNo, trim(p_acquirerName), p_acquisitionDate, p_priceUsd)
    returning acquisitionNo into v_acquisitionNo;

    update public.Startup
    set status = 'Acquired'
    where startupNo = p_startupNo;

    return v_acquisitionNo;
end;
$$;

-- Visitors (anon) may not call it; logged-in users may call it, and the
-- is_admin() check inside turns away everyone who is not an Admin.
revoke execute on function public.record_acquisition(bigint, text, date, numeric) from public, anon;
grant  execute on function public.record_acquisition(bigint, text, date, numeric) to authenticated;
