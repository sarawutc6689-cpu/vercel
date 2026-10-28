-- ============================================================
-- auth_and_rls.sql
-- เพิ่มระบบสิทธิ์ผู้ใช้ (profiles) + เปิด RLS จริง + ปรับ RPC ให้เช็คสิทธิ์
-- รันหลังจาก schema.sql และ import ข้อมูล (departments/units/employees) เสร็จแล้ว
-- ============================================================

-- ------------------------------------------------------------
-- 1. ตาราง profiles — ผูก user ที่ login กับพนักงาน + บทบาท
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid unique references employees(id),
  role text not null default 'staff' check (role in ('staff','dept_approver','admin')),
  created_at timestamptz default now()
);

-- มุมมองสะดวกใช้ฝั่งหน้าเว็บ: ข้อมูลตัวเองพร้อมชื่อ/แผนก/บทบาท
create or replace view v_my_profile as
select
  p.id, p.role,
  e.id as employee_id, e.employee_code, e.full_name,
  e.current_department_id, d.name as department_name
from profiles p
join employees e on e.id = p.employee_id
join departments d on d.id = e.current_department_id
where p.id = auth.uid();

-- ------------------------------------------------------------
-- 2. เปิด RLS ทุกตารางหลัก
-- ------------------------------------------------------------
alter table departments enable row level security;
alter table units enable row level security;
alter table employees enable row level security;
alter table transfer_requests enable row level security;
alter table transfer_request_items enable row level security;
alter table transfer_history enable row level security;
alter table profiles enable row level security;

-- ------------------------------------------------------------
-- 3. Policy: ข้อมูลอ้างอิง (แผนก/หน่วยงาน/พนักงาน) อ่านได้ทุกคนที่ login แล้ว
-- ------------------------------------------------------------
drop policy if exists "read depts" on departments;
create policy "read depts" on departments for select using (auth.role() = 'authenticated');

drop policy if exists "read units" on units;
create policy "read units" on units for select using (auth.role() = 'authenticated');

drop policy if exists "read employees" on employees;
create policy "read employees" on employees for select using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 4. Policy: profiles — เห็นแค่ของตัวเอง (admin เห็นทุกคนผ่านฟังก์ชันแยก ไม่ต้องพึ่ง RLS ตรงนี้)
-- ------------------------------------------------------------
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select using (id = auth.uid());

-- ------------------------------------------------------------
-- 5. Policy: transfer_requests / transfer_request_items — เห็นเฉพาะที่เกี่ยวข้อง
-- (การ insert/update จริงทำผ่าน RPC เท่านั้น ซึ่งเช็คสิทธิ์เองอีกชั้นด้านล่าง)
-- ------------------------------------------------------------
drop policy if exists "select relevant requests" on transfer_requests;
create policy "select relevant requests" on transfer_requests for select using (
  exists (
    select 1 from profiles p
    join employees e on e.id = p.employee_id
    where p.id = auth.uid()
    and (
      p.role = 'admin'
      or e.current_department_id = transfer_requests.source_department_id
      or e.current_department_id = transfer_requests.destination_department_id
    )
  )
);

drop policy if exists "select relevant items" on transfer_request_items;
create policy "select relevant items" on transfer_request_items for select using (
  exists (
    select 1 from transfer_requests tr
    join profiles p on p.id = auth.uid()
    join employees e on e.id = p.employee_id
    where tr.id = transfer_request_items.request_id
    and (
      p.role = 'admin'
      or e.current_department_id = tr.source_department_id
      or e.current_department_id = tr.destination_department_id
    )
  )
);

drop policy if exists "select relevant history" on transfer_history;
create policy "select relevant history" on transfer_history for select using (
  exists (
    select 1 from profiles p
    join employees e on e.id = p.employee_id
    where p.id = auth.uid()
    and (
      p.role = 'admin'
      or e.current_department_id = transfer_history.from_department_id
      or e.current_department_id = transfer_history.to_department_id
    )
  )
);

-- ------------------------------------------------------------
-- 6. ปรับ RPC ให้เช็คสิทธิ์จริงจาก auth.uid() แทนการเชื่อค่าที่ client ส่งมา
-- (สำคัญ: ฟังก์ชันเดิมเป็น SECURITY DEFINER จึงข้าม RLS ได้ — ต้องเช็คสิทธิ์เองในฟังก์ชัน)
-- ------------------------------------------------------------

create or replace function create_transfer_request(
  p_source_department_id uuid,
  p_destination_department_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text,
  p_employee_ids uuid[]
) returns uuid as $$
declare
  v_request_id uuid;
  v_bad_count int;
  v_caller_dept uuid;
begin
  select e.current_department_id into v_caller_dept
  from profiles p join employees e on e.id = p.employee_id
  where p.id = auth.uid();

  if v_caller_dept is null then
    raise exception 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่';
  end if;
  if v_caller_dept <> p_source_department_id then
    raise exception 'สร้างคำขอได้เฉพาะจากแผนกต้นสังกัดของตัวเองเท่านั้น';
  end if;
  if array_length(p_employee_ids, 1) is null then
    raise exception 'ต้องเลือกพนักงานอย่างน้อย 1 คน';
  end if;

  select count(*) into v_bad_count
  from employees where id = any(p_employee_ids) and status <> 'normal';
  if v_bad_count > 0 then
    raise exception 'มีพนักงานบางคนไม่อยู่ในสถานะปกติ (อาจถูกยืมตัวอยู่แล้ว)';
  end if;

  insert into transfer_requests
    (source_department_id, destination_department_id, start_date, end_date, note, requested_by)
  values
    (p_source_department_id, p_destination_department_id, p_start_date, p_end_date, p_note, auth.uid())
  returning id into v_request_id;

  insert into transfer_request_items (request_id, employee_id)
  select v_request_id, unnest(p_employee_ids);

  update employees set status = 'pending_transfer' where id = any(p_employee_ids);

  return v_request_id;
end;
$$ language plpgsql security definer;

create or replace function approve_transfer_item(
  p_item_id uuid,
  p_unit_id uuid
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
  v_caller_role text;
  v_caller_dept uuid;
begin
  select p.role, e.current_department_id into v_caller_role, v_caller_dept
  from profiles p join employees e on e.id = p.employee_id
  where p.id = auth.uid();

  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  select * into v_req from transfer_requests where id = v_item.request_id;

  if v_caller_role is null then
    raise exception 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่';
  end if;
  if v_caller_role <> 'admin' and v_caller_dept <> v_req.destination_department_id then
    raise exception 'ไม่มีสิทธิ์อนุมัติคำขอนี้ (ต้องเป็นหัวหน้าแผนกปลายทาง หรือแอดมิน)';
  end if;

  update transfer_request_items
    set item_status = 'approved', destination_unit_id = p_unit_id,
        approved_by = auth.uid(), approved_at = now()
  where id = p_item_id;

  update employees
    set status = 'on_loan',
        current_department_id = v_req.destination_department_id,
        current_unit_id = p_unit_id
  where id = v_item.employee_id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, to_unit_id, action, actor_id)
  values
    (v_req.id, p_item_id, v_item.employee_id, v_req.source_department_id, v_req.destination_department_id, p_unit_id, 'approved', auth.uid());

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

create or replace function reject_transfer_item(
  p_item_id uuid,
  p_reason text default null
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
  v_caller_role text;
  v_caller_dept uuid;
begin
  select p.role, e.current_department_id into v_caller_role, v_caller_dept
  from profiles p join employees e on e.id = p.employee_id
  where p.id = auth.uid();

  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  select * into v_req from transfer_requests where id = v_item.request_id;

  if v_caller_role is null then
    raise exception 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่';
  end if;
  if v_caller_role <> 'admin' and v_caller_dept <> v_req.destination_department_id then
    raise exception 'ไม่มีสิทธิ์ปฏิเสธคำขอนี้ (ต้องเป็นหัวหน้าแผนกปลายทาง หรือแอดมิน)';
  end if;

  update transfer_request_items
    set item_status = 'rejected', reject_reason = p_reason,
        approved_by = auth.uid(), approved_at = now()
  where id = p_item_id;

  update employees set status = 'normal' where id = v_item.employee_id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, action, note, actor_id)
  values
    (v_req.id, p_item_id, v_item.employee_id, v_req.source_department_id, v_req.destination_department_id, 'rejected', p_reason, auth.uid());

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

create or replace function return_transfer_item(
  p_item_id uuid,
  p_note text default null
) returns void as $$
declare
  v_item transfer_request_items%rowtype;
  v_req transfer_requests%rowtype;
  v_emp employees%rowtype;
  v_caller_role text;
  v_caller_dept uuid;
begin
  select p.role, e.current_department_id into v_caller_role, v_caller_dept
  from profiles p join employees e on e.id = p.employee_id
  where p.id = auth.uid();

  select * into v_item from transfer_request_items where id = p_item_id;
  if not found then raise exception 'ไม่พบรายการคำขอนี้'; end if;
  if v_item.item_status <> 'approved' then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะกำลังโอนย้าย';
  end if;
  select * into v_req from transfer_requests where id = v_item.request_id;
  select * into v_emp from employees where id = v_item.employee_id;

  if v_caller_role is null then
    raise exception 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่';
  end if;
  if v_caller_role <> 'admin'
     and v_caller_dept <> v_req.source_department_id
     and v_caller_dept <> v_req.destination_department_id then
    raise exception 'ไม่มีสิทธิ์ขอคืนพนักงานรายการนี้';
  end if;

  update transfer_request_items
    set item_status = 'returned', returned_at = now()
  where id = p_item_id;

  update employees
    set status = 'normal', current_department_id = home_department_id, current_unit_id = null
  where id = v_emp.id;

  insert into transfer_history
    (request_id, item_id, employee_id, from_department_id, to_department_id, action, note, actor_id)
  values
    (v_req.id, p_item_id, v_emp.id, v_req.destination_department_id, v_emp.home_department_id, 'returned', p_note, auth.uid());

  perform recompute_request_status(v_req.id);
end;
$$ language plpgsql security definer;

-- เสร็จแล้ว: ตรวจสอบว่ารันสำเร็จโดยไม่มี error
