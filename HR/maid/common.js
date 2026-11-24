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
    const id = $('#loginId').value.trim(), pw = $('#loginPw') ? $('#loginPw').value : id; // หน้าแม่บ้านไม่มีช่องรหัสผ่าน ใช้รหัส 6 หลักแทน
    const { error } = await sb.auth.signInWithPassword({ email: loginToEmail(id), password: pw });
    if (error) return toast('เข้าสู่ระบบไม่สำเร็จ: รหัสหรือรหัสผ่านไม่ถูกต้อง', true);
    refresh();
  });
  $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); refresh(); });
  refresh();
}


/* ===== Modal สวยงาม (แทน confirm/alert ของเบราว์เซอร์) ===== */
// modal({icon,title,text|html,okText,cancelText,danger,hideCancel}) -> Promise<boolean>
// html ต้อง escape ค่าที่มาจากผู้ใช้เองด้วย esc()
function modal({ icon = '❓', title = '', text = '', html = '', okText = 'ตกลง', cancelText = 'ยกเลิก', danger = false, hideCancel = false } = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal ${danger ? 'danger' : ''}" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <div class="m-ico" aria-hidden="true">${icon}</div>
      <h3 id="mTitle">${esc(title)}</h3>
      <div class="m-body">${html || esc(text).replace(/\n/g, '<br>')}</div>
      <div class="m-btns">${hideCancel ? '' : `<button type="button" class="ghost" data-r="0">${esc(cancelText)}</button>`}<button type="button" class="${danger ? 'bad' : ''}" data-r="1">${esc(okText)}</button></div>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const btns = [...ov.querySelectorAll('button')];
    btns[btns.length - 1].focus();
    let done = false;
    function close(r) {
      if (done) return; done = true;
      document.removeEventListener('keydown', key, true);
      ov.classList.remove('show');
      setTimeout(() => ov.remove(), 180);
      try { prev && prev.focus && prev.focus(); } catch (_) {}
      resolve(r);
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') {
        const i = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    }
    document.addEventListener('keydown', key, true);
    ov.addEventListener('click', e => {
      const b = e.target.closest('button[data-r]');
      if (b) close(b.dataset.r === '1');
      else if (e.target === ov && !hideCancel) close(false);
    });
  });
}
const confirmBox = o => modal(o);
const infoBox = o => modal({ icon: '✅', hideCancel: true, okText: 'ตกลง', ...o });

/* ===== ตัวช่วยข้อมูล ===== */
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// โหลดทุกแถว (Supabase จำกัด 1,000 แถวต่อคำขอ) make = () => query builder ใหม่
async function fetchAll(make, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await make().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

// ส่งออก CSV (มี BOM ให้ Excel อ่านภาษาไทยได้ และกันสูตรแฝงในเซลล์)
function downloadCSV(name, head, body) {
  const q = v => {
    v = v == null ? '' : v;
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
    v = String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const txt = '﻿' + [head, ...body].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const isHR = u => (u.email || '').toLowerCase() === HR_EMAIL;
