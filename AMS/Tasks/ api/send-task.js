export default async function handler(req, res) {
  // อนุญาตเฉพาะ POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatId, taskTitle, taskDetail } = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // ดึงจาก Vercel Env

  if (!chatId || !BOT_TOKEN) {
    return res.status(400).json({ error: 'Missing chatId or Bot Token' });
  }

  const text = `📋 <b>งานใหม่ที่ได้รับมอบหมาย</b>\n\n<b>หัวข้อ:</b> ${taskTitle}\n<b>รายละเอียด:</b> ${taskDetail}`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });

    const data = await tgRes.json();
    if (!data.ok) throw new Error(data.description);

    return res.status(200).json({ success: true, message: 'ส่งแจ้งเตือนสำเร็จ' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
