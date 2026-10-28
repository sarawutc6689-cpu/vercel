// ===== โปรเจค A: โปรเจคเดียวกับ FOM 012 (ใช้ค้นหาพนักงาน) =====
const SUPABASE_A_URL = 'https://fnbkcgkuykdabbensvif.supabase.co';
const SUPABASE_A_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuYmtjZ2t1eWtkYWJiZW5zdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDE0MTQsImV4cCI6MjEwNDg3NzQxNH0.L6x3nqAy2rqcxdtzyTs4MHLPubtBqD3Tnk9e97EfEJE';
// ==============================================================

const sbA = supabase.createClient(SUPABASE_A_URL, SUPABASE_A_KEY);

// เรียกฟังก์ชันฝั่งพนักงาน (โปรเจค A)
async function rpcA(fn, args = {}) {
  const { data, error } = await sbA.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
