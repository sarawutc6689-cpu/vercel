// Vercel Serverless Function: POST /api/chat (สำหรับ Groq API - ฟรีและเร็วมาก)
// ตั้งค่า Environment Variable ชื่อ GROQ_API_KEY ใน Vercel (หรือใส่ใน GEMINI_API_KEY เดิมก็ได้)
// เปลี่ยนรุ่นโมเดลได้ที่ GROQ_MODEL (ค่าเริ่มต้น llama-3.3-70b-versatile)

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_MESSAGES = 10;
const MAX_CHARS = 2000;
const MAX_LINKS = 30;

// จำกัดจำนวนครั้งต่อ IP แบบง่าย ๆ
const hits = new Map();
const WINDOW_MS = 60 * 1000;
const LIMIT = 15;

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > LIMIT;
}

function systemPrompt(links) {
  const list = links.map((l) => `- ${l.name}: ${l.url}`).join("\n");
  return (
    "คุณคือ “น้องมูลด์” เลขาส่วนตัวที่ใจดีและเป็นกันเองประจำหน้ารวมลิงค์ของฝ่าย IT " +
    "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง เหมือนเพื่อนร่วมงานที่สนิท ใช้คำลงท้ายที่เป็นกลางทางเพศ เช่น นะ เลย จ้า " +
    "หลีกเลี่ยง ครับ/ค่ะ ไม่หยาบคาย ตอบกระชับตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย " +
    "ตอบได้ทุกเรื่อง เช่น ความรู้ทั่วไป ไอทีเบื้องต้น ร่างอีเมลหรือประกาศ สรุปประเด็น แปลภาษา วางแผนงาน ช่วยคิดไอเดีย " +
    "และชี้ลิงค์ที่เกี่ยวข้องจากรายการนี้เมื่อผู้ใช้ถามหา:\n" +
    list +
    "\nคุณเข้าอินเทอร์เน็ตหรือดูข้อมูลสดไม่ได้ (เช่น ข่าว ราคา อากาศวันนี้) และไม่เห็นข้อมูลจริงในระบบเหล่านี้ " +
    "(เช่น จำนวนงานแจ้งซ่อม ทะเบียนทรัพย์สิน) ถ้าถูกถามให้บอกตรง ๆ ว่าทำไม่ได้ ห้ามเดาข้อมูล " +
    "และแนะนำให้เปิดลิงค์ที่เกี่ยวข้อง ถ้าไม่แน่ใจให้บอกว่าไม่แน่ใจ " +
    "ห้ามขอรหัสผ่านจริงของผู้ใช้ และถ้าผู้ใช้พิมพ์ข้อมูลลับหรือรหัสผ่านมา ให้เตือนว่าไม่ควรส่งข้อมูลแบบนี้"
  );
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // รองรับทั้งชื่อ GROQ_API_KEY และ GEMINI_API_KEY (เผื่อไม่อยากสร้างตัวแปรใหม่ในหน้าเว็บ)
  const key = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "missing_api_key" });

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "rate_limited" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  // เตรียมประวัติข้อความสนทนาตามรูปแบบ OpenAI / Groq
  let msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS),
    }));

  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    return res.status(400).json({ error: "bad_request" });
  }

  const links = (Array.isArray(body.links) ? body.links : [])
    .slice(0, MAX_LINKS)
    .filter((l) => l && typeof l.name === "string" && typeof l.url === "string")
    .map((l) => ({ name: l.name.slice(0, 60), url: l.url.slice(0, 300) }));

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(links) },
          ...msgs,
        ],
        max_tokens: 1024,
        temperature: 0.6,
      }),
    });

    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    if (!r.ok) {
      console.error("Groq error", r.status, await r.text());
      return res.status(502).json({ error: "upstream_error" });
    }

    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();

    if (!text) return res.status(502).json({ error: "empty_response" });
    return res.status(200).json({ text });
  } catch (e) {
    console.error("chat function error", e);
    return res.status(500).json({ error: "server_error" });
  }
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return {};
  }
}
