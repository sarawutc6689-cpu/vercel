// Vercel Serverless Function: POST /api/chat
// รองรับ: 1) แชตหน้าเว็บ 2) ตารางงาน 3) แจ้งเตือน & ตอบโต้ในกลุ่ม Telegram 4) พยากรณ์อากาศสด 5) ข้อมูลร้านอาหารและร้านน้ำ

const DEFAULT_LINKS = [
  { name: "IT Link Hub (หน้าหลัก)", url: "https://mouldmate.vercel.app/" },
  { name: "Helpdesk Dashboard", url: "https://mouldmate.vercel.app/IT/Helpdesk/dashboard.html" },
  { name: "Checklist CCTV", url: "https://mouldmate.vercel.app/IT/CCTV/ChecklistCCTV.html" },
  { name: "Asset Register", url: "https://mouldmate.vercel.app/IT/Asset/asset-register.html" },
];

const DEFAULT_FOODS_TEXT =
  "- [ร้านอาหาร] ครัวป้าศรี ตามสั่งหน้าโรงงาน: กะเพราหมูกรอบไข่ดาว, ข้าวผัดต้มยำ, คะน้าหมูชิ้น\n" +
  "- [ร้านอาหาร] เตี๋ยวเรือรสเด็ด: ก๋วยเตี๋ยวเรือน้ำตกหมู/เนื้อ, กากหมูเจียว, ลูกชิ้นปิ้ง\n" +
  "- [ร้านอาหาร] ส้มตำแซ่บอีสาน: ส้มตำไทย/ปูปลาร้า, ไก่ย่าง, คอหมูย่าง, ลาบหมู\n" +
  "- [ร้านอาหาร] ข้าวมันไก่ & ข้าวหมูแดงเฮียตี๋: ข้าวมันไก่ต้ม/ผสม, ข้าวหมูแดงหมูกรอบ\n" +
  "- [ร้านน้ำ/คาเฟ่] Café Amazon: เอสเปรสโซ่เย็นหวานน้อย, ชาเขียวเย็น, ชานมเย็น, แบล็คคอฟฟี่น้ำผึ้ง\n" +
  "- [ร้านน้ำ/คาเฟ่] ร้านน้ำปั่น & ชาไข่มุกหน้าออฟฟิศ: ชานมไต้หวันไข่มุก, โกโก้เข้มข้น, แตงโมปั่น, มะพร้าวนมสดปั่น\n" +
  "- [ร้านน้ำ/คาเฟ่] เต่าบิน (Tao Bin): โอริโอ้ปั่นภูเขาไฟ, มัทฉะลาเต้, กาแฟส้ม, บ๊วยโซดา";

const TH_LOCATIONS = [
  { keys: ["สระบุรี", "saraburi", "แก่งคอย", "หนองแค", "มวกเหล็ก", "เขาวง"], name: "สระบุรี", lat: 14.5289, lon: 100.9101 },
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

function isWeatherQuery(text) {
  return /(อากาศ|ฝน|ร้อน|หนาว|อุณหภูมิ|แดด|พายุ|ร่ม|พยากรณ์|เมฆ|ฟ้าครึ้ม|weather|rain)/i.test(text || "");
}

async function getLiveWeatherReport(userText) {
  try {
    const lower = String(userText || "").toLowerCase();
    let loc = TH_LOCATIONS.find((l) => l.keys.some((k) => lower.includes(k)));
    if (!loc) {
      const envProv = (process.env.DEFAULT_PROVINCE || "").trim();
      loc = TH_LOCATIONS.find((l) => envProv && l.name.includes(envProv)) || {
        name: "พื้นที่ภาคกลาง (กรุงเทพฯ / ปริมณฑล / สระบุรี)",
        lat: 14.5289,
        lon: 100.9101,
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
      `- แนวโน้มพรุ่งนี้: ${tmrDesc}, โอกาสเกิดฝน ${tmrRainProb}%\n`
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
      const senderName = (msg.from && (msg.from.first_name || msg.
