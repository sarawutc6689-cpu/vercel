# ตั้งค่า Auth + RLS (ล็อกอินด้วยรหัสพนักงาน)

ล็อกอิน: **รหัสพนักงาน + วันที่เริ่มงาน (DDMMYYYY ปี พ.ศ.)**
สิทธิ์: พนักงานทุกคนสร้างคำขอจากแผนกตัวเองได้ / หัวหน้าแผนกปลายทางหรือแอดมินอนุมัติได้

---

## ขั้นตอนที่ 1 — เพิ่มวันที่เริ่มงานให้พนักงานทุกคน

1. SQL Editor → รัน `import/05_add_hire_date_column.sql`
2. กรอก `import/hire_dates_template.csv` (คอลัมน์ `employee_code,hire_date` รูปแบบไทย `DD/MM/YYYY` ปี พ.ศ. เช่น `26/03/2558`) ด้วยข้อมูลจริง
3. SQL Editor → รัน `import/06_staging_hiredates.sql`
4. Table Editor → ตาราง `staging_hire_dates` → Import CSV ที่กรอกเสร็จ
5. SQL Editor → รัน `import/07_load_hire_dates.sql` (เช็ค `employee_code` ผิดและรูปแบบวันที่ผิดก่อน แล้วแปลงปี พ.ศ.→ค.ศ. อัตโนมัติ ก่อนอัปเดตเข้าตารางจริง)

⚠️ **พนักงานที่ไม่มี hire_date จะไม่ถูกสร้างบัญชีล็อกอินในขั้นตอนถัดไป** — ควรกรอกให้ครบทุกคนก่อน

---

## ขั้นตอนที่ 2 — เปิดใช้งาน Auth + RLS ในฐานข้อมูล

SQL Editor → รัน `supabase/auth_and_rls.sql`

ไฟล์นี้จะ:
- สร้างตาราง `profiles` (ผูก user login กับพนักงาน + บทบาท `staff`/`dept_approver`/`admin`)
- เปิด RLS ทุกตารางหลัก พร้อม policy ตามสิทธิ์ที่ตกลงกัน
- แก้ RPC ทั้ง 4 ตัว (`create_transfer_request`, `approve_transfer_item`, `reject_transfer_item`, `return_transfer_item`) ให้เช็คสิทธิ์จริงจาก `auth.uid()` แทนการเชื่อค่าที่ client ส่งมา

---

## ขั้นตอนที่ 3 — สร้างบัญชีล็อกอินให้พนักงานทุกคน

รันจาก**เครื่องคอมพิวเตอร์ของคุณเอง** (ไม่ใช่บนเว็บ เพราะต้องใช้ service_role key ที่มีสิทธิ์เต็ม ห้ามฝังในเว็บเด็ดขาด)

```bash
cd auth-setup
npm install
```

หา **service_role key** จาก Supabase Dashboard → Project Settings → API → `service_role` `secret`
(คนละตัวกับ `anon public` key ที่ใช้ใน `assets/config.js`)

```bash
# Linux / Mac
export SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxxxxxx...

# Windows (PowerShell)
$env:SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJxxxxxxxxxxxx..."

node bulk_create_users.js
```

สคริปต์จะสร้างบัญชีให้พนักงานทุกคนที่มี `hire_date` โดยอัตโนมัติ:
- อีเมลภายใน (ผู้ใช้ไม่เห็น): `{รหัสพนักงานตัวเล็ก}@transfer.local`
- รหัสผ่านเริ่มต้น: วันที่เริ่มงาน รูปแบบ `DDMMYYYY` **ปี พ.ศ.** (เช่น เริ่มงาน 26/03/2558 -> รหัสผ่าน `26032558`)
- บทบาทเริ่มต้น: `staff` ทุกคน

รันซ้ำได้อย่างปลอดภัย: คนที่ยังไม่มีบัญชีจะถูกสร้างใหม่ ส่วนคนที่มีบัญชีอยู่แล้วจะถูก **รีเซ็ตรหัสผ่านให้เป็นรูปแบบล่าสุดเสมอ** (เผื่อเคยรันด้วยรูปแบบเก่า หรือมีพนักงานเพิ่มทีหลัง)

---

## ขั้นตอนที่ 4 — ตั้งหัวหน้าแผนก / แอดมิน

ค่าเริ่มต้นทุกคนเป็น `staff` (สร้างคำขอได้ แต่อนุมัติไม่ได้) ต้องอัปเกรดสิทธิ์คนที่ควรอนุมัติได้เอง:

```sql
-- ตั้งเป็นหัวหน้าแผนก (อนุมัติคำขอที่ส่งมาหาแผนกตัวเองได้)
update profiles set role = 'dept_approver'
where employee_id = (select id from employees where employee_code = 'EMP-1001');

-- ตั้งเป็นแอดมิน (อนุมัติได้ทุกแผนก เห็นข้อมูลทั้งหมด)
update profiles set role = 'admin'
where employee_id = (select id from employees where employee_code = 'EMP-1002');
```

ทำซ้ำทีละคนตามรายชื่อหัวหน้าแผนกจริงขององค์กร

---

## ขั้นตอนที่ 5 — ทดสอบ

1. เปิด `login.html` → กรอกรหัสพนักงาน + วันเริ่มงาน (DDMMYYYY ปี พ.ศ.) ของคนที่ตั้งเป็น `staff`
2. ควรเข้า `index.html` ได้ เห็นชื่อ-แผนก-บทบาทที่แถบด้านซ้ายล่าง
3. ลองสร้างคำขอจากแผนกอื่นที่ไม่ใช่แผนกตัวเอง — **ต้องขึ้น error** (RLS/RPC บล็อกไว้)
4. ล็อกอินด้วยบัญชี `staff` ธรรมดา แล้วลองกดอนุมัติคำขอ — **ต้องขึ้น error** "ไม่มีสิทธิ์อนุมัติ"
5. ล็อกอินด้วยบัญชี `dept_approver`/`admin` แล้วลองอนุมัติคำขอที่ส่งมาหาแผนกตัวเอง — ต้องทำได้ปกติ
6. กด "ออกจากระบบ" ที่แถบด้านซ้ายล่าง — ต้องเด้งกลับหน้า login

---

## หมายเหตุด้านความปลอดภัย
- `service_role key` **ห้ามใส่ใน `assets/config.js` หรือ commit ขึ้น GitHub เด็ดขาด** ใช้แค่ตอนรันสคริปต์ในเครื่องตัวเองครั้งเดียว
- รหัสผ่านเริ่มต้น (วันเริ่มงาน) เดาได้ไม่ยากถ้ารู้วันเริ่มงานของคนอื่น — แนะนำให้พิจารณาเพิ่มฟีเจอร์บังคับเปลี่ยนรหัสผ่านครั้งแรกในอนาคต (ยังไม่ได้ทำในเวอร์ชันนี้)
- ทุกการเช็คสิทธิ์ที่สำคัญ (สร้าง/อนุมัติ/ปฏิเสธ/คืนตัว) ทำอยู่ใน RPC function ฝั่งฐานข้อมูล ต่อให้มีคนพยายามเรียก API ตรงๆ ข้ามหน้าเว็บ ก็ยังโดนเช็คสิทธิ์อยู่ดี
