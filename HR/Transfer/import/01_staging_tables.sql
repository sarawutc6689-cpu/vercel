-- ============================================================
-- 01_staging_tables.sql
-- สร้างตารางพักข้อมูล (staging) เพื่อรับ CSV ของ units และ employees
-- โดยไม่ต้องรู้ UUID ของแผนกล่วงหน้า (ใช้ dept_code จับคู่แทน)
--
-- หมายเหตุ: ก่อนรันไฟล์นี้ ให้รัน 03_add_unit_code_column.sql ก่อน 1 ครั้ง
-- (เพิ่มคอลัมน์ unit_code ในตาราง units จริง)
-- ============================================================

drop table if exists staging_units;
drop table if exists staging_employees;

create table staging_units (
  unit_code text,
  dept_code text,
  name text
);

create table staging_employees (
  employee_code text,
  full_name text,
  dept_code text
);

-- รันไฟล์นี้ครั้งเดียว แล้วไปที่ Table Editor เพื่ออัปโหลด CSV:
--   units_template.csv (unit_code,dept_code,name) -> เข้าตาราง staging_units
--   employees_template.csv                        -> เข้าตาราง staging_employees
