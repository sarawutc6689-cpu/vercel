// Vercel Serverless Function: POST /api/chat
// รองรับ: 1) แชตหน้าเว็บ 2) ส่งแจ้งเตือน Telegram 3) ตอบโต้ในกลุ่ม Telegram อัตโนมัติ (Webhook)

const DEFAULT_LINKS = [
  { name: "IT Link Hub (หน้าหลัก)", url: "https://mouldmate.vercel.app/" },
  { name: "Helpdesk Dashboard", url: "https://mouldmate.vercel.app/IT/Helpdesk/dashboard.html" },
  { name: "Checklist CCTV", url: "https://mouldmate.vercel.app/IT/CCTV/ChecklistCCTV.html" },
  { name: "Asset Register", url: "https://mouldmate.vercel.app/IT/Asset/asset-register.html" },
];

async function askGroqAI(key, messages) {
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
        messages: messages,
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });

    if (r.ok) {
      const data = await r.json();
      let text = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      return { ok: true, text: text || "น้องมูลด์คิดคำตอบไม่ออก ลองถามใหม่อีกทีนะ" };
    }

    lastStatus = r.status;
    lastErr = await r.text();
    if (r.status === 401 || r.status === 429) break;
  }

  return { ok: false, status: lastStatus, error: lastErr };
}

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
    const rawKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "";
    const groqKey = String(rawKey).replace(/[^\x21-\x7E]/g, "").trim();

    // =========================================================================
    // โหมดที่ 0: รับข้อความจากกลุ่ม/แชต Telegram อัตโนมัติ (Telegram Webhook)
    // =========================================================================
    if (body.update_id && (body.message || body.edited_message)) {
      const msg = body.message || body.edited_message;
      const chat = msg.chat || {};
      const chatId = chat.id;
      const text = String(msg.text || "").trim();

      if (!chatId || !text || (msg.from && msg.from.is_bot)) {
        return res.status(200).json({ ok: true });
      }

      const isGroup = chat.type === "group" || chat.type === "supergroup";
      const isReplyToBot = Boolean(msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot);
      const isMentioned =
        text.includes("มูลด์") ||
        text.toLowerCase().includes("mould") ||
        text.startsWith("/") ||
        text.includes("@");

      // ถ้าอยู่ในกลุ่ม แต่ไม่ได้เรียกชื่อ "น้องมูลด์" และไม่ได้ Reply บอท ให้ข้ามไปไม่รบกวนกลุ่ม
      if (isGroup && !isReplyToBot && !isMentioned) {
        return res.status(200).json({ ok: true });
      }

      // ถ้าพิมพ์ /id หรือ /chatid ให้บอกเลข Chat ID ของกลุ่มทันที
      if (/^\/(id|chatid)/i.test(text)) {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🐵 เลข Chat ID ของห้องนี้คือ: ${chatId}\n(นำไปกรอกในหน้าเว็บ IT Link Hub ได้เลยจ้า)`,
            reply_to_message_id: msg.message_id,
          }),
        });
        return res.status(200).json({ ok: true });
      }

      if (!groqKey || !tgToken) {
        return res.status(200).json({ ok: true });
      }

      const linkList = DEFAULT_LINKS.map((l) => `- ${l.name}: ${l.url}`).join("\n");
      const senderName = (msg.from && (msg.from.first_name || msg.from.username)) || "เพื่อนร่วมงาน";

      const tgSysPrompt =
        "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองประจำกลุ่ม Telegram ของฝ่าย IT " +
        "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง ใช้คำลงท้าย เช่น นะ เลย จ้า หลีกเลี่ยง ครับ/ค่ะ " +
        "ตอบกระชับ ตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย\n" +
        `ผู้ที่กำลังถามคุณชื่อ: ${senderName} (รหัสห้องแชต: ${chatId})\n` +
        "รายการลิงค์สำคัญของฝ่าย IT:\n" +
        linkList +
        "\nช่วยตอบคำถามไอที ร่างข้อความ สรุปประเด็น แนะนำลิงค์ หรือพูดคุยช่วยเหลือสมาชิกในกลุ่มอย่างเป็นกันเอง";

      const aiRes = await askGroqAI(groqKey, [
        { role: "system", content: tgSysPrompt },
        { role: "user", content: text },
      ]);

      const replyText = aiRes.ok
        ? aiRes.text
        : `ขออภัยจ้า ตอนนี้สมองน้องมูลด์ขัดข้องชั่วคราว (${aiRes.status})`;

      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          reply_to_message_id: msg.message_id,
        }),
      });

      return res.status(200).json({ ok: true });
    }

    // =========================================================================
    // โหมดที่ 1: ตั้งค่าผูก Webhook เพื่อให้บอทตอบโต้ในกลุ่มได้ (กดจากหน้าเว็บ)
    // =========================================================================
    if (body.action === "telegram_set_webhook") {
      if (!tgToken) {
        return res.status(400).json({
          error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel",
        });
      }
      const host = req.headers["x-forwarded-host"] || req.headers.host || "mouldmate.vercel.app";
      const webhookUrl = `https://${host}/api/chat`;

      const r = await fetch(`https://api.telegram.org/bot${tgToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return res.status(502).json({
          error: data.description || "ตั้งค่า Webhook ไม่สำเร็จ",
        });
      }
      return res.status(200).json({ ok: true, webhookUrl });
    }

    // =========================================================================
    // โหมดที่ 2: ดึง Chat ID ล่าสุด (กรณีไม่ได้เปิด Webhook หรือสำรอง)
    // =========================================================================
    if (body.action === "telegram_get_chat") {
      if (!tgToken) {
        return res.status(400).json({
          error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel Environment Variables",
        });
      }
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/getUpdates?limit=10`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        // กรณีเปิด Webhook อยู่แล้ว Telegram จะไม่ให้ใช้ getUpdates ให้แนะนำพิมพ์ /id ในกลุ่มแทน
        return res.status(400).json({
          error: "เนื่องจากเปิดโหมดบอทตอบโต้อัตโนมัติ (Webhook) แล้ว ให้พิมพ์ /id ในกลุ่ม Telegram เพื่อดูเลข Chat ID ได้เลยจ้า!",
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
        error: "ไม่พบข้อความล่าสุด กรุณาพิมพ์ทักบอทในแอป Telegram ก่อน 1 ครั้งนะครับ",
      });
    }

    // =========================================================================
    // โหมดที่ 3: ส่งข้อความแจ้งเตือนเข้า Telegram จากหน้าเว็บ
    // =========================================================================
    if (body.action === "telegram_send") {
      if (!tgToken) {
        return res.status(400).json({
          error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel",
        });
      }
      const targetChatId = String(body.chatId || defaultChatId || "").trim();
      if (!targetChatId) {
        return res.status(400).json({
          error: "ยังไม่ได้ระบุ Chat ID ในช่องตั้งค่า",
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

    // =========================================================================
    // โหมดที่ 4: คุยแชตกับน้องมูลด์ผ่านหน้าเว็บ IT Link Hub
    // =========================================================================
    if (!groqKey) {
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

    const aiRes = await askGroqAI(groqKey, [{ role: "system", content: sysPrompt }, ...msgs]);

    if (!aiRes.ok) {
      return res.status(502).json({
        error: `Groq ปฏิเสธคำขอ (${aiRes.status}): ${String(aiRes.error).slice(0, 250)}`,
      });
    }

    return res.status(200).json({ text: aiRes.text });
  } catch (err) {
    return res.status(500).json({
      error: `โค้ดฝั่งเซิร์ฟเวอร์ขัดข้อง: ${err && err.message ? err.message : String(err)}`,
    });
  }
};
