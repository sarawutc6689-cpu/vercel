// ใส่ Project URL และ anon (public) key เท่านั้น — ห้ามใส่ service_role key
const SB = { url: 'https://ppzdyvomrfiitahxwrwz.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwemR5dm9tcmZpaXRhaHh3cnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjQ0MjIsImV4cCI6MjEwNDYwMDQyMn0.iArUz6swMfwhFT_1qEvCwK1B3aiCxdWt46_FBjT6_Y0' };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(fn, args, token) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: 'Bearer ' + (token || SB.key) },
    body: JSON.stringify(args || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || 'เกิดข้อผิดพลาด (' + r.status + ')');
  if (j.error) throw new Error(ERR[j.error] || j.error);
  return j;
}
async function mgrLogin(email, pw) {
  pw = pw.trim(); if (/^\d{2}\/\d{2}\/\d{4}$/.test(pw)) pw = pw.replace(/\//g, '');
  const r = await fetch(`${SB.url}/auth/v1/token?grant_type=password`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB.key },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw }) });
  if (!r.ok) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  return (await r.json()).access_token;
}
const ERR = {
  invalid_credentials: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง', too_many_attempts: 'ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่',
  invalid_input: 'กรอกข้อมูลไม่ครบ', invalid_time: 'วันที่ต้องไม่ผ่านมาแล้ว และเวลากลับต้องหลังเวลาออก',
  not_manager: 'บัญชีนี้ไม่ใช่ผู้จัดการ', forbidden: 'คำขอนี้ไม่อยู่ในแผนกที่คุณดูแล',
  self_approval: 'อนุมัติคำขอของตัวเองไม่ได้', note_required: 'ระบุเหตุผลที่ไม่อนุมัติ',
  not_pending: 'คำขอนี้ถูกดำเนินการไปแล้ว', not_found: 'ไม่พบคำขอ' };
const STATUS = { pending_manager: 'รอผู้จัดการ', pending_hr: 'รอฝ่ายบุคคล', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' };
const TYPE = { official: 'ไปราชการ/งานบริษัท', personal: 'ธุระส่วนตัว' };
const hm = t => String(t).slice(0, 5);

// ---- หน้าเจ้าหน้าที่ (ฝ่ายบุคคล / รปภ.) ล็อกอินด้วย Supabase Auth ----
Object.assign(ERR, { not_hr: 'บัญชีนี้ไม่ใช่ฝ่ายบุคคล', not_guard: 'บัญชีนี้ไม่มีสิทธิ์ดูรายงานนี้' });
let TOKEN = '';
function boot(onReady) {
  $('login').onsubmit = async e => {
    e.preventDefault(); $('loginMsg').textContent = '';
    try { TOKEN = await mgrLogin($('email').value, $('pass').value); await onReady();
          $('login').hidden = true; $('app').hidden = false; }
    catch (err) { $('loginMsg').textContent = err.message; }
  };
}
const run = async f => { $('msg').textContent = ''; try { await f(); } catch (e) { $('msg').textContent = e.message; } };
