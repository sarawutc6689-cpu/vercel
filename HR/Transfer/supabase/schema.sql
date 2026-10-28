-- ============================================================
-- ระบบโอนย้ายพนักงาน (Employee Transfer System)
-- รันไฟล์นี้ทั้งหมดใน Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ------------------------------------------------------------
-- 0. เปิด extension ที่ต้องใช้ (gen_random_uuid)
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. ตารางหลัก
-- ------------------------------------------------------------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  color text not null default '#2C6FBB',
  created_at timestamptz default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  full_name text not null,
  home_department_id uuid not null references departments(id),
  current_department_id uuid not null references departments(id),
  current_unit_id uuid references units(id),
  status text not null default 'normal'
    check (status in ('normal','pending_transfer','on_loan')),
  created_at timestamptz default now()
);

create table if not exists transfer_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text unique not null default ('TR-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  source_department_id uuid not null references departments(id),
  destination_department_id uuid not null references departments(id),
  start_date date not null,
  end_date date not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','returned','partially_returned')),
  requested_by uuid,
  created_at timestamptz default now(),
  check (end_date >= start_date)
);

create table if not exists transfer_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references transfer_requests(id) on delete cascade,
  employee_id uuid not null references employees(id),
  destination_unit_id uuid references units(id),
  item_status text not null default 'pending'
    check (item_status in ('pending','approved','rejected','returned')),
  approved_by uuid,
  approved_at timestamptz,
  returned_at timestamptz,
  reject_reason text,
  unique(request_id, employee_id)
);

create table if not exists transfer_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references transfer_requests(id),
  item_id uuid references transfer_request_items(id),
  employee_id uuid not null references employees(id),
  from_department_id uuid not null references departments(id),
  to_department_id uuid not null references departments(id),
  to_unit_id uuid references units(id),
  action text not null check (action in ('approved','rejected','returned')),
  note text,
  actor_id uuid,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. Index
-- ------------------------------------------------------------
create index if not exists idx_employees_home_dept on employees(home_department_id);
create index if not exists idx_employees_current_dept on employees(current_department_id);
create index if not exists idx_employees_status on employees(status);
create index if not exists idx_tr_status on transfer_requests(status);
create index if not exists idx_tri_request on transfer_request_items(request_id);
create index if not exists idx_tri_employee on transfer_request_items(employee_id);
create index if not exists idx_tri_status on transfer_request_items(item_status);
create index if not exists idx_history_employee on transfer_history(employee_id);
create index if not exists idx_history_created on transfer_history(created_at desc);

-- ------------------------------------------------------------
-- 3. Views (ใช้เลี้ยงหน้าจอโดยตรง ลด join ฝั่ง client)
-- ------------------------------------------------------------
create or replace view v_transfer_requests_list as
select
  tri.id as item_id,
  tri.item_status,
  tri.destination_unit_id,
  tri.reject_reason,
  tr.id as request_id,
  tr.request_no,
  tr.status as request_status,
  tr.source_department_id,
  tr.destination_department_id,
  tr.start_date,
  tr.end_date,
  tr.note,
  tr.created_at,
  e.id as employee_id,
  e.employee_code,
  e.full_name
from transfer_request_items tri
join transfer_requests tr on tr.id = tri.request_id
join employees e on e.id = tri.employee_id
order by tr.created_at desc;

create or replace view v_employees_on_loan as
select
  e.id as employee_id,
  e.employee_code,
  e.full_name,
  e.home_department_id,
  e.current_department_id,
  e.current_unit_id,
  tri.id as item_id,
  tr.id as request_id,
  tr.request_no,
  tr.start_date,
  tr.end_date
from employees e
join transfer_request_items tri on tri.employee_id = e.id and tri.item_status = 'approved'
join transfer_requests tr on tr.id = tri.request_id
where e.status = 'on_loan';

create or replace view v_transfer_history as
select
  th.id,
  th.action,
  th.note,
  th.created_at,
  th.employee_id,
  th.from_department_id,
  th.to_department_id,
  th.to_unit_id,
  tr.request_no,
  e.employee_code,
  e.full_name
from transfer_history th
left join transfer_requests tr on tr.id = th.request_id
left join employees e on e.id = th.employee_id
order by th.created_at desc;

-- ------------------------------------------------------------
-- 4. Helper: คำนวณสถานะรวมของคำขอ จากสถานะของแต่ละ item
-- ------------------------------------------------------------
create or replace function recompute_request_status(p_request_id uuid) returns void as $$
declare
  v_status text;
begin
  select case
    when bool_and(item_status = 'pending') then 'pending'
    when bool_and(item_status = 'rejected') then 'rejected'
    when bool_and(item_status = 'returned') then 'returned'
    when bool_and(item_status in ('approved','returned')) and bool_or(item_status = 'returned') then 'partially_returned'
    when bool_and(item_status = 'approved') then 'approved'
    else 'pending'
  end into v_status
  from transfer_request_items
  where request_id = p_request_id;

  update transfer_requests set status = coalesce(v_status, status) where id = p_request_id;
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 5. RPC: สร้างคำขอโอนย้าย (หน้า 1)
-- ------------------------------------------------------------
create or replace function create_transfer_request(
  p_source_department_id uuid,
  p_destination_department_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text,
  p_employee_ids uuid[],
  p_requested_by uuid default null
) returns uuid as $$
declare
  v_request_id uuid;
  v_bad_count int;
begin
  if array_length(p_employee_ids, 1) is null then
    raise exception 'ต้องเลือกพนักงานอย่างน้อย 1 คน';
  end if;

  select count(*) into v_bad_count
  from employees
  where id = any(p_employee_ids) and status <> 'normal';
  if v_bad_count > 0 then
    raise exception 'มีพนักงานบางคนไม่อยู่ในสถานะปกติ (อาจถูกยืมตัวอยู่แล้ว)';
  end if;

  insert into transfer_requests
    (source_department_id, destination_department_id, start_date, end_date, note, requested_by)
  values
    (p_source_department_id, p_destination_department_id, p_start_date, p_end_date, p_note, p_requested_by)
  returning id into v_request_id;

  insert into transfer_request_items (request_id, employee_id)
  select v_request_id, unnest(p_employee_ids);

  update employees set status = 'pending_transfer' where id = any(p_employee_ids);

  return v_request_id;
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 6. RPC: อนุมัติ / ปฏิเสธ / คืนตัว รายพนักงาน (หน้า 2 และ 3)
-- ------------------------------------------------------------
create or replace function approve_transfer_item(
  p_item_id uuid,
  p_unit_id uuid,
  p_approver_id uuid default null
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
begin
  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  select * into v_req from transfer_requests where id = v_item.request_id;

  update transfer_request_items
    set item_status = 'approved', destination_unit_id = p_unit_id,
        approved_by = p_approver_id, approved_at = now()
  where id = p_item_id;

  update employees
    set status = 'on_loan',
        current_department_id = v_req.destination_department_id,
        current_unit_id = p_unit_id
  where id = v_item.employee_id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, to_unit_id, action, actor_id)
  values
    (v_req.id, p_item_id, v_item.employee_id, v_req.source_department_id, v_req.destination_department_id, p_unit_id, 'approved', p_approver_id);

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

create or replace function reject_transfer_item(
  p_item_id uuid,
  p_reason text default null,
  p_approver_id uuid default null
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
begin
  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  select * into v_req from transfer_requests where id = v_item.request_id;

  update transfer_request_items
    set item_status = 'rejected', reject_reason = p_reason,
        approved_by = p_approver_id, approved_at = now()
  where id = p_item_id;

  update employees set status = 'normal' where id = v_item.employee_id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, action, note, actor_id)
  values
    (v_req.id, p_item_id, v_item.employee_id, v_req.source_department_id, v_req.destination_department_id, 'rejected', p_reason, p_approver_id);

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

create or replace function return_transfer_item(
  p_item_id uuid,
  p_note text default null,
  p_actor_id uuid default null
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
  v_emp employees%rowtype;
begin
  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  if v_item.item_status <> 'approved' then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะกำลังโอนย้าย';
  end if;
  select * into v_req from transfer_requests where id = v_item.request_id;
  select * into v_emp from employees where id = v_item.employee_id;

  update transfer_request_items
    set item_status = 'returned', returned_at = now()
  where id = p_item_id;

  update employees
    set status = 'normal', current_department_id = home_department_id, current_unit_id = null
  where id = v_emp.id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, action, note, actor_id)
  values
    (v_req.id, p_item_id, v_emp.id, v_req.destination_department_id, v_emp.home_department_id, 'returned', p_note, p_actor_id);

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 7. Row Level Security
-- ------------------------------------------------------------
-- ปิดไว้เป็นค่าเริ่มต้นเพื่อให้ทดสอบด้วย anon key ได้ทันที
-- ก่อนใช้งานจริง ควรเปิดและตั้ง policy ตามสิทธิ์ของผู้ใช้แต่ละแผนก เช่น:
--
--   alter table transfer_requests enable row level security;
--   alter table transfer_request_items enable row level security;
--   alter table employees enable row level security;
--
--   create policy "read all authenticated" on transfer_requests
--     for select using (auth.role() = 'authenticated');
--
--   create policy "insert own department" on transfer_requests
--     for insert with check (
--       source_department_id in (
--         select department_id from profiles where user_id = auth.uid()
--       )
--     );
--
-- (ตาราง profiles ผูก auth.users กับแผนก ต้องสร้างเพิ่มตามระบบ auth ที่ใช้จริง)

-- ------------------------------------------------------------
-- 8. ข้อมูลตัวอย่าง (Seed data) — ลบทิ้งได้ถ้าไม่ต้องการ
-- ------------------------------------------------------------
insert into departments (code, name, color) values
  ('IT',  'แผนกเทคโนโลยีสารสนเทศ', '#2C6FBB'),
  ('HR',  'แผนกทรัพยากรบุคคล',      '#0F9D82'),
  ('FIN', 'แผนกการเงิน',             '#C97A1F'),
  ('OPS', 'แผนกปฏิบัติการ',           '#7C4FC9'),
  ('MKT', 'แผนกการตลาด',             '#C7433F')
on conflict (code) do nothing;

insert into units (department_id, name)
select d.id, u.name from departments d
join (values
  ('IT','ทีมพัฒนาระบบ'), ('IT','ทีมซัพพอร์ตไอที'),
  ('HR','ทีมสรรหาบุคลากร'), ('HR','ทีมพัฒนาบุคลากร'),
  ('FIN','ทีมบัญชี'), ('FIN','ทีมงบประมาณ'),
  ('OPS','ทีมคลังสินค้า'), ('OPS','ทีมขนส่ง'),
  ('MKT','ทีมสื่อสารการตลาด'), ('MKT','ทีมกิจกรรม')
) as u(dept_code, name) on u.dept_code = d.code;

insert into employees (employee_code, full_name, home_department_id, current_department_id)
select e.code, e.name, d.id, d.id from
(values
  ('EMP-1001','สมชาย ใจดี','IT'),
  ('EMP-1002','วรรณา ศรีสุข','IT'),
  ('EMP-1003','ประยุทธ์ มั่นคง','IT'),
  ('EMP-1004','กัญญา รุ่งเรือง','IT'),
  ('EMP-1005','ธนพล อุดมทรัพย์','HR'),
  ('EMP-1006','สุภาพร แสงทอง','HR'),
  ('EMP-1007','อนุชา พงษ์พันธ์','FIN'),
  ('EMP-1008','มณีรัตน์ ทองคำ','FIN'),
  ('EMP-1009','ปิยะพงษ์ ชัยชนะ','OPS'),
  ('EMP-1010','รัตนา ศิริวัฒน์','OPS'),
  ('EMP-1011','ชาญวิทย์ เพชรดี','MKT'),
  ('EMP-1012','นิภาพร บุญมี','MKT')
) as e(code, name, dept_code)
join departments d on d.code = e.dept_code
on conflict (employee_code) do nothing;

-- จบไฟล์ — ตรวจสอบว่ารันสำเร็จโดยไม่มี error สีแดงใน SQL Editor
