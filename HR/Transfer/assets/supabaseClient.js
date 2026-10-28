/* ========================================================
   สร้าง Supabase client (ใช้ตัวแปร global ชื่อ sb ทั้งระบบ)
   ต้องโหลด CDN ของ @supabase/supabase-js ก่อนไฟล์นี้เสมอ
   ======================================================== */
if (typeof window.supabase === 'undefined') {
  console.error('ไม่พบไลบรารี supabase-js — ตรวจสอบว่าโหลด CDN script ก่อนไฟล์นี้');
}
if (SUPABASE_URL.includes('YOUR-PROJECT-REF') || SUPABASE_ANON_KEY.includes('YOUR-ANON')) {
  console.warn('[Supabase] ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_ANON_KEY ในไฟล์ assets/config.js');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
