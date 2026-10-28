/**
 * bulk_create_users.js
 * สร้างบัญชีล็อกอิน Supabase Auth ให้พนักงานทุกคนที่มี hire_date ในฐานข้อมูล
 *
 * รันจากเครื่องตัวเองเท่านั้น (ไม่ใช่บนเว็บ) เพราะต้องใช้ service_role key
 * ซึ่งมีสิทธิ์เต็ม ห้ามฝังในเว็บหรือ commit ขึ้น GitHub เด็ดขาด
 *
 * วิธีใช้:
 *   1. npm install @supabase/supabase-js
 *   2. ตั้งค่า environment variables (ดูด้านล่าง) แล้วรัน:
 *        node bulk_create_users.js
 *
 * รันซ้ำได้อย่างปลอดภัย — ข้ามคนที่มีบัญชีอยู่แล้วอัตโนมัติ
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_DOMAIN = 'transfer.local'; // โดเมนปลอมใช้ภายในระบบเท่านั้น ไม่ต้องมีอยู่จริง

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อนรัน');
  console.error('ตัวอย่าง (Linux/Mac):');
  console.error('  export SUPABASE_URL=https://fpsdntchtoxtcpfwkkom.supabase.co');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwc2RudGNodG94dGNwZndra29tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MzU5NiwiZXhwIjoyMTAyNjE5NTk2fQ.clLrlAhsroMmbSA6XyWqvXJz1fV8F7zoGd5-Woa2WK8');
  console.error('  node bulk_create_users.js');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function toPassword(hireDate) {
  // hire_date จาก Supabase มาในรูปแบบ 'YYYY-MM-DD' (ปี ค.ศ.)
  // -> แปลงเป็นรหัสผ่าน 'DDMMYYYY' โดยใช้ปี พ.ศ. (บวก 543)
  const [y, m, d] = hireDate.split('-');
  const buddhistYear = parseInt(y, 10) + 543;
  return `${d}${m}${buddhistYear}`;
}

function toEmail(employeeCode) {
  return `${employeeCode.toLowerCase()}@${EMAIL_DOMAIN}`;
}

async function main() {
  console.log('กำลังดึงรายชื่อพนักงานที่มีวันที่เริ่มงาน...');
  const { data: employees, error } = await admin
    .from('employees')
    .select('id, employee_code, full_name, hire_date')
    .not('hire_date', 'is', null);

  if (error) throw error;
  console.log(`พบพนักงาน ${employees.length} คนที่มีวันที่เริ่มงาน (พร้อมสร้างบัญชี)`);

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const emp of employees) {
    const email = toEmail(emp.employee_code);
    const password = toPassword(emp.hire_date);

    // เช็คว่ามีบัญชีนี้อยู่แล้วหรือยัง (ผ่าน profiles ที่ผูกกับ employee_id)
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('employee_id', emp.id)
      .maybeSingle();

    if (existingProfile) {
      // มีบัญชีอยู่แล้ว -> รีเซ็ตรหัสผ่านให้เป็นรูปแบบล่าสุด (เผื่อเคยรันด้วยรูปแบบเก่า)
      const { error: updateErr } = await admin.auth.admin.updateUserById(existingProfile.id, { password });
      if (updateErr) {
        console.error(`✕ อัปเดตรหัสผ่านล้มเหลว: ${emp.employee_code} — ${updateErr.message}`);
        failed++;
      } else {
        updated++;
      }
      continue;
    }

    const { data: created_user, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ข้ามการยืนยันอีเมล เพราะเป็นอีเมลปลอมภายใน
      user_metadata: { employee_code: emp.employee_code, full_name: emp.full_name },
    });

    if (createErr) {
      console.error(`✕ สร้างบัญชีล้มเหลว: ${emp.employee_code} — ${createErr.message}`);
      failed++;
      continue;
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      id: created_user.user.id,
      employee_id: emp.id,
      role: 'staff', // ตั้งเป็น staff ทุกคนก่อน ค่อยไปปรับเป็น dept_approver/admin ทีหลังด้วย SQL
    });

    if (profileErr) {
      console.error(`✕ สร้าง profile ล้มเหลว: ${emp.employee_code} — ${profileErr.message}`);
      failed++;
      continue;
    }

    created++;
    if ((created + updated) % 25 === 0) console.log(`  ดำเนินการไปแล้ว ${created + updated} คน...`);
  }

  console.log('\n=== สรุปผล ===');
  console.log(`สร้างบัญชีใหม่: ${created} คน`);
  console.log(`อัปเดตรหัสผ่าน (มีบัญชีอยู่แล้ว): ${updated} คน`);
  console.log(`ล้มเหลว: ${failed} คน`);
  console.log('\nรหัสผ่านเริ่มต้นของทุกคน = วันที่เริ่มงาน รูปแบบ DDMMYYYY (ปี พ.ศ.)');
  console.log('ตัวอย่าง: รหัสพนักงาน 103010, เริ่มงาน 2015-03-26 (26/03/2558) -> รหัสผ่าน 26032558');
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาด:', err);
  process.exit(1);
});
