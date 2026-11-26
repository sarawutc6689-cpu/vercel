// api/sync.js — เก็บ/ดึง links, schedules, tg ใน Supabase
// ENV ที่ต้องมี: SYNC_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

export async function redisGet() {
  const r = await fetch(`${SB_URL}/rest/v1/ithub_data?id=eq.main&select=data`, { headers: H });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].data : null;
}

export async function redisSet(obj) {
  const r = await fetch(`${SB_URL}/rest/v1/ithub_data?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "main", data: obj, updated_at: new Date().toISOString() }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "missing_db_env" });
  if (!process.env.SYNC_TOKEN || req.headers["x-sync-token"] !== process.env.SYNC_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "GET") {
    const data = await redisGet();
    return res.status(200).json(data || { empty: true });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!Array.isArray(b.links) || !Array.isArray(b.schedules)) {
      return res.status(400).json({ error: "bad_payload" });
    }
    const data = {
      links: b.links.slice(0, 300),
      schedules: b.schedules.slice(0, 300),
      tg: { chatId: String(b.tg?.chatId || ""), enabled: b.tg?.enabled !== false },
      updatedAt: Date.now(),
    };
    const ok = await redisSet(data);
    if (!ok) return res.status(500).json({ error: "db_write_failed" });
    return res.status(200).json({ ok: true, updatedAt: data.updatedAt });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
