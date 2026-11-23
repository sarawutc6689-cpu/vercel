const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const HR_EMAIL = 'hr@local.com';
const EMAIL_DOMAIN = '@local.com';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' };

function toast(msg, isErr) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.className = '', 3000);
}

async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

// ตั้งค่าหน้า: ถ้า allow(user) เป็นจริง แสดงแอป ไม่งั้นแสดงฟอร์ม login
// loginToEmail แปลงค่าที่กรอกเป็นอีเมล
async function setupAuth({ allow, loginToEmail, onReady }) {
  const loginBox = $('#login'), app = $('#app');
  async function refresh() {
    const user = await currentUser();
    if (user && await allow(user)) {
      loginBox.hidden = true; app.hidden = false;
      onReady(user);
    } else {
      if (user) { await sb.auth.signOut(); toast('บัญชีนี้ไม่มีสิทธิ์ใช้หน้านี้', true); }
      loginBox.hidden = false; app.hidden = true;
    }
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#loginId').value.trim(), pw = $('#loginPw').value;
    const { error } = await sb.auth.signInWithPassword({ email: loginToEmail(id), password: pw });
    if (error) return toast('เข้าสู่ระบบไม่สำเร็จ: รหัสหรือรหัสผ่านไม่ถูกต้อง', true);
    refresh();
  });
  $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); refresh(); });
  refresh();
}

const isHR = u => (u.email || '').toLowerCase() === HR_EMAIL;
