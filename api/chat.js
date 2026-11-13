// Vercel Serverless Function: POST /api/chat
// รองรับ: 1) แชตหน้าเว็บ 2) ตารางงาน 3) Telegram 4) พยากรณ์อากาศสด 5) ร้านอาหาร/น้ำ 6) ค้นหาความรู้ทั่วไป & เว็บสด

const DEFAULT_LINKS = [
  { name: "IT Link Hub", url: "https://mouldmate.vercel.app/" },
  { name: "Helpdesk Dashboard", url: "https://mouldmate.vercel.app/IT/Helpdesk/dashboard.html" },
  { name: "Checklist CCTV", url: "https://mouldmate.vercel.app/IT/CCTV/ChecklistCCTV.html" },
  { name: "Asset Register", url: "https://mouldmate.vercel.app/IT/Asset/asset-register.html" },
];

const FOOD_AND_DRINK_INFO =
  "\n[ข้อมูลร้านอาหารและร้านน้ำแนะนำสำหรับแผนก]:\n" +
  "🍚 ร้านอาหาร:\n" +
  "- ร้านอาหารตามสั่งหน้าโรงงาน: กะเพราหมูกรอบไข่ดาว, ข้าวผัดต้มยำ, คะน้าหมูน้ำมันหอย, ข้าวไข่เจียวหมูสับ\n" +
  "- ร้านก๋วยเตี๋ยวเรือรสเด็ด: ก๋วยเตี๋ยวเรือน้ำตกหมู/เนื้อ, เกาเหลา, กากหมูเจียว, ลูกชิ้นปิ้ง\n" +
  "- ร้านส้มตำแซ่บอีสาน: ส้มตำไทย/ปูปลาร้า, ไก่ย่าง, คอหมูย่าง, น้ำตกหมู, ลาบหมู\n" +
  "- ร้านข้าวมันไก่ & ข้าวหมูแดง: ข้าวมันไก่ต้ม/ไก่ทอด, ข้าวหมูแดงหมูกรอบ, บะหมี่เกี๊ยว\n" +
  "- ร้านราดหน้า & ผัดซีอิ๊ว: ราดหน้าหมูหมักเส้นใหญ่, ผัดซีอิ๊วหมู/ทะเล, ข้าวผัดปู\n" +
  "🧋 ร้านน้ำ / กาแฟ / ของหวาน:\n" +
  "- Café Amazon: เอสเปรสโซ่เย็นหวานน้อย, แบล็คคอฟฟี่น้ำผึ้งมะนาว, ชาเขียวนมสด, ชานมเย็น, มัทฉะถั่วแดง\n" +
  "- ร้านน้ำปั่น & ชาไข่มุก: ชานมไต้หวันไข่มุก, โกโก้เย็นเข้มข้น, แตงโมปั่น, มะพร้าวนมสดปั่น, แดงมะนาวโซดา\n" +
  "- ตู้เต่าบิน (Tao Bin): โอริโอ้ปั่นภูเขาไฟ, มัทฉะลาเต้, กาแฟส้ม, บ๊วยโซดา, นมสดคาราเมล\n";

const TH_LOCATIONS = [
  { keys: ["สระบุรี", "saraburi", "แก่งคอย", "หนองแค", "มวกเหล็ก", "เริงราง"], name: "สระบุรี", lat: 14.5289, lon: 100.9101 },
  { keys: ["อยุธยา", "ayutthaya", "วังน้อย", "บางปะอิน"], name: "พระนครศรีอยุธยา", lat: 14.3532, lon: 100.5684 },
  { keys: ["ปทุมธานี", "pathum", "รังสิต", "คลองหลวง"], name: "ปทุมธานี", lat: 14.0208, lon: 100.525 },
  { keys: ["นนทบุรี", "nonthaburi", "ปากเกร็ด", "บางใหญ่"], name: "นนทบุรี", lat: 13.8591, lon: 100.5217 },
  { keys: ["สมุทรปราการ", "บางพลี", "สำโรง"], name: "สมุทรปราการ", lat: 13.5991, lon: 100.5968 },
  { keys: ["ชลบุรี", "chonburi", "พัทยา", "ศรีราชา"], name: "ชลบุรี", lat: 13.3611, lon: 100.9847 },
  { keys: ["ระยอง", "rayong", "ปลวกแดง"], name: "ระยอง", lat: 12.6814, lon: 101.2816 },
  { keys: ["นครราชสีมา", "โคราช", "ปากช่อง"], name: "นครราชสีมา", lat: 14.9799, lon: 102.0978 },
  { keys: ["เชียงใหม่", "chiang mai"], name: "เชียงใหม่", lat: 18.7883, lon: 98.9853 },
  { keys: ["ขอนแก่น", "khon kaen"], name: "ขอนแก่น", lat: 16.4322, lon: 102.8236 },
  { keys: ["ภูเก็ต", "phuket"], name: "ภูเก็ต", lat: 7.8804, lon: 98.3923 },
  { keys: ["สงขลา", "หาดใหญ่"], name: "สงขลา", lat: 7.0086, lon: 100.4747 },
  { keys: ["กรุงเทพ", "กทม", "bangkok", "bkk"], name: "กรุงเทพมหานคร", lat: 13.7563, lon: 100.5018 },
];

function weatherCodeToThai(code) {
  const map = {
    0: "ท้องฟ้าแจ่มใส ☀️", 1: "มีเมฆบางส่วน 🌤️", 2: "มีเมฆเป็นส่วนมาก ⛅", 3: "เมฆครึ้ม ☁️",
    45: "มีหมอก 🌫️", 48: "มีหมอกลงจัด 🌫️", 51: "ฝนปรอยๆ เบาบาง 🌦️", 53: "ฝนปรอยๆ ปานกลาง 🌦️",
    55: "ฝนปรอยๆ หนัก 🌧️", 61: "ฝนตกเล็กน้อย 🌦️", 63: "ฝนตกปานกลาง 🌧️", 65: "ฝนตกหนัก 🌧️",
    80: "ฝนฟ้าคะนองเป็นแห่งๆ 🌦️", 81: "ฝนฟ้าคะนองปานกลาง ⛈️", 82: "ฝนตกหนักมาก ⛈️",
    95: "พายุฝนฟ้าคะนอง ⛈️", 96: "พายุฝนฟ้าคะนองและลมแรง ⛈️", 99: "พายุฝนฟ้าคะนองรุนแรง ⛈️",
  };
  return map[code] || "มีเมฆและโอกาสเกิดฝน ⛅";
}

function isWeatherQuery(text) {
  return /(อากาศ|ฝน|ร้อน|หนาว|อุณหภูมิ|แดด|พายุ|ร่ม|พยากรณ์|เมฆ|ฟ้าครึ้ม|weather|rain)/i.test(text || "");
}

async function getLiveWeatherReport(userText) {
  try {
    const lower = String(userText || "").toLowerCase();
    const loc = TH_LOCATIONS.find((l) => l.keys.some((k) => lower.includes(k))) || {
      name: "สระบุรี / ภาคกลาง",
      lat: 14.5289,
      lon: 100.9101,
    };

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Asia%2FBangkok&forecast_days=2`;

    const r = await fetch(url);
    if (!r.ok) return "";
    const d = await r.json();
    const cur = d.current || {};
    const daily = d.daily || {};

    return (
      `\n[ข้อมูลสภาพอากาศสดสำหรับ ${loc.name}]:\n` +
      `- ตอนนี้: ${weatherCodeToThai(cur.weather_code)}, อุณหภูมิ ${cur.temperature_2m}°C (รู้สึกเหมือน ${cur.apparent_temperature}°C), ความชื้น ${cur.relative_humidity_2m}%\n` +
      `- วันนี้: ต่ำสุด ${daily.temperature_2m_min?.[0] ?? "-"}°C / สูงสุด ${daily.temperature_2m_max?.[0] ?? "-"}°C, โอกาสเกิดฝน ${daily.precipitation_probability_max?.[0] ?? 0}%\n` +
      `- พรุ่งนี้: ${weatherCodeToThai(daily.weather_code?.[1])}, โอกาสเกิดฝน ${daily.precipitation_probability_max?.[1] ?? 0}%\n`
    );
  } catch (e) {
    return "";
  }
}

// ค้นหาความรู้ทั่วไปจาก Wikipedia ภาษาไทย (ฟรี ไม่ต้องใช้ API Key)
async function searchGeneralKnowledge(query) {
  try {
    const cleanQ = String(query || "")
      .replace(/(น้องมูลด์|มูลด์|คืออะไร|หมายถึงอะไร|อยากรู้เรื่อง|ช่วยบอก|หน่อย|จ้า|ครับ|ค่ะ|\?)/gi, " ")
      .trim();
    if (cleanQ.length < 2) return "";

    const url = `https://th.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json&srlimit=2`;
    const r = await fetch(url, { headers: { "User-Agent": "MouldMateITBot/1.0" } });
    if (!r.ok) return "";
    const data = await r.json();
    const items = (data.query && data.query.search) || [];
    if (!items.length) return "";

    const snippets = items.map((it) => {
      const cleanSnippet = String(it.snippet || "").replace(/<[^>]+>/g, "");
      return `- ${it.title}: ${cleanSnippet}`;
    });
    return `\n[ข้อมูลอ้างอิงความรู้ทั่วไปจากสารานุกรม]:\n${snippets.join("\n")}\n`;
  } catch (e) {
    return "";
  }
}

async function askGroqAI(key, messages) {
  const modelsToTry = [
    process.env.GROQ_MODEL,
    "openai/gpt-oss-120b",
    "groq/compound-mini",
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
        temperature: 0.6,
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
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const tgToken = String(process.env.TELEGRAM_BOT_TOKEN || "").replace(/[^\x21-\x7E]/g, "").trim();
    const defaultChatId = String(process.env.TELEGRAM_CHAT_ID || "").replace(/[^\x21-\x7E]/g, "").trim();
    const rawKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "";
    const groqKey = String(rawKey).replace(/[^\x21-\x7E]/g, "").trim();

    // 1. รับข้อความจากกลุ่ม Telegram (Webhook)
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
      const isMentioned = text.includes("มูลด์") || text.toLowerCase().includes("mould") || text.startsWith("/") || text.includes("@");

      if (isGroup && !isReplyToBot && !isMentioned) {
        return res.status(200).json({ ok: true });
      }

      if (/^\/(id|chatid)/i.test(text)) {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🐵 เลข Chat ID ของห้องนี้คือ: ${chatId}`,
            reply_to_message_id: msg.message_id,
          }),
        });
        return res.status(200).json({ ok: true });
      }

      if (!groqKey || !tgToken) return res.status(200).json({ ok: true });

      const [weatherInfo, wikiInfo] = await Promise.all([
        isWeatherQuery(text) ? getLiveWeatherReport(text) : Promise.resolve(""),
        searchGeneralKnowledge(text),
      ]);

      const linkList = DEFAULT_LINKS.map((l) => `- ${l.name}: ${l.url}`).join("\n");
      const senderName = (msg.from && (msg.from.first_name || msg.from.username)) || "เพื่อนร่วมงาน";

      const tgSysPrompt =
        "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองประจำกลุ่ม Telegram ของฝ่าย IT ที่รอบรู้ทุกเรื่อง " +
        "พูดภาษาไทยเป็นกันเอง ใช้คำลงท้าย นะ เลย จ้า หลีกเลี่ยง ครับ/ค่ะ ตอบกระชับ ไม่ใช้ markdown\n" +
        `ผู้ถามชื่อ: ${senderName}\n` +
        "ลิงค์ของฝ่าย IT:\n" + linkList +
        FOOD_AND_DRINK_INFO +
        weatherInfo +
        wikiInfo +
        "\nคุณสามารถตอบคำถามได้ทุกเรื่อง ทั้งความรู้ทั่วไป วิทยาศาสตร์ ประวัติศาสตร์ สุขภาพ กฎหมาย การคำนวณ ภาษา ไอที การเขียนโค้ด ร่างเอกสาร รวมถึงแนะนำอาหารและเครื่องดื่มอย่างอารมณ์ดี";

      const aiRes = await askGroqAI(groqKey, [
        { role: "system", content: tgSysPrompt },
        { role: "user", content: text },
      ]);

      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiRes.ok ? aiRes.text : `ขออภัยจ้า ระบบขัดข้องชั่วคราว (${aiRes.status})`,
          reply_to_message_id: msg.message_id,
        }),
      });

      return res.status(200).json({ ok: true });
    }

    // 2. ดึง Chat ID ล่าสุด
    if (body.action === "telegram_get_chat") {
      if (!tgToken) return res.status(400).json({ error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel" });
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/getUpdates?limit=10`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return res.status(400).json({ error: "หากเปิด Webhook แล้ว ให้พิมพ์ /id ในกลุ่ม Telegram เพื่อดูเลข Chat ID ได้เลยจ้า" });
      }
      const updates = Array.isArray(data.result) ? data.result : [];
      for (let i = updates.length - 1; i >= 0; i--) {
        const u = updates[i];
        const chat = (u.message && u.message.chat) || (u.my_chat_member && u.my_chat_member.chat);
        if (chat && chat.id) {
          return res.status(200).json({ chatId: String(chat.id), title: chat.title || chat.first_name || "แชตส่วนตัว" });
        }
      }
      return res.status(404).json({ error: "ไม่พบข้อความล่าสุด กรุณาทักบอทใน Telegram ก่อน 1 ครั้ง" });
    }

        // ส่งไฟล์เอกสาร PDF เข้า Telegram (เรียกจากหน้า ChecklistCCTV.html)
    if (body.action === "telegram_send_pdf") {
      if (!tgToken) {
        return res.status(400).json({ error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel" });
      }
      const targetChatId = String(body.chatId || defaultChatId || "").trim();
      if (!targetChatId) {
        return res.status(400).json({ error: "ยังไม่ได้ระบุ TELEGRAM_CHAT_ID ใน Vercel หรือหน้าเว็บ" });
      }
      const pdfBase64 = String(body.pdfBase64 || "").replace(/^data:[^;]+;base64,/, "");
      const filename = String(body.filename || "CCTV_Report.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const caption = String(body.caption || "📋 รายงานตรวจสอบกล้องวงจรปิด (CCTV)").slice(0, 1000);

      if (!pdfBase64) {
        return res.status(400).json({ error: "ไม่พบข้อมูลไฟล์ PDF" });
      }

      const fileBuffer = Buffer.from(pdfBase64, "base64");
      const form = new FormData();
      form.append("chat_id", targetChatId);
      form.append("caption", caption);
      form.append("document", new Blob([fileBuffer], { type: "application/pdf" }), filename);

      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendDocument`, {
        method: "POST",
        body: form,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return res.status(502).json({ error: data.description || `Telegram Error (${r.status})` });
      }
      return res.status(200).json({ ok: true });
    }


    // 3. ส่งแจ้งเตือนเข้า Telegram
    if (body.action === "telegram_send") {
      if (!tgToken) return res.status(400).json({ error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN ใน Vercel" });
      const targetChatId = String(body.chatId || defaultChatId || "").trim();
      if (!targetChatId) return res.status(400).json({ error: "ยังไม่ได้ระบุ Chat ID" });
      const text = String(body.text || "").trim().slice(0, 3500);
      if (!text) return res.status(400).json({ error: "ไม่มีข้อความที่จะส่ง" });

      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: targetChatId, text: text }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return res.status(502).json({ error: data.description || "Telegram Error" });
      return res.status(200).json({ ok: true });
    }

    // 4. คุยแชตกับน้องมูลด์ผ่านหน้าเว็บ
    if (!groqKey) return res.status(500).json({ error: "missing_api_key" });

    const rawMsgs = Array.isArray(body.messages) ? body.messages : [];
    const msgs = rawMsgs
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    if (msgs.length === 0) return res.status(400).json({ error: "ไม่มีข้อความส่งมา" });

    const lastUserMsg = msgs[msgs.length - 1].content || "";
    const [weatherInfo, wikiInfo] = await Promise.all([
      isWeatherQuery(lastUserMsg) ? getLiveWeatherReport(lastUserMsg) : Promise.resolve(""),
      searchGeneralKnowledge(lastUserMsg),
    ]);

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
      "คุณคือ “น้องมูลด์” เลขาส่วนตัวรูปลิงน้อยเสื้อเหลืองที่ใจดี รอบรู้ และเป็นกันเองประจำหน้ารวมลิงค์ของฝ่าย IT " +
      "พูดภาษาไทยเป็นธรรมชาติแบบเป็นกันเอง ใช้คำลงท้าย นะ เลย จ้า หลีกเลี่ยง ครับ/ค่ะ ตอบกระชับ ไม่ใช้ markdown ใช้อีโมจิได้เล็กน้อย\n" +
      `วันและเวลาปัจจุบันของผู้ใช้: ${clientNow}\n` +
      "\nรายการลิงค์ในหน้าเว็บ:\n" + (linkList || "- ยังไม่มีลิงค์") +
      "\nตารางงานปัจจุบัน:\n" + (schedList || "- ยังไม่มีตารางงาน") +
      FOOD_AND_DRINK_INFO +
      weatherInfo +
      wikiInfo +
      "\nขอบเขตความรู้: คุณสามารถตอบคำถามได้ทุกเรื่อง ทั้งความรู้รอบตัว วิทยาศาสตร์ ประวัติศาสตร์ สุขภาพ กฎหมาย การคำนวณ สูตร Excel การเขียนโค้ด ไอที การแปลภาษา รวมถึงแนะนำร้านอาหารและร้านน้ำจากข้อมูลด้านบนอย่างอารมณ์ดี" +
      "\n\nคำสั่งพิเศษ (แนบแท็กไว้ท้ายคำตอบเมื่อผู้ใช้สั่งการ):\n" +
      "1. สั่งเพิ่มตารางงาน/เตือนความจำ: แนบ [[ADD_SCHED:ชื่องาน|HH:MM|ความถี่|YYYY-MM-DD]] (ความถี่: daily, weekdays, once)\n" +
      "2. สั่งลบตารางงาน: แนบ [[DEL_SCHED:คำสำคัญของชื่องาน]]\n" +
      "3. สั่งส่งข้อความเข้า Telegram: แนบ [[SEND_TG:ข้อความที่ต้องการส่ง]]";

    const aiRes = await askGroqAI(groqKey, [{ role: "system", content: sysPrompt }, ...msgs]);

    if (!aiRes.ok) {
      return res.status(502).json({ error: `Groq ปฏิเสธคำขอ (${aiRes.status}): ${String(aiRes.error).slice(0, 200)}` });
    }

    return res.status(200).json({ text: aiRes.text });
  } catch (err) {
    return res.status(500).json({ error: `เซิร์ฟเวอร์ขัดข้อง: ${err && err.message ? err.message : String(err)}` });
  }
};
