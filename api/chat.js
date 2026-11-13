// Vercel Serverless Function: POST /api/chat
// รองรับ: 1) แชตหน้าเว็บ 2) ตารางงาน 3) แจ้งเตือน & ตอบโต้ในกลุ่ม Telegram 4) เช็กสภาพอากาศและโอกาสเกิดฝนแบบสด (Real-time Weather)

const DEFAULT_LINKS = [
  { name: "IT Link Hub (หน้าหลัก)", url: "https://mouldmate.vercel.app/" },
  { name: "Helpdesk Dashboard", url: "https://mouldmate.vercel.app/IT/Helpdesk/dashboard.html" },
  { name: "Checklist CCTV", url: "https://mouldmate.vercel.app/IT/CCTV/ChecklistCCTV.html" },
  { name: "Asset Register", url: "https://mouldmate.vercel.app/IT/Asset/asset-register.html" },
];

// พิกัดจังหวัดหลักในไทย (ค่าเริ่มต้น: กรุงเทพฯ/ปริมณฑล และรองรับการถามชื่อจังหวัด)
const TH_LOCATIONS = [
  { keys: ["สระบุรี", "saraburi", "แก่งคอย", "หนองแค", "มวกเหล็ก"], name: "สระบุรี", lat: 14.5289, lon: 100.9101 },
  { keys: ["อยุธยา", "ayutthaya", "วังน้อย", "บางปะอิน"], name: "พระนครศรีอยุธยา", lat: 14.3532, lon: 100.5684 },
  { keys: ["ปทุมธานี", "pathum", "รังสิต", "คลองหลวง"], name: "ปทุมธานี", lat: 14.0208, lon: 100.5250 },
  { keys: ["นนทบุรี", "nonthaburi", "ปากเกร็ด", "บางใหญ่"], name: "นนทบุรี", lat: 13.8591, lon: 100.5217 },
  { keys: ["สมุทรปราการ", "บางพลี", "สำโรง", "พระประแดง"], name: "สมุทรปราการ", lat: 13.5991, lon: 100.5968 },
  { keys: ["ชลบุรี", "chonburi", "พัทยา", "ศรีราชา", "อมตะ"], name: "ชลบุรี", lat: 13.3611, lon: 100.9847 },
  { keys: ["ระยอง", "rayong", "มาบตาพุด", "ปลวกแดง"], name: "ระยอง", lat: 12.6814, lon: 101.2816 },
  { keys: ["ฉะเชิงเทรา", "แปดริ้ว", "บางปะกง"], name: "ฉะเชิงเทรา", lat: 13.6904, lon: 101.0780 },
  { keys: ["นครราชสีมา", "โคราช", "ปากช่อง"], name: "นครราชสีมา", lat: 14.9799, lon: 102.0978 },
  { keys: ["เชียงใหม่", "chiang mai"], name: "เชียงใหม่", lat: 18.7883, lon: 98.9853 },
  { keys: ["ขอนแก่น", "khon kaen"], name: "ขอนแก่น", lat: 16.4322, lon: 102.8236 },
  { keys: ["ภูเก็ต", "phuket"], name: "ภูเก็ต", lat: 7.8804, lon: 98.3923 },
  { keys: ["สงขลา", "หาดใหญ่"], name: "สงขลา (หาดใหญ่)", lat: 7.0086, lon: 100.4747 },
  { keys: ["กรุงเทพ", "กทม", "bangkok", "bkk"], name: "กรุงเทพมหานคร", lat: 13.7563, lon: 100.5018 },
];

function weatherCodeToThai(code) {
  const map = {
    0: "ท้องฟ้าแจ่มใส ☀️",
    1: "มีเมฆบางส่วน 🌤️",
    2: "มีเมฆเป็นส่วนมาก ⛅",
    3: "เมฆครึ้ม ☁️",
    45: "มีหมอก 🌫️",
    48: "มีหมอกลงจัด 🌫️",
    51: "ฝนปรอยๆ เบาบาง 🌦️",
    53: "ฝนปรอยๆ ปานกลาง 🌦️",
    55: "ฝนปรอยๆ หนัก 🌧️",
    61: "ฝนตกเล็กน้อย 🌦️",
    63: "ฝนตกปานกลาง 🌧️",
    65: "ฝนตกหนัก 🌧️",
    80: "ฝนฟ้าคะนองเป็นแห่งๆ 🌦️",
    81: "ฝนฟ้าคะนองปานกลาง ⛈️",
    82: "ฝนตกหนักมาก ⛈️",
    95: "พายุฝนฟ้าคะนอง ⛈️",
    96: "พายุฝนฟ้าคะนองและลมกระโชกแรง ⛈️",
    99: "พายุฝนฟ้าคะนองรุนแรง ⛈️",
  };
  return map[code] || "มีเมฆและโอกาสเกิดฝน ⛅";
}

// ตรวจจับว่าข้อความถามเรื่องอากาศ/ฝน/อุณหภูมิ หรือไม่
function isWeatherQuery(text) {
  return /(อากาศ|ฝน|ร้อน|หนาว|อุณหภูมิ|แดด|พายุ|ร่ม|พยากรณ์|เมฆ|ฟ้าครึ้ม|weather|rain)/i.test(text || "");
}

// ดึงข้อมูลสภาพอากาศสดจาก Open-Meteo (ฟรี ไม่ต้องใช้ API Key)
async function getLiveWeatherReport(userText) {
  try {
    const lower = String(userText || "").toLowerCase();
    // ค่าเริ่มต้นสามารถตั้งเป็นจังหวัดของบริษัทได้ (หรือตั้งผ่านตัวแปร DEFAULT_PROVINCE ใน Vercel)
    let loc = TH_LOCATIONS.find((l) => l.keys.some((k) => lower.includes(k)));
    if (!loc) {
      const envProv = (process.env.DEFAULT_PROVINCE || "").trim();
      loc = TH_LOCATIONS.find((l) => envProv && l.name.includes(envProv)) || {
        name: "พื้นที่ภาคกลาง (กรุงเทพฯ / ปริมณฑล / สระบุรี)",
        lat: 14.0208,
        lon: 100.5250,
      };
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
      `&timezone=Asia%2FBangkok&forecast_days=2`;

    const r = await fetch(url);
    if (!r.ok) return "";
    const d = await r.json();

    const cur = d.current || {};
    const daily = d.daily || {};

    const curDesc = weatherCodeToThai(cur.weather_code);
    const todayMax = daily.temperature_2m_max?.[0] ?? "-";
    const todayMin = daily.temperature_2m_min?.[0] ?? "-";
    const todayRainProb = daily.precipitation_probability_max?.[0] ?? 0;
    const todayRainMm = daily.precipitation_sum?.[0] ?? 0;
    const tmrDesc = weatherCodeToThai(daily.weather_code?.[1]);
    const tmrRainProb = daily.precipitation_probability_max?.[1] ?? 0;

    return (
      `\n[ข้อมูลสภาพอากาศสด (Real-time) สำหรับ ${loc.name}]:\n` +
      `- สภาพอากาศตอนนี้: ${curDesc}, อุณหภูมิ ${cur.temperature_2m}°C (ความรู้สึกร้อนจริง ${cur.apparent_temperature}°C), ความชื้น ${cur.relative_humidity_2m}%, ลม ${cur.wind_speed_10m} km/h\n` +
      `- ภาพรวมวันนี้: อุณหภูมิต่ำสุด ${todayMin}°C / สูงสุด ${todayMax}°C, โอกาสเกิดฝนวันนี้ ${todayRainProb}% (ปริมาณฝนสะสมคาดการณ์ ${todayRainMm} มม.)\n` +
      `- แนวโน้มพรุ่งนี้: ${tmrDesc}, โอกาสเกิดฝน ${tmrRainProb}%\n` +
      `(ให้นำตัวเลขจริงนี้ไปสรุปตอบผู้ใช้แบบเป็นกันเองได้เลย และแนะนำเรื่องการพกร่มหรือดูแลสุขภาพตามความเหมาะสม)`
    );
  } catch (e) {
    return "";
  }
}

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

      if (isGroup && !isReplyToBot && !isMentioned) {
        return res.status(200).json({ ok: true });
      }

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

      const weatherInfo = isWeatherQuery(text) ? await getLiveWeatherReport(text) : "";
      const linkList = DEFAULT_LINKS.map((l) => `- ${l.name}: ${l.url}`).join("\n");
      const senderName = (msg.from && (msg.from.first_name || msg.from.username)) || "เพื่อนร่วมงาน";

      const tgSysPrompt =
        "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองประจำกลุ่ม Telegram ของฝ่าย IT " +
        "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง ใช้คำลงท้าย เช่น นะ เลย จ้า หลีกเลี่ยง ครับ/ค่ะ " +
        "ตอบกระชับ ตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย\n" +
        `ผู้ที่กำลังถามคุณชื่อ: ${senderName}\n` +
        "รายการลิงค์สำคัญของฝ่าย IT:\n" +
        linkList +
        weatherInfo +
        "\nช่วยตอบคำถามไอที สภาพอากาศ ร่างข้อความ สรุปประเด็น แนะนำลิงค์ หรือพูดคุยช่วยเหลือสมาชิกในกลุ่มอย่างเป็นกันเอง";

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
    // โหมดที่ 1: ตั้งค่าผูก Webhook
    // =========================================================================
    if (body.action === "telegram_set_webhook") {
      if (!tgToken) {
        return res.status(400).json({ error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel" });
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
        return res.status(502).json({ error: data.description || "ตั้งค่า Webhook ไม่สำเร็จ" });
      }
      return res.status(200).json({ ok: true, webhookUrl });
    }

    // =========================================================================
    // โหมดที่ 2: ดึง Chat ID ล่าสุด
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
        return res.status(400).json({ error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel" });
      }
      const targetChatId = String(body.chatId || defaultChatId || "").trim();
      if (!targetChatId) {
        return res.status(400).json({ error: "ยังไม่ได้ระบุ Chat ID ในช่องตั้งค่า" });
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
        return res.status(502).json({ error: data.description || `Telegram Error (${r.status})` });
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

    const lastUserMsg = msgs[msgs.length - 1].content || "";
    const weatherInfo = isWeatherQuery(lastUserMsg) ? await getLiveWeatherReport(lastUserMsg) : "";

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
      "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองที่ใจดีและเป็นกันเองประจำหน้ารวมลิงค์ของน้องตั้มน่ารัก " +
      "พูดภาษาไทยที่เป็นธรรมชาติแบบเป็นกันเอง เหมือนเพื่อนร่วมงานที่สนิท ใช้คำลงท้ายที่เป็นกลางทางเพศ เช่น นะ เลย จ้า " +
      "หลีกเลี่ยง ครับ/ค่ะ ไม่หยาบคาย ตอบกระชับตรงประเด็น เป็นข้อความธรรมดา ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย\n" +
      `วันและเวลาปัจจุบันของผู้ใช้คือ: ${clientNow}\n` +
      "\nรายการลิงค์ในหน้าเว็บ:\n" +
      (linkList || "- ยังไม่มีลิงค์") +
      "\nตารางงานและการแจ้งเตือนที่ตั้งไว้ปัจจุบัน:\n" +
      (schedList || "- ยังไม่มีตารางงานที่ตั้งเตือนไว้") +
      weatherInfo +
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
