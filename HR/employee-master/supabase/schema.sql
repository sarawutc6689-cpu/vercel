-- ============================================================
-- schema.sql — โปรเจกต์ Employee-Master
-- ฐานข้อมูลกลางสำหรับเพิ่ม/จัดการพนักงาน แล้วกระจายไปทุกระบบที่เชื่อมต่อ
-- (ตอนนี้คือ ระบบโอนย้ายพนักงาน + OT-Tracking / รองรับระบบอื่นในอนาคต)
-- รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Employee-Master (โปรเจกต์ใหม่ที่สร้างแยก)
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 1. ตารางแผนก (คัดลอกมาตรฐานจากระบบโอนย้ายพนักงาน)
-- ------------------------------------------------------------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

-- ------------------------------------------------------------
-- 2. ตารางพนักงานกลาง — รวมฟิลด์ที่ทุกระบบต้องการ
-- ------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  full_name text not null,
  department_id uuid not null references departments(id),
  section text,         -- ใช้โดย OT-Tracking (หมวดหมู่กว้างกว่าแผนก)
  position text,        -- ใช้โดย OT-Tracking (ตำแหน่งงาน)
  hire_date date,        -- ใช้โดยระบบโอนย้ายพนักงาน (ตั้งรหัสผ่านเริ่มต้น)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. RLS — ต้อง login (Supabase Auth) ก่อนถึงจะอ่าน/เขียนได้
-- ------------------------------------------------------------
alter table departments enable row level security;
alter table employees enable row level security;

drop policy if exists "read depts" on departments;
create policy "read depts" on departments for select using (auth.role() = 'authenticated');

drop policy if exists "read employees" on employees;
create policy "read employees" on employees for select using (auth.role() = 'authenticated');

drop policy if exists "write employees" on employees;
create policy "write employees" on employees for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 4. Trigger: กระจายข้อมูลออกไปทุกระบบที่เชื่อมต่อ ทุกครั้งที่เพิ่ม/แก้ไขพนักงาน
--
-- ⚠️ ต้องแก้ 4 ค่านี้ให้เป็นของจริงก่อนรัน (หาได้จาก Project Settings -> API
--     ของแต่ละโปรเจกต์):
--   TRANSFER-PROJECT-REF / TRANSFER-SERVICE-ROLE-KEY -> ของระบบโอนย้ายพนักงาน
--   OT-PROJECT-REF / OT-SERVICE-ROLE-KEY              -> ของ OT-Tracking
-- ------------------------------------------------------------
create or replace function fanout_employee_sync() returns trigger as $$
declare
  v_dept_code text;
  v_dept_name text;
begin
  select code, name into v_dept_code, v_dept_name from departments where id = NEW.department_id;

  -- ---- ส่งไปยังระบบโอนย้ายพนักงาน (ผ่าน RPC ที่แปลง department_code -> UUID ให้เอง) ----
  perform net.http_post(
    url := 'https://TRANSFER-PROJECT-REF.supabase.co/rest/v1/rpc/sync_upsert_employee_from_master',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'TRANSFER-SERVICE-ROLE-KEY',
      'Authorization', 'Bearer TRANSFER-SERVICE-ROLE-KEY'
    ),
    body := jsonb_build_object(
      'p_employee_code', NEW.employee_code,
      'p_full_name', NEW.full_name,
      'p_department_code', v_dept_code,
      'p_hire_date', NEW.hire_date
    )
  );

  -- ---- ส่งไปยัง OT-Tracking (upsert ตรงๆ ผ่าน REST เหมือน transfer_block_status) ----
  perform net.http_post(
    url := 'https://OT-PROJECT-REF.supabase.co/rest/v1/employees',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'OT-SERVICE-ROLE-KEY',
      'Authorization', 'Bearer OT-SERVICE-ROLE-KEY',
      'Prefer', 'resolution=merge-duplicates'
    ),
    body := jsonb_build_object(
      'code', NEW.employee_code,
      'name', NEW.full_name,
      'section', NEW.section,
      'department', v_dept_name,
      'position', NEW.position
    )
  );

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_fanout_employee_sync on employees;
create trigger trg_fanout_employee_sync
after insert or update on employees
for each row execute function fanout_employee_sync();

-- ------------------------------------------------------------
-- 5. อัปเดต updated_at อัตโนมัติ
-- ------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on employees;
create trigger trg_set_updated_at
before update on employees
for each row execute function set_updated_at();
