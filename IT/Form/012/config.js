// ===== Utility Functions =====
const $ = id => document.getElementById(id);

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return dateStr; }
}

// ===== Supabase Configuration =====
const SUPABASE_URL = 'https://fnbkcgkuykdabbensvif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuYmtjZ2t1eWtkYWJiZW5zdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDE0MTQsImV4cCI6MjEwNDg3NzQxNH0.L6x3nqAy2rqcxdtzyTs4MHLPubtBqD3Tnk9e97EfEJE';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sb = supabaseClient;

/**
 * เรียกใช้ RPC function ของ Supabase
 * @param {string} fnName - ชื่อ function
 * @param {object} params - พารามิเตอร์
 */
async function rpc(fnName, params = {}) {
  const { data, error } = await supabaseClient.rpc(fnName, params);
  if (error) throw new Error(error.message);
  return data;
}
