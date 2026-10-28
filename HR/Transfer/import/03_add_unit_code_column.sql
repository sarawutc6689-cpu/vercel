-- ============================================================
-- 03_add_unit_code_column.sql
-- เพิ่มคอลัมน์ unit_code เก็บรหัสหน่วยงานเดิมจากระบบเก่าไว้อ้างอิง
-- รันไฟล์นี้ "ครั้งเดียว" ก่อนนำเข้าข้อมูลหน่วยงาน (ปลอดภัยกับข้อมูลเดิม)
-- ============================================================

alter table units add column if not exists unit_code text;
create unique index if not exists idx_units_unit_code on units(unit_code) where unit_code is not null;
