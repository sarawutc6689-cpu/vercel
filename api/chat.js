// Vercel Serverless Function: POST /api/chat (รุ่นคลีน เร็วพิเศษ ป้องกัน Timeout 500)

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "อนุญาตเฉพาะ POST เท่านั้น" });
    }

    // 1. ดึง API Key และตัดอักขระแปลกปลอมออกทั้งหมด
    const rawKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "";
    const key = String(rawKey).replace(/[^\x21-\x7E]/g, "").trim();

    if (!key) {
      return res.status(500).json({ error: "missing_api_key" });
    }

    // 2. อ่านข้อมูลจากหน้าเว็บอย่างปลอดภัย
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

    const sysPrompt =
      "คุณคือ “น้องมูลด์” เลขาส่วนตัวที่ใจดีและเป็นกันเองประจำหน้ารวมลิงค์ของฝ่าย IT " +
      "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง เหมือนเพื่อนร่วมงานที่สนิท ใช้คำลงท้ายที่เป็นกลางทางเพศ เช่น นะ เลย จ้า " +
      "หลีกเลี่ยง ครับ/ค่ะ ไม่หยาบคาย ตอบกระชับตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย " +
      "ตอบได้ทุกเรื่อง เช่น ความรู้ทั่วไป ไอทีเบื้องต้น ร่างอีเมลหรือประกาศ สรุปประเด็น แปลภาษา วางแผนงาน ช่วยคิดไอเดีย " +
      "และชี้ลิงค์ที่เกี่ยวข้องจากรายการนี้เมื่อผู้ใช้ถามหา:\n" +
      linkList +
      "\nคุณเข้าอินเทอร์เน็ตหรือดูข้อมูลสดไม่ได้ และไม่เห็นข้อมูลจริงในระบบเหล่านี้ ถ้าถูกถามให้บอกตรง ๆ ว่าทำไม่ได้และแนะนำให้เปิดลิงค์ที่เกี่ยวข้อง";

    const fullMessages = [{ role: "system", content: sysPrompt }, ...msgs];

    // 3. ลองเรียกเฉพาะ 3 โมเดลหลักที่เสถียรที่สุด (ไม่เกิน 3 ครั้ง ป้องกัน Timeout 100%)
    const modelsToTry = [
      process.env.GROQ_MODEL,
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "gemma2-9b-it",
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
          max_tokens: 800,
          temperature: 0.6,
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

      // ถ้าคีย์ผิด (401) หรือถามรัวเกิน (429) ให้หยุดทันทีไม่ต้องลองโมเดลอื่น
      if (r.status === 401 || r.status === 429) {
        break;
      }
    }

    return res.status(502).json({
      error: `Groq ปฏิเสธคำขอ (${lastStatus}): ${lastErr.slice(0, 200)}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: `โค้ดฝั่งเซิร์ฟเวอร์ขัดข้อง: ${err && err.message ? err.message : String(err)}`,
    });
  }
};
