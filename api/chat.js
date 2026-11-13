// Vercel Serverless Function: POST /api/chat (รองรับการสั่งเพิ่ม/ลบตารางงานผ่านแชตน้องมูลด์)

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "อนุญาตเฉพาะ POST เท่านั้น" });
    }

    const rawKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "";
    const key = String(rawKey).replace(/[^\x21-\x7E]/g, "").trim();

    if (!key) {
      return res.status(500).json({ error: "missing_api_key" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    const rawMsgs = Array.isArray(body.messages) ? body.messages : [];
    const msgs = rawMsgs
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 2000),
      }));

    if (msgs.length === 0) {
      return res.status(400).json({ error: "ไม่มีข้อความส่งมา" });
    }

    const rawLinks = Array.isArray(body.links) ? body.links : [];
    const linkList = rawLinks
      .slice(0, 30)
      .filter((l) => l && typeof l.name === "string" && typeof l.url === "string")
      .map((l) => `- ${l.name.slice(0, 60)}: ${l.url.slice(0, 300)}`)
      .join("\n");

    const rawScheds = Array.isArray(body.schedules) ? body.schedules : [];
    const schedList = rawScheds
      .slice(0, 30)
      .filter((s) => s && typeof s.title === "string" && typeof s.time === "string")
      .map((s) => `- เวลา ${s.time.slice(0, 10)} น. (${(s.repeat || "").slice(0, 30)}): ${s.title.slice(0, 80)}`)
      .join("\n");

    const clientNow = typeof body.clientNow === "string" ? body.clientNow.slice(0, 30) : "ไม่ระบุ";

    const sysPrompt =
      "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองที่ใจดีและเป็นกันเองประจำหน้ารวมลิงค์ของฝ่าย IT " +
      "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง เหมือนเพื่อนร่วมงานที่สนิท ใช้คำลงท้ายที่เป็นกลางทางเพศ เช่น นะ เลย จ้า " +
      "หลีกเลี่ยง ครับ/ค่ะ ไม่หยาบคาย ตอบกระชับตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย\n" +
      `วันและเวลาปัจจุบันของผู้ใช้คือ: ${clientNow}\n` +
      "\nรายการลิงค์ในหน้าเว็บ:\n" +
      (linkList || "- ยังไม่มีลิงค์") +
      "\nตารางงานและการแจ้งเตือนที่ตั้งไว้ปัจจุบัน:\n" +
      (schedList || "- ยังไม่มีตารางงานที่ตั้งเตือนไว้") +
      "\n\nคำสั่งพิเศษสำหรับการจัดการตารางงานผ่านแชต (สำคัญมาก):\n" +
      "1. หากผู้ใช้สั่งให้เพิ่มตารางงาน ตั้งเวลาเตือน หรือนัดหมาย (เช่น 'เตือนเช็ก Server ตอนบ่าย 3', 'ตั้งเตือนทุกวัน 08:30 เปิดระบบ', 'พรุ่งนี้ 10 โมงเตือนประชุม'):\n" +
      "   - ให้คุณตอบรับอย่างเป็นกันเอง และต้องแนบแท็กคำสั่งนี้ไว้ท้ายข้อความเสมอ:\n" +
      "     [[ADD_SCHED:ชื่องาน|HH:MM|ความถี่|YYYY-MM-DD]]\n" +
      "   - โดย HH:MM ต้องเป็นเวลาแบบ 24 ชั่วโมง (เช่น บ่ายโมง = 13:00, บ่ายสาม = 15:00, 9 โมงเช้า = 09:00)\n" +
      "   - ความถี่ เลือกได้ 3 ค่าเท่านั้น คือ: daily (ทุกวัน), weekdays (จันทร์-ศุกร์), หรือ once (ครั้งเดียว/วันนี้/พรุ่งนี้/ระบุวันที่)\n" +
      "   - YYYY-MM-DD คือวันที่ (ใส่เฉพาะกรณี once โดยอ้างอิงจากวันปัจจุบันของผู้ใช้ ถ้าเป็น daily หรือ weekdays ให้เว้นว่างไว้หลัง |)\n" +
      "   - ตัวอย่างแท็กที่ถูกต้อง: [[ADD_SCHED:เช็ก Server|15:00|once|2026-11-13]] หรือ [[ADD_SCHED:ตรวจกล้อง CCTV|09:00|daily|]]\n" +
      "2. หากผู้ใช้สั่งให้ลบหรือยกเลิกตารางงาน (เช่น 'ลบเตือนเช็ก Server ออกหน่อย'):\n" +
      "   - ให้ตอบรับและแนบแท็กคำสั่งนี้ไว้ท้ายข้อความ: [[DEL_SCHED:คำสำคัญของชื่องานหรือเวลา]]\n" +
      "   - ตัวอย่าง: [[DEL_SCHED:เช็ก Server]]\n" +
      "3. หากผู้ใช้แค่ถามเรื่องทั่วไปหรือถามว่าวันนี้มีงานอะไรบ้าง ให้สรุปตอบตามปกติโดยไม่ต้องใส่แท็ก [[ADD_SCHED:...]]";

    const fullMessages = [{ role: "system", content: sysPrompt }, ...msgs];

    const modelsToTry = [
      process.env.GROQ_MODEL,
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
    ].filter(Boolean);

    let lastStatus = 500;
    let lastErr = "";

    for (const model of modelsToTry) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key,
        },
        body: JSON.stringify({
          model: model,
          messages: fullMessages,
          max_tokens: 1024,
          temperature: 0.5,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        let text = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        return res.status(200).json({ text: text || "น้องมูลด์คิดคำตอบไม่ออก ลองถามใหม่อีกทีนะ" });
      }

      lastStatus = r.status;
      lastErr = await r.text();

      if (r.status === 401 || r.status === 429) {
        break;
      }
    }

    return res.status(502).json({
      error: `Groq ปฏิเสธคำขอ (${lastStatus}): ${lastErr.slice(0, 250)}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: `โค้ดฝั่งเซิร์ฟเวอร์ขัดข้อง: ${err && err.message ? err.message : String(err)}`,
    });
  }
};
