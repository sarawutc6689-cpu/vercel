// ===== ใส่ค่าจาก Supabase: Project Settings > API =====
// ใช้โปรเจค Supabase เดียวกับ FOM 012 ได้เลย (ค่าเดียวกัน)
const SUPABASE_URL = 'https://fnbkcgkuykdabbensvif.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuYmtjZ2t1eWtkYWJiZW5zdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDE0MTQsImV4cCI6MjEwNDg3NzQxNH0.L6x3nqAy2rqcxdtzyTs4MHLPubtBqD3Tnk9e97EfEJE';
// ======================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// เรียกฟังก์ชันใน Supabase (แทน google.script.run)
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
