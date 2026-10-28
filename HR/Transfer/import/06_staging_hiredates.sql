-- ============================================================
-- 06_staging_hiredates.sql
-- สร้างตารางพักข้อมูลวันที่เริ่มงาน ก่อนอัปโหลด CSV
-- รูปแบบวันที่ในไฟล์ต้องเป็น DD/MM/YYYY แบบไทย ปี พ.ศ. (เช่น 26/03/2558)
-- ============================================================
drop table if exists staging_hire_dates;
create table staging_hire_dates (
  employee_code text,
  hire_date text
);
-- รันไฟล์นี้แล้วอัปโหลด hire_dates_template.csv เข้าตาราง staging_hire_dates
