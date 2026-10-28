-- ============================================================
-- 02_load_from_staging.sql
-- รันหลังจากอัปโหลด CSV เข้า staging_units และ staging_employees แล้ว
-- ย้ายข้อมูลเข้าตารางจริง โดยจับคู่ dept_code -> departments.id ให้อัตโนมัติ
-- ============================================================

-- ตรวจสอบก่อนว่า dept_code ทุกตัวใน staging มีอยู่จริงในตาราง departments
-- (ถ้ามีแถวใดถูก list ออกมา แปลว่าพิมพ์รหัสแผนกผิด แก้ CSV แล้วอัปโหลดใหม่ก่อน)
select distinct dept_code from staging_units
where dept_code not in (select code from departments)
union
select distinct dept_code from staging_employees
where dept_code not in (select code from departments);

-- ถ้า query ด้านบนไม่มีแถวขึ้นมาเลย ให้รันต่อด้านล่างนี้ได้เลย

insert into units (department_id, name, unit_code)
select d.id, su.name, nullif(su.unit_code, '')
from staging_units su
join departments d on d.code = su.dept_code
on conflict do nothing;

insert into employees (employee_code, full_name, home_department_id, current_department_id)
select se.employee_code, se.full_name, d.id, d.id
from staging_employees se
join departments d on d.code = se.dept_code
on conflict (employee_code) do nothing;

-- ล้างตารางพักข้อมูลทิ้งหลังนำเข้าเสร็จ
drop table if exists staging_units;
drop table if exists staging_employees;

-- ตรวจผลลัพธ์
select
  (select count(*) from departments) as total_departments,
  (select count(*) from units) as total_units,
  (select count(*) from employees) as total_employees;
