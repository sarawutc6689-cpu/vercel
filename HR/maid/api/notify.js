// Vercel Serverless Function: ส่งแจ้งเตือนเข้า Telegram
// ตัวแปรที่ต้องตั้งใน Vercel (Settings -> Environment Variables):
//   TELEGRAM_MAID_BOT_TOKEN, TELEGRAM_MAID_CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY
//   (ไม่บังคับ) HR_EMAIL (ค่าเริ่มต้น hr@local.com), LOW_STOCK_THRESHOLD (ค่าเริ่มต้น 5), SITE_URL
//
// ความปลอดภัย: ไม่เชื่อข้อความจากเบราว์เซอร์ ฟังก์ชันอ่านรายละเอียดคำขอจาก Supabase ด้วย JWT ของผู้เรียก
// (RLS จึงบังคับว่าแม่บ้านเห็นได้เฉพาะคำขอของตัวเอง) และส่งได้เฉพาะคำขอที่เพิ่งสร้าง/เพิ่งตัดสินใจ

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_LINES = 30;

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = d => new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
const fresh = d => d && Date.now() - new Date(d).getTime() <= MAX_AGE_MS;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (code, error, extra = {}) => res.status(code).json({ ok: false, error, ...extra });

  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const { TELEGRAM_MAID_BOT_TOKEN: BOT, TELEGRAM_MAID_CHAT_ID: CHAT, SUPABASE_ANON_KEY: KEY } = process.env;
  const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!BOT || !CHAT || !SB || !KEY) return fail(500, 'not_configured');

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'unauthorized');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const type = body && body.type, rid = body && body.request_id;
  if (!['new_request', 'decision', 'test'].includes(type)) return fail(400, 'bad_type');
  if (type !== 'test' && !UUID.test(String(rid || ''))) return fail(400, 'bad_request_id');

  const hrEmail = (process.env.HR_EMAIL || 'hr@local.com').toLowerCase();
  const headers = { apikey: KEY, Authorization: `Bearer ${token}` };

  try {
    // ---- ตรวจผู้เรียก (ต้องเป็น HR สำหรับ decision / test)
    if (type !== 'new_request') {
      const u = await fetch(`${SB}/auth/v1/user`, { headers });
      if (!u.ok) return fail(401, 'unauthorized');
      const email = String((await u.json()).email || '').toLowerCase();
      if (email !== hrEmail) return fail(403, 'forbidden');
    }

    let text;
    const site = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/+$/, '') : `https://${req.headers.host}`;

    if (type === 'test') {
      text = `✅ <b>ทดสอบการแจ้งเตือนสำเร็จ</b>\nระบบเบิกของใช้แม่บ้านเชื่อมต่อ Telegram เรียบร้อย\n🕒 ${esc(fmt(Date.now()))}`;
    } else {
      const sel = 'id,status,note,created_at,decided_at,housekeepers(name,emp_code,area),request_items(qty,items(name,unit,stock))';
      const r = await fetch(`${SB}/rest/v1/requests?id=eq.${rid}&select=${sel}`, { headers });
      if (r.status === 401 || r.status === 403) return fail(401, 'unauthorized');
      if (!r.ok) return fail(502, 'db_error');
      const row = (await r.json())[0];
      if (!row) return fail(404, 'not_found');   // ไม่มีจริง หรือ RLS ไม่ให้เห็น

      const hk = row.housekeepers || {};
      const lines = row.request_items || [];
      const who = `👤 ${esc(hk.name || '-')}${hk.emp_code ? ` (${esc(hk.emp_code)})` : ''}${hk.area ? ` · ${esc(hk.area)}` : ''}`;
      const list = lines.slice(0, MAX_LINES).map(l => `• ${esc(l.items && l.items.name)} × ${Number(l.qty)} ${esc(l.items && l.items.unit)}`).join('\n') +
        (lines.length > MAX_LINES ? `\n…และอีก ${lines.length - MAX_LINES} รายการ` : '');
      const note = row.note ? `\n📝 ${esc(row.note)}` : '';

      if (type === 'new_request') {
        if (row.status !== 'pending' || !fresh(row.created_at)) return fail(409, 'not_notifiable');
        text = `🧹 <b>คำขอเบิกของใช้ใหม่</b>\n${who}\n🕒 ${esc(fmt(row.created_at))}\n\n📦 รายการ\n${list}${note}\n\n🔗 ${esc(site)}/admin.html`;
      } else {
        if (!['approved', 'rejected'].includes(row.status) || !fresh(row.decided_at)) return fail(409, 'not_notifiable');
        const ok = row.status === 'approved';
        text = `${ok ? '✅ <b>อนุมัติคำขอเบิกแล้ว</b>' : '❌ <b>ไม่อนุมัติคำขอเบิก</b>'}\n${who}\n\n📦 รายการ\n${list}${note}`;
        if (ok) {
          const raw = process.env.LOW_STOCK_THRESHOLD;
          const thr = raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : 5;
          const low = lines.filter(l => l.items && l.items.stock <= thr);
          if (low.length) {
            text += `\n\n⚠️ <b>พัสดุใกล้หมด</b>\n` + low.map(l => `• ${esc(l.items.name)} เหลือ ${Number(l.items.stock)} ${esc(l.items.unit)}`).join('\n');
          }
        }
      }
    }

    const tg = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    if (!tg.ok) {
      let desc = ''; try { desc = (await tg.json()).description || ''; } catch (_) {}
      console.error('telegram_failed', tg.status, desc);          // ไม่ log token
      return fail(502, 'telegram_failed', type === 'test' ? { detail: desc } : {});
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('notify_error', e && e.message);
    return fail(500, 'server_error');
  }
};
