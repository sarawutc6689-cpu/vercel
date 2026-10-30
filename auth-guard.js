/* auth-guard.js — วางไว้ที่ราก mouldmate.vercel.app (ข้าง ๆ home.html)
   ต้องโหลดหลัง supabase-js และหลังบรรทัดที่ใส่คลาส auth-pending ให้ <html> */
(async function(){
  "use strict";

  // ⚠ ตรวจ URL นี้ให้ตรงกับหน้าล็อกอินจริง
  var LOGIN_URL = "https://sarawutc6689-cpu.github.io/Mouldmate-Login/";
  var SUPABASE_URL = "https://dhgjbpvbbixipxksqqzu.supabase.co";
  var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoZ2picHZiYml4aXB4a3NxcXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTIxMjgsImV4cCI6MjEwMTU2ODEyOH0.kZBAN01vbe8kENacfofZewHvxQBCCd2OaTFKbcFYlpM";
  var KEY = 'mm_user';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function deny(){
    try { localStorage.removeItem(KEY); } catch(_){}
    location.replace(LOGIN_URL);
  }

  var token = null;
  try { token = (JSON.parse(localStorage.getItem(KEY) || 'null') || {}).token; } catch(_){}

  // รองรับ token ที่ส่งมากับ URL (#t=...)
  var m = location.hash.match(/[#&]t=([^&]+)/);
  if (m){
    token = decodeURIComponent(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!token) return deny();

  try {
    var res = await sb.rpc('get_session_user', { p_token: token });
    if (res.error || !res.data) return deny();

    var user = Object.assign({}, res.data, { token: token });
    localStorage.setItem(KEY, JSON.stringify(user));
    window.mmUser = user;
    document.documentElement.classList.remove('auth-pending');
  } catch(_){
    deny();
  }
})();

// ออกจากระบบ: เรียก mmLogout() จากปุ่มใดก็ได้
window.mmLogout = function(){
  try { localStorage.removeItem('mm_user'); } catch(_){}
  location.replace("https://sarawutc6689-cpu.github.io/Mouldmate-Login/");
};
