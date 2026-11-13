// Vercel Serverless Function: POST /api/chat
// รองรับ: 1) แชตกับน้องมูลด์ (Groq) 2) สั่งเพิ่ม/ลบตารางงาน 3) ส่งแจ้งเตือนเข้า Telegram

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "อนุญาตเฉพาะ POST เท่านั้น" });
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

    const tgToken = String(process.env.TELEGRAM_BOT_TOKEN || "").replace(/[^\x21-\x7E]/g, "").trim();
    const defaultChatId = String(process.env.TELEGRAM_CHAT_ID || "").replace(/[^\x21-\x7E]/g, "").trim();

    // ---- โหมดที่ 1: ดึง Chat ID ล่าสุดจาก Telegram Bot อัตโนมัติ ----
    if (body.action === "telegram_get_chat") {
      if (!tgToken) {
        return res.status(400).json({
          error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel Environment Variables",
        });
      }
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/getUpdates?limit=10`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return res.status(502).json({
          error: `Telegram ตอบกลับว่า: ${data.description || r.status}`,
        });
      }
      const updates = Array.isArray(data.result) ? data.result : [];
      for (let i = updates.length - 1; i >= 0; i--) {
        const u = updates[i];
        const chat = (u.message && u.message.chat) || (u.my_chat_member && u.my_chat_member.chat) || (u.channel_post && u.channel_post.chat);
        if (chat && chat.id) {
          return res.status(200).json({
            chatId: String(chat.id),
            title: chat.title || chat.first_name || chat.username || "แชตส่วนตัว",
          });
        }
      }
      return res.status(404).json({
        error: "ไม่พบข้อความล่าสุด กรุณาเปิดแอป Telegram แล้วพิมพ์ทักแชตบอทของคุณ 1 ครั้งก่อนกดปุ่มนี้นะครับ",
      });
    }

    // ---- โหมดที่ 2: ส่งข้อความแจ้งเตือนเข้า Telegram ----
    if (body.action === "telegram_send") {
      if (!tgToken) {
        return res.status(400).json({
          error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel",
        });
      }
      const targetChatId = String(body.chatId || defaultChatId || "").trim();
      if (!targetChatId) {
        return res.status(400).json({
          error: "ยังไม่ได้ระบุ Chat ID (กดปุ่ม '🗓️ ตารางงาน' > '🔍 ดึง Chat ID' ก่อนนะครับ)",
        });
      }
      const text = String(body.text || "").trim().slice(0, 3500);
      if (!text) {
        return res.status(400).json({ error: "ไม่มีข้อความที่จะส่ง" });
      }

      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: text,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return res.status(502).json({
          error: data.description || `Telegram Error (${r.status})`,
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- โหมดที่ 3: คุยแชตกับน้องมูลด์ (Groq AI) ----
    const rawKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "";
    const key = String(rawKey).replace(/[^\x21-\x7E]/g, "").trim();

    if (!key) {
      return res.status(500).json({ error: "missing_api_key" });
    }

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
      "\n\nคำสั่งพิเศษสำหรับน้องมูลด์ (แนบแท็กไว้ท้ายคำตอบเมื่อผู้ใช้สั่งการ):\n" +
      "1. เมื่อผู้ใช้สั่งให้เพิ่มตารางงาน/ตั้งเวลาเตือน: ให้แนบแท็ก [[ADD_SCHED:ชื่องาน|HH:MM|ความถี่|YYYY-MM-DD]] ไว้ท้ายคำตอบ (โดย HH:MM เป็นเวลา 24 ชม., ความถี่เลือกได้คือ daily, weekdays, หรือ once, และ YYYY-MM-DD ใส่เฉพาะกรณี once)\n" +
      "2. เมื่อผู้ใช้สั่งให้ลบตารางงาน: ให้แนบแท็ก [[DEL_SCHED:คำสำคัญของชื่องาน]] ไว้ท้ายคำตอบ\n" +
      "3. เมื่อผู้ใช้สั่งให้ส่งข้อความ ส่งลิงค์ หรือส่งสรุปตารางงานเข้า Telegram ทันที: ให้ตอบรับและแนบแท็ก [[SEND_TG:ข้อความที่ต้องการส่งเข้า Telegram]] ไว้ท้ายคำตอบ";

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
