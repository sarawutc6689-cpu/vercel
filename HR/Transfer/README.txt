# ระบบโอนย้ายพนักงาน (Employee Transfer System)

ระบบเชื่อมต่อ Supabase จริงแล้ว ทั้ง 5 หน้าจอทำงานผ่านฐานข้อมูลจริง
ไม่มี build step — วางบน GitHub Pages ได้ทันที

## ไฟล์ในโปรเจกต์
- `index.html` — หน้าแรก (เช็คสถานะการเชื่อมต่อ Supabase)
- `request.html` — คำขอยืมพนักงาน
- `manage-requests.html` — การจัดการคำขอ (อนุมัติ/ปฏิเสธ)
- `return.html` — ขอคืนพนักงาน
- `status.html` — สถานะพนักงานที่กำลังโอนย้าย
- `history.html` — ประวัติการยืม
- `supabase/schema.sql` — **รันไฟล์นี้ใน Supabase ก่อน** (ตาราง, view, RPC function, ข้อมูลตัวอย่าง)
- `assets/config.js` — ใส่ URL และ anon key ของโปรเจกต์ตัวเอง
- `assets/supabaseClient.js` — สร้าง Supabase client (ตัวแปร global ชื่อ `sb`)
- `assets/db.js` — ฟังก์ชันเรียกข้อมูลทั้งหมด (data access layer)
- `assets/ui.js` — helper UI ที่ใช้ร่วมกันทุกหน้า (badge, chip, nav, toast)
- `assets/style.css` — ดีไซน์โทเค็นและสไตล์ทั้งหมด

## ขั้นตอนติดตั้ง (3 ขั้นตอน)

### 1. สร้างโปรเจกต์ Supabase
สมัคร/สร้างโปรเจกต์ใหม่ที่ https://supabase.com

### 2. รัน schema.sql
เปิด **SQL Editor** ในโปรเจกต์ → New query → คัดลอกเนื้อหาทั้งหมดจาก
`supabase/schema.sql` → วางแล้วกด Run

ไฟล์นี้จะสร้าง:
- ตาราง `departments`, `units`, `employees`, `transfer_requests`, `transfer_request_items`, `transfer_history`
- View สำหรับแต่ละหน้าจอ (`v_transfer_requests_list`, `v_employees_on_loan`, `v_transfer_history`)
- RPC function: `create_transfer_request`, `approve_transfer_item`, `reject_transfer_item`, `return_transfer_item`
- ข้อมูลตัวอย่าง (5 แผนก, 10 หน่วยงาน, 12 พนักงาน) ให้ทดสอบได้ทันที

### 3. ใส่ค่า config
เปิด `assets/config.js` แก้เป็นค่าจากโปรเจกต์ตัวเอง (Project Settings → API):

```js
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...'; // anon public key เท่านั้น ห้ามใช้ service_role
```

เปิด `index.html` — ถ้าเชื่อมต่อสำเร็จจะเห็นข้อความสีเขียวพร้อมจำนวนแผนก/พนักงาน

## เกี่ยวกับความปลอดภัย (สำคัญก่อนใช้งานจริง)
`schema.sql` **ปิด Row Level Security ไว้เป็นค่าเริ่มต้น** เพื่อให้ทดสอบด้วย anon key ได้ทันที
ซึ่งหมายความว่าใครก็ตามที่มี anon key (ที่ฝังอยู่ใน `config.js` บนหน้าเว็บ) จะอ่าน/เขียนข้อมูลได้ทั้งหมด

**ก่อนใช้งานจริงกับข้อมูลพนักงานจริง ต้อง:**
1. เปิดใช้งาน Supabase Auth (เช่น อีเมล/OTP หรือ SSO ขององค์กร)
2. สร้างตาราง `profiles` ผูก `auth.users` เข้ากับแผนกของผู้ใช้แต่ละคน
3. เปิด RLS และตั้ง policy ตามตัวอย่างที่คอมเมนต์ไว้ท้ายไฟล์ `supabase/schema.sql`
4. เพิ่มการเช็คสิทธิ์ในหน้า `manage-requests.html` ว่าเฉพาะหัวหน้าแผนกปลายทางเท่านั้นที่อนุมัติได้

## วิธีเปิดดูบนเครื่อง
```bash
python3 -m http.server 8000
```
แล้วเข้า `http://localhost:8000`

## วิธีวางบน GitHub Pages
1. push โฟลเดอร์นี้ขึ้น repository (ตรวจสอบว่า `assets/config.js` มีค่า Supabase จริงแล้ว)
2. Settings → Pages → เลือก branch และ root folder
3. รอสักครู่ จะได้ลิงก์ `https://<username>.github.io/<repo>/`

> ⚠️ เนื่องจากเป็น static site ค่า `SUPABASE_ANON_KEY` จะมองเห็นได้จาก client เสมอ (เป็นเรื่องปกติของ Supabase)
> ความปลอดภัยของข้อมูลต้องพึ่ง RLS policy ที่ตั้งไว้ในฐานข้อมูล ไม่ใช่การซ่อนคีย์
