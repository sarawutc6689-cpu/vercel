-- ============================================================
-- generate_department_seed.sql
-- รันไฟล์นี้ใน SQL Editor ของ "ระบบโอนย้ายพนักงาน" (โปรเจกต์นี้)
-- ผลลัพธ์ที่ได้คือคำสั่ง INSERT พร้อมใช้ 1 ก้อน — copy ไปวางรันต่อ
-- ใน SQL Editor ของโปรเจกต์ "Employee-Master" เพื่อคัดลอกแผนกทั้งหมดไปให้ตรงกัน
-- ============================================================

select 'insert into departments (code, name) values' || chr(10) ||
  string_agg(
    format('  (%L, %L)', code, name),
    ',' || chr(10)
    order by code
  ) || ' on conflict (code) do nothing;' as sql_to_copy
from departments;
