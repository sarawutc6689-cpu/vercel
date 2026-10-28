# Employee Master — ฐานข้อมูลกลางพนักงาน

เพิ่ม/แก้ไขพนักงานที่นี่ที่เดียว ระบบที่เชื่อมต่อ (ระบบโอนย้ายพนักงาน, OT-Tracking,
และระบบอื่นในอนาคต) จะได้รับข้อมูลอัปเดตอัตโนมัติทันที ไม่ต้องกรอกซ้ำ

---

## ภาพรวมสถาปัตยกรรม

```
Employee Master (โปรเจกต์ใหม่)
        │  บันทึกพนักงาน → trigger ยิงออกทันที
        ├──→ ระบบโอนย้ายพนักงาน (ผ่าน RPC แปลง department_code → UUID)
        └──→ OT-Tracking (ผ่าน REST upsert ตรงๆ)
```

ทิศทางเดียว: กรอกที่ Employee Master → กระจายออก ไม่ดึงข้อมูลย้อนกลับ

---

## ขั้นตอนที่ 1 — สร้างโปรเจกต์ Supabase ใหม่

1. เข้า https://supabase.com/dashboard → **New project**
2. ตั้งชื่อ เช่น `Employee-Master`
3. รอสร้างเสร็จ (1-2 นาที)
4. เก็บ **Project URL** และ **anon public key** ไว้ (Project Settings → API)

---

## ขั้นตอนที่ 2 — รัน Schema

SQL Editor ของโปรเจกต์ **Employee-Master** (ใหม่) → รัน `supabase/schema.sql`

ไฟล์นี้จะสร้างตาราง `departments`, `employees`, เปิด RLS, และเตรียม trigger
กระจายข้อมูล (ยังใช้งานไม่ได้จนกว่าจะแก้ค่าจริงในขั้นตอนที่ 4)

---

## ขั้นตอนที่ 3 — คัดลอกรายชื่อแผนกมาตรฐาน

1. SQL Editor ของ **ระบบโอนย้ายพนักงาน** → รัน `supabase/generate_department_seed.sql`
2. จะได้ผลลัพธ์เป็นคำสั่ง `insert into departments...` 1 ก้อนยาวๆ → copy ทั้งหมด
3. ไปวางรันใน SQL Editor ของ **Employee-Master** → จะได้แผนกครบ 41 แผนกตรงกัน

---

## ขั้นตอนที่ 4 — เพิ่ม RPC รับข้อมูลฝั่งระบบโอนย้ายพนักงาน

SQL Editor ของ **ระบบโอนย้ายพนักงาน** → รัน `import/22_sync_from_employee_master.sql`

สร้างฟังก์ชัน `sync_upsert_employee_from_master` ที่ Employee Master จะเรียกมา
(ปิดสิทธิ์ไม่ให้ผู้ใช้ทั่วไปเรียกได้ เรียกได้เฉพาะผ่าน service_role key เท่านั้น)

---

## ขั้นตอนที่ 5 — เชื่อม Trigger ให้กระจายข้อมูลจริง

เปิดไฟล์ `supabase/schema.sql` (ที่รันไปแล้วในขั้นตอนที่ 2) หา **ฟังก์ชัน
`fanout_employee_sync`** แล้วแก้ 4 ค่านี้ให้เป็นของจริง (หาได้จาก Project
Settings → API ของแต่ละโปรเจกต์):

| ค่าที่ต้องแก้ | หาได้จาก |
|---|---|
| `TRANSFER-PROJECT-REF` | Project URL ของระบบโอนย้ายพนักงาน |
| `TRANSFER-SERVICE-ROLE-KEY` | service_role key ของระบบโอนย้ายพนักงาน |
| `OT-PROJECT-REF` | Project URL ของ OT-Tracking |
| `OT-SERVICE-ROLE-KEY` | service_role key ของ OT-Tracking |

แก้เสร็จแล้ว **รันซ้ำเฉพาะส่วน `create or replace function fanout_employee_sync...`
ถึง `create trigger trg_fanout_employee_sync...`** ใน SQL Editor ของ Employee-Master
อีกครั้ง (ไม่ต้องรันทั้งไฟล์ใหม่ทั้งหมด รันแค่ 2 คำสั่งนี้ก็พอ)

---

## ขั้นตอนที่ 6 — ตั้งค่าเว็บ (assets/config.js)

แก้ `employee-master/assets/config.js` ใส่ URL + anon key ของ Employee-Master
(จากขั้นตอนที่ 1) — เหมือนที่เคยทำกับระบบโอนย้ายพนักงาน

---

## ขั้นตอนที่ 7 — สร้างบัญชีผู้ใช้

Supabase Dashboard ของ **Employee-Master** → เมนู **Authentication** →
**Add user** → กรอกอีเมล + รหัสผ่านสำหรับผู้ที่จะเข้าใช้หน้านี้ (สร้างกี่คนก็ได้)
ไม่ต้องรันสคริปต์อะไรเพิ่ม ทำผ่านหน้า Dashboard ได้เลย

---

## ขั้นตอนที่ 8 — Deploy ขึ้น GitHub Pages

สร้าง repository ใหม่แยกต่างหาก (คนละ repo กับระบบโอนย้ายพนักงาน) → อัปโหลด
โฟลเดอร์ `employee-master/` ทั้งหมดขึ้นไป → เปิดใช้งาน GitHub Pages เหมือนที่เคยทำ

---

## ขั้นตอนที่ 9 — ทดสอบ

1. เปิดเว็บ Employee-Master → login ด้วยบัญชีที่สร้างไว้
2. เพิ่มพนักงานทดสอบ 1 คน (ใช้รหัสพนักงานที่ยังไม่มีในทั้ง 2 ระบบ)
3. เช็ค SQL Editor ของ **ระบบโอนย้ายพนักงาน**: `select * from employees where employee_code = 'รหัสที่ทดสอบ';` → ควรเจอ
4. เช็ค SQL Editor ของ **OT-Tracking**: `select * from employees where code = 'รหัสที่ทดสอบ';` → ควรเจอ
5. ถ้าไม่เจอฝั่งไหน เช็ค log การเรียก http ได้ด้วย:
   ```sql
   select * from net._http_response order by id desc limit 5;
   ```
   (รันใน SQL Editor ของ **Employee-Master** เพราะเป็นฝั่งที่ยิงออกไป)

---

## หมายเหตุ

- เพิ่มระบบใหม่ในอนาคต: แค่เพิ่ม `perform net.http_post(...)` อีกก้อนในฟังก์ชัน
  `fanout_employee_sync` ชี้ไปโปรเจกต์ใหม่ ไม่ต้องแก้อะไรที่อื่น
- ทิศทางเป็นทางเดียวเท่านั้น (Master → ระบบอื่น) การแก้ไขข้อมูลพนักงานที่มีอยู่แล้ว
  ในระบบโอนย้ายพนักงานหรือ OT-Tracking โดยตรง (ไม่ผ่าน Employee Master) จะไม่ถูก
  ดึงกลับมาที่ Master และจะถูกทับได้ถ้ามีการบันทึกซ้ำที่ Master ทีหลัง — แนะนำให้
  ใช้ Employee Master เป็นจุดแก้ไขข้อมูลพนักงานหลักแต่นี้ไปเพื่อไม่ให้ข้อมูลสวนทางกัน
