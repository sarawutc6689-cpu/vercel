// Vercel serverless function — ตั้ง Environment Variables ใน Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role แบบ JWT), EMAIL_DOMAIN (ไม่ใส่ = local.com)
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DOMAIN = process.env.EMAIL_DOMAIN || "local.com";
const SUFFIX = process.env.CODE_SUFFIX || "-mm"; // ต้องตรงกับ config.js
const ADMIN = "hr@local.com";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function userIdOf(code) {
  const r = await fetch(`${URL_}/rest/v1/housekeepers?code=eq.${encodeURIComponent(code)}&select=user_id`, { headers: H });
  const rows = await r.json();
  return rows[0] && rows[0].user_id;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!URL_ || !KEY) return res.status(500).json({ error: "ยังไม่ได้ตั้งค่า Environment Variables บน Vercel" });
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const me = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } }).then(r => r.json());
    if (me.email !== ADMIN) return res.status(403).json({ error: "ไม่มีสิทธิ์" });

    const { action, code, name, active } = req.body || {};
    const password = (code || "") + SUFFIX;
    if (!/^[A-Za-z0-9]{1,20}$/.test(code || "")) return res.status(400).json({ error: "รหัสพนักงานใช้ได้เฉพาะตัวอักษร/ตัวเลข ไม่เกิน 20 ตัว" });

    if (action === "create") {
      if (!(name || "").trim()) return res.status(400).json({ error: "กรอกชื่อแม่บ้าน" });
      const u = await fetch(`${URL_}/auth/v1/admin/users`, {
        method: "POST", headers: H,
        body: JSON.stringify({ email: `${code}@${DOMAIN}`, password, email_confirm: true })
      }).then(r => r.json());
      if (!u.id) return res.status(400).json({ error: u.msg || u.message || "สร้างบัญชีไม่สำเร็จ (อาจมีรหัสนี้อยู่แล้ว)" });
      const ins = await fetch(`${URL_}/rest/v1/housekeepers`, {
        method: "POST", headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify({ code, name: name.trim(), user_id: u.id })
      });
      if (!ins.ok) {
        await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
        return res.status(400).json({ error: "บันทึกข้อมูลไม่สำเร็จ (รหัสพนักงานอาจซ้ำ)" });
      }
      return res.json({ ok: true });
    }

    const uid = await userIdOf(code);
    if (!uid) return res.status(404).json({ error: "ไม่พบแม่บ้านรหัสนี้" });

    if (action === "reset") {
      const r = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: H, body: JSON.stringify({ password }) });
      return r.ok ? res.json({ ok: true }) : res.status(400).json({ error: "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
    }
    if (action === "toggle") {
      const r = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, {
        method: "PUT", headers: H, body: JSON.stringify({ ban_duration: active ? "none" : "876000h" })
      });
      if (!r.ok) return res.status(400).json({ error: "เปลี่ยนสถานะไม่สำเร็จ" });
      await fetch(`${URL_}/rest/v1/housekeepers?code=eq.${encodeURIComponent(code)}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ active: !!active })
      });
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: "action ไม่ถูกต้อง" });
  } catch (e) {
    return res.status(500).json({ error: "เกิดข้อผิดพลาดบนเซิร์ฟเวอร์" });
  }
};
