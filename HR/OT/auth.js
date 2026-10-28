/* ============================================================
   auth.js — ระบบตรวจสอบสิทธิ์ธุรการแผนก (ใช้ร่วมกันทุกหน้า)
   ต้องแปะ <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ไว้ "ก่อน" ไฟล์นี้เสมอ แล้วค่อยตามด้วยสคริปต์หลักของแต่ละหน้า
   ============================================================ */
(function () {
  "use strict";

  const SUPABASE_URL = 'https://gjmgzjsbgqaaxlpbyykt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbWd6anNiZ3FhYXhscGJ5eWt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjQyMjUsImV4cCI6MjEwMTYwMDIyNX0.wacphD2FPgaaETYc0N-Ze4q9gPr2BaO0MKNo9RBnlm0';
  const LOGIN_URL = 'manager-login.html';

  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function clearSession() {
    localStorage.removeItem('mgrToken');
    localStorage.removeItem('mgrDept');
    localStorage.removeItem('mgrName');
    localStorage.removeItem('mgrExpire');
  }

  function goToLogin() {
    clearSession();
    window.location.href = LOGIN_URL;
  }

  /* เรียกตอนโหลดหน้าทุกหน้า (index.html, report.html, dashboard.html)
     คืนค่า { token, department, name } ถ้าผ่าน หรือ null (แล้วจะเด้งไปหน้า login ให้อัตโนมัติ) */
  async function requireLogin() {
    const token = localStorage.getItem('mgrToken');
    const expire = Number(localStorage.getItem('mgrExpire') || 0);

    if (!token || !expire || Date.now() > expire) {
      goToLogin();
      return null;
    }

    try {
      const { data, error } = await authClient.rpc('verify_manager_session', { p_code: token });
      if (error || !data || !data.valid) {
        goToLogin();
        return null;
      }
      if (data.department) localStorage.setItem('mgrDept', data.department);
      if (data.name) localStorage.setItem('mgrName', data.name);
      return {
        token: token,
        department: data.department || localStorage.getItem('mgrDept') || '',
        name: data.name || localStorage.getItem('mgrName') || token
      };
    } catch (e) {
      goToLogin();
      return null;
    }
  }

  async function logout() {
    const token = localStorage.getItem('mgrToken');
    try {
      if (token) await authClient.rpc('manager_logout', { p_code: token });
    } catch (e) {
      /* เคลียร์ session ฝั่งเครื่องต่อได้แม้ request จะพลาด */
    }
    goToLogin();
  }

  window.OTAuth = { requireLogin: requireLogin, logout: logout };
})();
