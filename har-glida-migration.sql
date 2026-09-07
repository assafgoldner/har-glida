-- ============================================================================
-- הר גלידה — Migration למסד קיים
-- מוסיף: עמודת הערה לאירועים + טבלת משימות (tasks) + הרשאות.
-- בטוח להרצה חוזרת (idempotent) — לא ייכשל אם משהו כבר קיים.
-- הרצה: Supabase → SQL Editor → הדבק → Run.
-- ============================================================================

-- ---- 1. עמודת הערה לאירועים ----
alter table public.events add column if not exists note text;

-- ---- 2. טבלת משימות ----
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  done        boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- הרשאות בסיס ל-role authenticated על הטבלה החדשה
grant select, insert, update, delete on public.tasks to authenticated;

-- הפעלת RLS
alter table public.tasks enable row level security;

-- ---- 3. Policies למשימות (כל חבר ועד: קריאה, יצירה, עדכון, מחיקה) ----
-- drop אם קיימות, ליתר ביטחון בהרצה חוזרת
drop policy if exists tasks_select        on public.tasks;
drop policy if exists tasks_member_insert on public.tasks;
drop policy if exists tasks_member_update on public.tasks;
drop policy if exists tasks_member_delete on public.tasks;

create policy tasks_select on public.tasks
  for select using (public.is_member());
create policy tasks_member_insert on public.tasks
  for insert with check (public.is_member());
create policy tasks_member_update on public.tasks
  for update using (public.is_member()) with check (public.is_member());
create policy tasks_member_delete on public.tasks
  for delete using (public.is_member());

-- ============================================================================
-- סיום. לאחר ההרצה: המשימות והערות האירועים יעבדו באפליקציה.
-- ============================================================================
