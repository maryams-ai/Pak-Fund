-- =====================================================================
-- Startup Funding Database (Pakistan)
-- 002_rls.sql : Row Level Security, helper functions, sign-up trigger
--
-- Roles in Supabase:
--   anon          = visitor, not logged in
--   authenticated = logged-in user; their app role (Admin / Founder /
--                   Investor) is read from the profiles table
--   postgres / service_role (SQL editor, seed and import scripts)
--                 bypass RLS
--
-- Policies of the same command are OR-ed: a row is allowed if ANY
-- policy allows it. Every table has one "admin can do everything"
-- policy, so the other policies only describe normal users.
--
-- (select auth.uid()) is wrapped in a sub-select so Postgres runs it
-- once per query instead of once per row (Supabase performance advice).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Turn on RLS for every table. With RLS on and no policy, nobody
--    (except postgres / service_role) can read or write anything.
-- ---------------------------------------------------------------------
alter table public.City             enable row level security;
alter table public.Industry         enable row level security;
alter table public.profiles         enable row level security;
alter table public.Investor         enable row level security;
alter table public.Startup          enable row level security;
alter table public.Founder          enable row level security;
alter table public.StartupFounder   enable row level security;
alter table public.FundingRound     enable row level security;
alter table public.Investment       enable row level security;
alter table public.Acquisition      enable row level security;
alter table public.PitchRequest     enable row level security;
alter table public.InvestorIndustry enable row level security;
alter table public.Watchlist        enable row level security;


-- ---------------------------------------------------------------------
-- 2. Helper functions
-- SECURITY DEFINER = the function runs with its owner's rights and
-- skips RLS. A policy on profiles can therefore call is_admin() (which
-- reads profiles) without the policy checking itself again, so there
-- is no infinite recursion. search_path = '' stops anyone from
-- hijacking the function with a fake table of the same name.
-- ---------------------------------------------------------------------

-- True if the current user is an active Admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where userNo = (select auth.uid()) and role = 'Admin' and isActive
    );
$$;

-- Role of the current user ('Founder', 'Investor', 'Admin'), or NULL
-- if not logged in or deactivated. Write policies require a non-NULL
-- role, so a deactivated user can still read but can no longer write.
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = ''
as $$
    select role from public.profiles
    where userNo = (select auth.uid()) and isActive;
$$;

-- investorNo of the investor profile the current user manages, or NULL.
create or replace function public.my_investor_no()
returns bigint
language sql stable security definer set search_path = ''
as $$
    select investorNo from public.Investor
    where userNo = (select auth.uid());
$$;

-- True if the current user submitted this startup.
create or replace function public.owns_startup(p_startupNo bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.Startup
        where startupNo = p_startupNo and userNo = (select auth.uid())
    );
$$;


-- ---------------------------------------------------------------------
-- 3. Sign-up trigger
-- When Supabase Auth creates a user, copy fullName, role and phone from
-- the sign-up metadata into a new profiles row. Only Founder or
-- Investor is accepted; anything else (e.g. 'Admin') cancels the
-- sign-up. Missing role defaults to Founder.
-- Frontend: supabase.auth.signUp({ email, password,
--             options: { data: { fullName, role, phone } } })
-- The first admin is made by hand in the SQL editor:
--   update profiles set role = 'Admin' where email = '...';
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'Founder');
begin
    if v_role not in ('Founder', 'Investor') then
        raise exception 'Sign-up role must be Founder or Investor'
            using errcode = '22023';
    end if;

    insert into public.profiles (userNo, fullName, email, role, phone)
    values (
        new.id,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'fullName'), ''),
                 split_part(new.email, '@', 1)),
        new.email,
        v_role,
        nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Keep profiles.email equal to the login email if the user changes it.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    update public.profiles set email = new.email where userNo = new.id;
    return new;
end;
$$;

create trigger on_auth_user_email_changed
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.handle_user_email_change();


-- ---------------------------------------------------------------------
-- 4. Protected columns
-- RLS decides WHICH ROWS a user may update, not which columns. These
-- triggers stop normal users from changing admin-only columns on rows
-- they are otherwise allowed to edit.
-- ---------------------------------------------------------------------

-- Who may change admin-only columns?
-- current_user is the database role running the statement:
--   anon, authenticated -> a request from the app (browser): only an
--                          active Admin passes
--   postgres            -> SQL editor, seed and import scripts: passes
--   service_role        -> server key, already bypasses RLS: passes
--   supabase_auth_admin -> Supabase Auth itself: passes
-- Not SECURITY DEFINER on purpose: inside a definer function
-- current_user would be the function owner, not the caller.
create or replace function public.can_change_protected_columns()
returns boolean
language sql stable set search_path = ''
as $$
    select current_user not in ('anon', 'authenticated') or public.is_admin();
$$;

-- profiles: a user may edit their own fullName and phone only.
create or replace function public.protect_profiles()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if not public.can_change_protected_columns() and (
           new.userNo    is distinct from old.userNo
        or new.email     is distinct from old.email
        or new.role      is distinct from old.role
        or new.isActive  is distinct from old.isActive
        or new.createdAt is distinct from old.createdAt) then
        raise exception 'Only an admin can change role, isActive, email or createdAt'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

create trigger protect_profiles
    before update on public.profiles
    for each row execute function public.protect_profiles();

-- Investor: only an admin can verify or change the owning user.
create or replace function public.protect_investor()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if not public.can_change_protected_columns() and (
           new.isVerified is distinct from old.isVerified
        or new.userNo     is distinct from old.userNo) then
        raise exception 'Only an admin can change isVerified or userNo'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

create trigger protect_investor
    before update on public.Investor
    for each row execute function public.protect_investor();

-- Startup: only an admin can approve, change the owner or mark Acquired.
create or replace function public.protect_startup()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if not public.can_change_protected_columns() and (
           new.isApproved is distinct from old.isApproved
        or new.userNo     is distinct from old.userNo
        or (new.status = 'Acquired' and old.status <> 'Acquired')) then
        raise exception 'Only an admin can change isApproved, userNo or set status Acquired'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

create trigger protect_startup
    before update on public.Startup
    for each row execute function public.protect_startup();

-- PitchRequest: after sending, only the status may change.
create or replace function public.protect_pitch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if not public.can_change_protected_columns() and (
           new.userNo      is distinct from old.userNo
        or new.investorNo  is distinct from old.investorNo
        or new.startupNo   is distinct from old.startupNo
        or new.message     is distinct from old.message
        or new.requestDate is distinct from old.requestDate) then
        raise exception 'Only the status of a pitch can be changed'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

create trigger protect_pitch
    before update on public.PitchRequest
    for each row execute function public.protect_pitch();


-- ---------------------------------------------------------------------
-- 5. add_team_member (called from the app with supabase.rpc)
-- A new Founder row is not yet linked to any startup, so RLS cannot
-- tell whose it is. This function checks that the caller owns the
-- startup, then inserts the Founder and the StartupFounder link
-- together. All CHECK and FK constraints still apply.
-- ---------------------------------------------------------------------
create or replace function public.add_team_member(
    p_startupNo   bigint,
    p_fullName    text,
    p_roleTitle   text,
    p_joinedYear  int  default null,
    p_email       text default null,
    p_linkedinUrl text default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
    v_founderNo bigint;
begin
    if not public.is_admin()
       and not (public.app_role() = 'Founder' and public.owns_startup(p_startupNo)) then
        raise exception 'You can only add team members to your own startup'
            using errcode = '42501';
    end if;

    insert into public.Founder (fullName, email, linkedinUrl)
    values (p_fullName, p_email, p_linkedinUrl)
    returning founderNo into v_founderNo;

    insert into public.StartupFounder (startupNo, founderNo, roleTitle, joinedYear)
    values (p_startupNo, v_founderNo, p_roleTitle, p_joinedYear);

    return v_founderNo;
end;
$$;

-- Trigger functions must not be callable through the API; the team
-- function is for logged-in users only.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.add_team_member(bigint, text, text, int, text, text) from public, anon;
grant  execute on function public.add_team_member(bigint, text, text, int, text, text) to authenticated;


-- =====================================================================
-- 6. Policies, table by table
-- =====================================================================

-- ---------------------------- City -----------------------------------
create policy "Anyone can read cities"
    on public.City for select to anon, authenticated
    using (true);

create policy "Admin can manage cities"
    on public.City for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Industry -------------------------------
create policy "Anyone can read industries"
    on public.Industry for select to anon, authenticated
    using (true);

create policy "Admin can manage industries"
    on public.Industry for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- profiles -------------------------------
-- No INSERT policy: profiles are created only by the sign-up trigger.
-- No DELETE policy: users are deactivated, not deleted.
create policy "Users can read their own profile"
    on public.profiles for select to authenticated
    using (userNo = (select auth.uid()));

create policy "Investors can read the profile of founders who pitched them"
    on public.profiles for select to authenticated
    using (exists (
        select 1 from public.PitchRequest p
        where p.userNo = profiles.userNo
          and p.investorNo = (select public.my_investor_no())
    ));

create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using (userNo = (select auth.uid()))
    with check (userNo = (select auth.uid()));

create policy "Admin can manage profiles"
    on public.profiles for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Investor -------------------------------
create policy "Anyone can read verified investors"
    on public.Investor for select to anon, authenticated
    using (isVerified);

create policy "Investors can read their own profile"
    on public.Investor for select to authenticated
    using (userNo = (select auth.uid()));

create policy "Investors can create one unverified profile for themselves"
    on public.Investor for insert to authenticated
    with check (
        (select public.app_role()) = 'Investor'
        and userNo = (select auth.uid())
        and isVerified = false
    );

create policy "Investors can update their own profile"
    on public.Investor for update to authenticated
    using ((select public.app_role()) = 'Investor' and userNo = (select auth.uid()))
    with check (userNo = (select auth.uid()));

create policy "Admin can manage investors"
    on public.Investor for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Startup --------------------------------
create policy "Anyone can read approved startups"
    on public.Startup for select to anon, authenticated
    using (isApproved);

create policy "Founders can read their own startups"
    on public.Startup for select to authenticated
    using (userNo = (select auth.uid()));

create policy "Founders can submit startups for review"
    on public.Startup for insert to authenticated
    with check (
        (select public.app_role()) = 'Founder'
        and userNo = (select auth.uid())
        and isApproved = false
        and status <> 'Acquired'
    );

create policy "Founders can update their own startups"
    on public.Startup for update to authenticated
    using ((select public.app_role()) = 'Founder' and userNo = (select auth.uid()))
    with check (userNo = (select auth.uid()));

create policy "Admin can manage startups"
    on public.Startup for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Founder --------------------------------
-- Inserts go through add_team_member(); no direct INSERT policy.
create policy "Anyone can read founders of startups they can see"
    on public.Founder for select to anon, authenticated
    using (exists (
        select 1 from public.StartupFounder sf
        where sf.founderNo = Founder.founderNo
    ));

create policy "Founders can update people on their own team"
    on public.Founder for update to authenticated
    using (
        (select public.app_role()) = 'Founder'
        and exists (
            select 1 from public.StartupFounder sf
            where sf.founderNo = Founder.founderNo
              and public.owns_startup(sf.startupNo)
        )
    );

create policy "Admin can manage founders"
    on public.Founder for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- StartupFounder -------------------------
create policy "Anyone can read team links of startups they can see"
    on public.StartupFounder for select to anon, authenticated
    using (exists (
        select 1 from public.Startup s
        where s.startupNo = StartupFounder.startupNo
    ));

create policy "Founders can manage the team of their own startups"
    on public.StartupFounder for all to authenticated
    using ((select public.app_role()) = 'Founder' and public.owns_startup(startupNo))
    with check ((select public.app_role()) = 'Founder' and public.owns_startup(startupNo));

create policy "Admin can manage team links"
    on public.StartupFounder for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- FundingRound ---------------------------
create policy "Anyone can read rounds of startups they can see"
    on public.FundingRound for select to anon, authenticated
    using (exists (
        select 1 from public.Startup s
        where s.startupNo = FundingRound.startupNo
    ));

create policy "Founders can manage rounds of their own startups"
    on public.FundingRound for all to authenticated
    using ((select public.app_role()) = 'Founder' and public.owns_startup(startupNo))
    with check ((select public.app_role()) = 'Founder' and public.owns_startup(startupNo));

create policy "Admin can manage rounds"
    on public.FundingRound for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Investment -----------------------------
create policy "Anyone can read verified investments in visible rounds"
    on public.Investment for select to anon, authenticated
    using (
        exists (select 1 from public.FundingRound r
                where r.roundNo = Investment.roundNo)
        and exists (select 1 from public.Investor i
                    where i.investorNo = Investment.investorNo and i.isVerified)
    );

create policy "Investors can read their own investments"
    on public.Investment for select to authenticated
    using (investorNo = (select public.my_investor_no()));

create policy "Founders can read all investments in their own rounds"
    on public.Investment for select to authenticated
    using (exists (
        select 1 from public.FundingRound r
        where r.roundNo = Investment.roundNo
          and public.owns_startup(r.startupNo)
    ));

create policy "Investors can record their own investments in approved startups"
    on public.Investment for insert to authenticated
    with check (
        (select public.app_role()) = 'Investor'
        and investorNo = (select public.my_investor_no())
        and exists (
            select 1 from public.FundingRound r
            join public.Startup s on s.startupNo = r.startupNo
            where r.roundNo = Investment.roundNo and s.isApproved
        )
    );

create policy "Investors can update their own investments"
    on public.Investment for update to authenticated
    using ((select public.app_role()) = 'Investor'
           and investorNo = (select public.my_investor_no()))
    with check (investorNo = (select public.my_investor_no()));

create policy "Investors can delete their own investments"
    on public.Investment for delete to authenticated
    using ((select public.app_role()) = 'Investor'
           and investorNo = (select public.my_investor_no()));

create policy "Admin can manage investments"
    on public.Investment for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Acquisition ----------------------------
create policy "Anyone can read acquisitions of startups they can see"
    on public.Acquisition for select to anon, authenticated
    using (exists (
        select 1 from public.Startup s
        where s.startupNo = Acquisition.startupNo
    ));

create policy "Admin can manage acquisitions"
    on public.Acquisition for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- PitchRequest ---------------------------
create policy "Founders can read pitches they sent"
    on public.PitchRequest for select to authenticated
    using (userNo = (select auth.uid()));

create policy "Investors can read pitches addressed to them"
    on public.PitchRequest for select to authenticated
    using (investorNo = (select public.my_investor_no()));

create policy "Founders can pitch own approved startup to verified investor"
    on public.PitchRequest for insert to authenticated
    with check (
        (select public.app_role()) = 'Founder'
        and userNo = (select auth.uid())
        and status = 'Pending'
        and exists (
            select 1 from public.Startup s
            where s.startupNo = PitchRequest.startupNo
              and s.userNo = (select auth.uid())
              and s.isApproved
        )
        and exists (
            select 1 from public.Investor i
            where i.investorNo = PitchRequest.investorNo and i.isVerified
        )
    );

create policy "Investors can accept or decline pitches addressed to them"
    on public.PitchRequest for update to authenticated
    using (
        (select public.app_role()) = 'Investor'
        and investorNo = (select public.my_investor_no())
        and status = 'Pending'
    )
    with check (
        investorNo = (select public.my_investor_no())
        and status in ('Accepted', 'Declined')
    );

create policy "Admin can manage pitches"
    on public.PitchRequest for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- InvestorIndustry -----------------------
create policy "Anyone can read industries of investors they can see"
    on public.InvestorIndustry for select to anon, authenticated
    using (exists (
        select 1 from public.Investor i
        where i.investorNo = InvestorIndustry.investorNo
    ));

create policy "Investors can manage their own industries"
    on public.InvestorIndustry for all to authenticated
    using ((select public.app_role()) = 'Investor'
           and investorNo = (select public.my_investor_no()))
    with check ((select public.app_role()) = 'Investor'
                and investorNo = (select public.my_investor_no()));

create policy "Admin can manage investor industries"
    on public.InvestorIndustry for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------- Watchlist ------------------------------
create policy "Users can read their own watchlist"
    on public.Watchlist for select to authenticated
    using (userNo = (select auth.uid()));

create policy "Users can save startups they can see"
    on public.Watchlist for insert to authenticated
    with check (
        (select public.app_role()) is not null
        and userNo = (select auth.uid())
        and exists (select 1 from public.Startup s
                    where s.startupNo = Watchlist.startupNo)
    );

create policy "Users can remove startups from their own watchlist"
    on public.Watchlist for delete to authenticated
    using (userNo = (select auth.uid()));

create policy "Admin can manage watchlists"
    on public.Watchlist for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
