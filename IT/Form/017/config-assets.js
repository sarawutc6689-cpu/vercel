// ===== โปรเจค B: โปรเจคที่มีตาราง assets อยู่แล้ว =====
const SUPABASE_B_URL = 'https://fuarmmweqxxhczavkvqp.supabase.co';
const SUPABASE_B_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1YXJtbXdlcXh4aGN6YXZrdnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjgzMTcsImV4cCI6MjEwMzgwNDMxN30.n7s4gKOkCvaOSpFSf9FGmWsqi7eAzFe28c_oJWy8NSE';
// ==============================================================

const sbB = supabase.createClient(SUPABASE_B_URL, SUPABASE_B_KEY);

// เรียกฟังก์ชันฝั่งทรัพย์สิน (โปรเจค B)
async function rpcB(fn, args = {}) {
  const { data, error } = await sbB.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
