-- ============================================================
-- 07_load_hire_dates.sql
-- ย้ายวันที่เริ่มงานจาก staging เข้าตาราง employees จริง
-- รองรับรูปแบบไทย DD/MM/YYYY (ปี พ.ศ.) เช่น 26/03/2558
-- แปลงปี พ.ศ. -> ค.ศ. ให้อัตโนมัติ (ลบ 543 ถ้าปีมากกว่า 2400)
-- ============================================================

-- ตรวจก่อนว่ามี employee_code ไหนไม่ตรงกับที่มีอยู่จริงหรือไม่
select employee_code from staging_hire_dates
where employee_code not in (select employee_code from employees);

-- ตรวจก่อนว่ามีแถวไหนรูปแบบวันที่ผิดปกติหรือไม่ (ไม่ใช่ DD/MM/YYYY)
select employee_code, hire_date from staging_hire_dates
where hire_date !~ '^\d{1,2}/\d{1,2}/\d{4}$';

-- ถ้าทั้งสอง query ด้านบนไม่มีแถวขึ้นมา รันต่อด้านล่างนี้ได้เลย
update employees e
set hire_date = make_date(
  case
    when split_part(s.hire_date, '/', 3)::int > 2400
    then split_part(s.hire_date, '/', 3)::int - 543   -- ปี พ.ศ. -> ค.ศ.
    else split_part(s.hire_date, '/', 3)::int
  end,
  split_part(s.hire_date, '/', 2)::int,  -- เดือน
  split_part(s.hire_date, '/', 1)::int   -- วัน
)
from staging_hire_dates s
where s.employee_code = e.employee_code;

drop table if exists staging_hire_dates;

-- ตรวจผล: ควรมีจำนวนพนักงานที่ยังไม่มีวันที่เริ่มงานเป็น 0 (หรือน้อยที่สุด)
select count(*) as employees_missing_hire_date from employees where hire_date is null;

-- สุ่มตรวจผลลัพธ์ 10 แถว ดูว่าแปลงปีถูกต้อง (ควรเป็นปี ค.ศ. ทั้งหมด เช่น 2015 ไม่ใช่ 2558)
select employee_code, hire_date from employees where hire_date is not null limit 10;

