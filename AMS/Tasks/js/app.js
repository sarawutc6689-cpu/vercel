// ==== ตั้งค่า Supabase ====
const SUPABASE_URL = 'https://clowvcraydxpvwdbpkhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsb3d2Y3JheWR4cHZ3ZGJwa2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTA3NTAsImV4cCI6MjEwMzMyNjc1MH0.pXV0g3JfakqNRgKjgCe87Reie5ZhXzqYXpZ3OVkluHk';

// เปลี่ยนชื่อตัวแปรตรงนี้ ไม่ให้ซ้ำกับตัว Global ของ CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const employeeSelect = document.getElementById('employeeSelect');
const assignForm = document.getElementById('assignForm');
const statusMessage = document.getElementById('statusMessage');
const submitBtn = document.getElementById('submitBtn');

// 1. ดึงรายชื่อพนักงาน
async function loadEmployees() {
    // เปลี่ยนจากการเรียก supabase เป็น supabaseClient
    const { data, error } = await supabaseClient
        .from('employees')
        .select('id, name, telegram_chat_id')
        .not('telegram_chat_id', 'is', null);

    if (error) {
        console.error('Error loading employees:', error);
        return;
    }

    employeeSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
    data.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.telegram_chat_id;
        option.textContent = emp.name;
        employeeSelect.appendChild(option);
    });
}

// 2. จัดการเมื่อกดปุ่มส่งฟอร์ม
assignForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังดำเนินการ...';
    statusMessage.textContent = '';

    const chatId = employeeSelect.value;
    const taskTitle = document.getElementById('taskTitle').value;
    const taskDetail = document.getElementById('taskDetail').value;

    try {
        // (Optional) บันทึกข้อมูลลงตาราง repair_jobs ก่อน
        // await supabaseClient.from('repair_jobs').insert([...]);

        // 3. เรียกใช้ Vercel API
        const response = await fetch('/api/send-task', { 
    method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, taskTitle, taskDetail })
        });

        const result = await response.json();

        if (response.ok) {
            statusMessage.innerHTML = '<span class="text-green-600">✅ มอบหมายงานและส่งแจ้งเตือนสำเร็จ!</span>';
            assignForm.reset();
        } else {
            throw new Error(result.error || 'เกิดข้อผิดพลาด');
        }
    } catch (error) {
        statusMessage.innerHTML = `<span class="text-red-600">❌ ผิดพลาด: ${error.message}</span>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'มอบหมายงาน & แจ้งเตือน Telegram';
    }
});

// เริ่มทำงานเมื่อโหลดหน้าเว็บ
loadEmployees();
