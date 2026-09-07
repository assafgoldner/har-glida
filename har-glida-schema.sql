-- ============================================================================
-- הר גלידה — ניהול ועד הגן
-- סכימת Supabase מלאה: טבלאות + הרשאות (RLS) + נתוני דמו
-- ----------------------------------------------------------------------------
-- הרצה: Supabase Dashboard → SQL Editor → הדבק את כל הקובץ → Run.
-- מודל: גן אחד. לוגין: Magic Link + Google (מוגדר בלוח הבקרה, לא כאן).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. הרחבות
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- ל-gen_random_uuid()

-- ============================================================================
-- 1. הרשאות משתמשים — מקור אמת יחיד: allowed_emails
-- ----------------------------------------------------------------------------
-- רק מיילים שקיימים כאן מקבלים גישה. התפקיד (admin/viewer) נגזר ישירות מכאן
-- דרך join למייל של המשתמש המחובר. אין טבלת members ואין טריגר —
-- מנהלים הכל בטבלה אחת, גם לפני התחברות ראשונה וגם אחריה.
--
-- יצירת "יוזר": פשוט insert לכאן. חשבון ה-auth עצמו נוצר אוטומטית ע"י
-- Supabase כשהמשתמשת מתחברת בפעם הראשונה (Google / Magic Link).
-- הסרת גישה: delete מכאן — ובכניסה הבאה אין גישה.
-- ============================================================================
create table public.allowed_emails (
  email       text primary key,
  role        text not null default 'viewer' check (role in ('admin','viewer')),
  full_name   text,
  created_at  timestamptz not null default now()
);

-- המייל של המשתמש המחובר (מתוך ה-JWT).
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

-- האם המשתמש המחובר אדמין? (join למייל)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = public.current_email() and role = 'admin'
  );
$$;

-- האם המשתמש המחובר חבר ועד מאושר (admin או viewer)?
create or replace function public.is_member()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = public.current_email()
  );
$$;

-- ============================================================================
-- 2. טבלאות הליבה
-- ============================================================================

-- ילדי הגן (רשימה סטטית)
create table public.children (
  id          uuid primary key default gen_random_uuid(),
  child_name  text not null,
  parents     text,
  sort_order  int default 0,
  created_at  timestamptz not null default now()
);

-- קופות
create table public.funds (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  icon                  text default 'Wallet',
  color                 text default '#E8833A',
  annual_fee            numeric not null default 0,
  unassigned_collected  numeric not null default 0,
  sort_order            int default 0,
  created_at            timestamptz not null default now()
);

-- קבוצות פייבוקס בתוך קופה
create table public.fund_groups (
  id          uuid primary key default gen_random_uuid(),
  fund_id     uuid not null references public.funds(id) on delete cascade,
  label       text not null,
  link        text default '',
  spent       numeric not null default 0,
  created_at  timestamptz not null default now()
);

-- תשלומים: כמה כל ילד שילם לכל קופה (סכום מצטבר)
create table public.payments (
  child_id    uuid not null references public.children(id) on delete cascade,
  fund_id     uuid not null references public.funds(id) on delete cascade,
  amount      numeric not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (child_id, fund_id)
);

-- הוצאות (ידני / פייבוקס / החזר)
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  fund_id     uuid not null references public.funds(id) on delete cascade,
  amount      numeric not null,
  description text,
  date        date not null default current_date,
  source      text not null default 'manual' check (source in ('manual','paybox','reimbursement')),
  fingerprint text,          -- לדדופ מול ייבוא פייבוקס
  created_at  timestamptz not null default now()
);

-- בקשות החזר
create table public.reimbursements (
  id          uuid primary key default gen_random_uuid(),
  requester   text not null,
  fund_id     uuid references public.funds(id) on delete set null,
  event       text,
  amount      numeric not null,
  note        text,
  status      text not null default 'pending' check (status in ('pending','done')),
  created_by  uuid references auth.users(id) on delete set null,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- אירועי יומן
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date not null,
  type        text not null default 'other' check (type in ('birthday','holiday','party','other')),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- טביעות אצבע של תנועות שיובאו (לדדופ)
create table public.imported_txns (
  fingerprint text primary key,
  created_at  timestamptz not null default now()
);

-- משימות ועד (רשימת מטלות משותפת)
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  done        boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- מיפוי עמודות אחרון של ייבוא CSV (רשומה יחידה)
create table public.import_map (
  id          int primary key default 1 check (id = 1),
  mapping     jsonb,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. הרשאות בסיס ל-role authenticated
-- ----------------------------------------------------------------------------
-- RLS ו-GRANT הן שתי שכבות נפרדות: צריך גם GRANT (גישה לטבלה) וגם policy
-- (גישה לשורה). בלי ה-GRANTs האלה, כל גישה נחסמת עוד לפני שה-policies נבדקות.
-- ============================================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- ברירת מחדל גם לטבלאות עתידיות
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============================================================================
-- 4. הפעלת RLS על כל הטבלאות
-- ============================================================================
alter table public.allowed_emails  enable row level security;
alter table public.children        enable row level security;
alter table public.funds           enable row level security;
alter table public.fund_groups     enable row level security;
alter table public.payments        enable row level security;
alter table public.expenses        enable row level security;
alter table public.reimbursements  enable row level security;
alter table public.events          enable row level security;
alter table public.imported_txns   enable row level security;
alter table public.tasks           enable row level security;
alter table public.import_map      enable row level security;

-- ============================================================================
-- 5. מדיניות הרשאות (POLICIES)
-- ----------------------------------------------------------------------------
-- עיקרון: חבר ועד מאושר (is_member) יכול לקרוא הכל.
-- כתיבה לכספים/קופות/ילדים/תשלומים/הוצאות/ייבוא — רק אדמין (is_admin).
-- אירועים — כל חבר יכול להוסיף/למחוק.
-- בקשות החזר — כל חבר יכול ליצור; אישור (update) רק אדמין.
-- ============================================================================

-- ---- allowed_emails: כל חבר רואה מי מורשה; רק אדמין מוסיף/משנה/מסיר ----
-- קריאה-עצמית: כל משתמש מחובר יכול לקרוא את שורת ההרשאה של המייל שלו.
-- זה שובר את בעיית ה"ביצה ותרנגולת" — כדי ש-getRole יעבוד לפני ש-is_member ידוע.
create policy allowed_read_own on public.allowed_emails
  for select using (email = (auth.jwt() ->> 'email'));
create policy allowed_select on public.allowed_emails
  for select using (public.is_member());
create policy allowed_admin_write on public.allowed_emails
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- children: קריאה לכל חבר, כתיבה רק אדמין ----
create policy children_select on public.children
  for select using (public.is_member());
create policy children_admin_write on public.children
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- funds ----
create policy funds_select on public.funds
  for select using (public.is_member());
create policy funds_admin_write on public.funds
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- fund_groups ----
create policy groups_select on public.fund_groups
  for select using (public.is_member());
create policy groups_admin_write on public.fund_groups
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- payments ----
create policy payments_select on public.payments
  for select using (public.is_member());
create policy payments_admin_write on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- expenses ----
create policy expenses_select on public.expenses
  for select using (public.is_member());
create policy expenses_admin_write on public.expenses
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- imported_txns (חלק ממנגנון הייבוא — אדמין בלבד) ----
create policy txns_select on public.imported_txns
  for select using (public.is_member());
create policy txns_admin_write on public.imported_txns
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- import_map (אדמין בלבד) ----
create policy map_select on public.import_map
  for select using (public.is_member());
create policy map_admin_write on public.import_map
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- reimbursements: כל חבר קורא ויוצר; עדכון/מחיקה רק אדמין ----
create policy reimb_select on public.reimbursements
  for select using (public.is_member());
create policy reimb_member_insert on public.reimbursements
  for insert with check (public.is_member());
create policy reimb_admin_update on public.reimbursements
  for update using (public.is_admin()) with check (public.is_admin());
create policy reimb_admin_delete on public.reimbursements
  for delete using (public.is_admin());

-- ---- events: כל חבר קורא, יוצר, ומוחק ----
create policy events_select on public.events
  for select using (public.is_member());
create policy events_member_insert on public.events
  for insert with check (public.is_member());
create policy events_member_delete on public.events
  for delete using (public.is_member());
create policy events_member_update on public.events
  for update using (public.is_member()) with check (public.is_member());

-- ---- tasks: כל חבר קורא, יוצר, מעדכן (סימון בוצע), ומוחק ----
create policy tasks_select on public.tasks
  for select using (public.is_member());
create policy tasks_member_insert on public.tasks
  for insert with check (public.is_member());
create policy tasks_member_update on public.tasks
  for update using (public.is_member()) with check (public.is_member());
create policy tasks_member_delete on public.tasks
  for delete using (public.is_member());

-- ============================================================================
-- 6. נתוני התחלה (SEED)
-- ----------------------------------------------------------------------------
-- שנה את המייל הראשון למייל שלך כדי שתהיה האדמין הראשון.
-- ============================================================================

-- >>> שנה כאן למייל שלך <<<
insert into public.allowed_emails (email, role, full_name) values
  ('admin@example.com', 'admin', 'רכזת הועד')
on conflict (email) do nothing;

-- קופות
insert into public.funds (id, name, icon, color, annual_fee, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'הזנה',       'Utensils',    '#E8833A', 1000, 1),
  ('22222222-2222-2222-2222-222222222222', 'מתנות',      'Gift',        '#C9508A', 400,  2),
  ('33333333-3333-3333-3333-333333333333', 'קלמר אישי',  'PencilRuler', '#3D9BE9', 179,  3),
  ('44444444-4444-4444-4444-444444444444', 'חוג ספורט',  'Dribbble',    '#4CA96B', 262,  4)
on conflict (id) do nothing;

-- קבוצות פייבוקס
insert into public.fund_groups (fund_id, label) values
  ('11111111-1111-1111-1111-111111111111', 'קבוצה א׳'),
  ('11111111-1111-1111-1111-111111111111', 'קבוצה ב׳'),
  ('22222222-2222-2222-2222-222222222222', 'מתנות צוות'),
  ('22222222-2222-2222-2222-222222222222', 'מתנות ילדים'),
  ('33333333-3333-3333-3333-333333333333', 'קבוצה ראשית'),
  ('44444444-4444-4444-4444-444444444444', 'מחזור סתיו');

-- ילדים (33)
insert into public.children (child_name, parents, sort_order) values
  ('יעל','מיכל ואבי כהן',1),('איתי','נועה לוי',2),('רוני','דנה ותומר ברק',3),
  ('שירה','אורית מזרחי',4),('עומר','יעל ורון שמש',5),('נועם','טל אבידן',6),
  ('מאיה','ליאת ואייל פרץ',7),('אדם','שני גולן',8),('ליה','הדר ואורי נחמיאס',9),
  ('גיא','רותם דהן',10),('תמר','ענת ויוסי אלון',11),('דניאל','מירב כץ',12),
  ('אלה','סיון וגל רוזן',13),('יונתן','קרן ואמיר בן דוד',14),('אביגיל','נטע שרעבי',15),
  ('איתמר','רונית ואלון כהן',16),('נועה','שירן בר',17),('אורי','מיטל ודור לוי',18),
  ('הללי','אפרת שגיא',19),('רותם','נגה ואיתי כהן',20),('עידו','לימור אשכנזי',21),
  ('שקד','דנה ואורן מור',22),('טליה','יעל שגב',23),('בן','הילה ורועי אדרי',24),
  ('מיכל','אורלי פרידמן',25),('עמית','שירלי ונדב חן',26),('רועי','טל ניר',27),
  ('יובל','מאיה ואסף רון',28),('נטע','עדי קפלן',29),('ליאור','רננה ויואב שמעוני',30),
  ('אלון','חן ברקוביץ',31),('שירה ב','מור ואיל דגן',32),('עומרי','ספיר לביא',33);

-- שורת מיפוי ריקה
insert into public.import_map (id, mapping) values (1, null)
on conflict (id) do nothing;

-- ============================================================================
-- סיום. השלבים הבאים (בלוח הבקרה של Supabase, לא ב-SQL):
--   1. Authentication → Providers → הפעל Email (Magic Link) ו-Google.
--   2. Authentication → URL Configuration → הוסף את כתובת האפליקציה.
--   3. הוסף מיילים ל-allowed_emails (כאן ב-SQL, או דרך Table Editor).
--   4. חבר את הפרונטאנד עם ה-URL וה-anon key (שלב 3 בפרויקט).
-- ============================================================================
