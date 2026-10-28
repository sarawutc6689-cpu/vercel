-- ============================================================
-- 04_disable_rls.sql
-- ใช้เมื่อพบว่า RLS ถูกเปิดอยู่โดยไม่มี policy (ทำให้ query คืน 0 แถวเสมอ)
-- ปิดกลับเพื่อให้ anon key อ่าน/เขียนข้อมูลได้ตามปกติระหว่างพัฒนา/ทดสอบ
-- ⚠️ ก่อนใช้งานจริงกับข้อมูลพนักงานจริง ต้องกลับมาเปิด RLS พร้อมตั้ง policy ที่เหมาะสม
-- ============================================================

alter table departments disable row level security;
alter table units disable row level security;
alter table employees disable row level security;
alter table transfer_requests disable row level security;
alter table transfer_request_items disable row level security;
alter table transfer_history disable row level security;

-- ตรวจสอบสถานะหลังปิด (ทุกแถวควรขึ้น rowsecurity = false)
select relname, relrowsecurity
from pg_class
where relname in ('departments','units','employees','transfer_requests','transfer_request_items','transfer_history');
