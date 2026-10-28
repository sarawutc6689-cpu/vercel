/* ========================================================
   Auth Guard — เช็คว่าล็อกอินอยู่หรือไม่ ถ้าไม่ ให้เด้งไปหน้า login
   ใส่ไว้เป็นสคริปต์แรกสุด (หลัง supabaseClient.js) ในทุกหน้าที่ต้อง login
   หมายเหตุ: นี่คือความสะดวกฝั่ง UI เท่านั้น ความปลอดภัยจริงมาจาก RLS ในฐานข้อมูล
   ======================================================== */
let CURRENT_PROFILE = null;

async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    throw new Error('redirecting-to-login');
  }
  const { data: profile, error } = await sb.from('v_my_profile').select('*').maybeSingle();
  if (error || !profile) {
    console.error('โหลดโปรไฟล์ไม่สำเร็จ', error);
    await sb.auth.signOut();
    window.location.href = 'login.html';
    throw new Error('no-profile');
  }
  CURRENT_PROFILE = profile;
  return profile;
}

function attachLogout() {
  const el = document.getElementById('sidebar-user');
  if (!el || !CURRENT_PROFILE) return;
  el.innerHTML = `
    ${CURRENT_PROFILE.full_name} <span style="color:#8891B8;">(${CURRENT_PROFILE.employee_code})</span><br>
    <strong style="color:#DCE1F5">${CURRENT_PROFILE.department_name}</strong><br>
    <a href="#" id="btn-logout" style="color:#8891B8; text-decoration:underline; font-size:11px;">ออกจากระบบ</a>
  `;
  document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}
