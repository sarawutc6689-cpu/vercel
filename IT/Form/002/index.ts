// supabase/functions/sync-employees/index.ts
// **Deploy this in the it-account-request project**
//
// ดึงพนักงานสถานะ active จาก hr-master แล้ว sync เข้าตาราง employees
// (key = employees_code) — อัปเดตแค่ name_thai/section/department/position
// เท่านั้น *ไม่แตะ* name_eng และ telephone เด็ดขาด เพราะ 2 ฟิลด์นี้มาจาก
// การกรอกฟอร์มของพนักงานเอง ไม่ได้มาจาก hr-master

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HR_MASTER_URL = Deno.env.get("HR_MASTER_URL")!;
const HR_MASTER_ANON_KEY = Deno.env.get("HR_MASTER_ANON_KEY")!;

const local = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const master = createClient(HR_MASTER_URL, HR_MASTER_ANON_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { employee_code } = body;

    let query = master.from("employees_directory").select("*").eq("status", "active");
    if (employee_code) query = query.eq("employee_code", employee_code);
    const { data: hrEmployees, error: hrErr } = await query;
    if (hrErr) throw hrErr;

    const results = { created: [] as string[], updated: [] as string[] };

    for (const emp of hrEmployees ?? []) {
      const { data: existing } = await local
        .from("employees")
        .select("id")
        .eq("employees_code", emp.employee_code)
        .maybeSingle();

      if (existing) {
        // เจอแล้ว: อัปเดตแค่ฟิลด์ที่มาจาก hr-master เท่านั้น
        await local
          .from("employees")
          .update({
            name_thai: emp.full_name,
            section: emp.section_name,
            department: emp.department_name,
            position: emp.position_name,
            updated_at: new Date().toISOString(),
          })
          .eq("employees_code", emp.employee_code);
        results.updated.push(emp.employee_code);
      } else {
        // คนใหม่: สร้างแถวใหม่ name_eng/telephone เว้นว่างไว้ก่อน
        // (จะถูกกรอกครั้งแรกตอนมีคนยื่นคำขอให้คนนี้ผ่าน form.html)
        await local.from("employees").insert({
          employees_code: emp.employee_code,
          name_thai: emp.full_name,
          section: emp.section_name,
          department: emp.department_name,
          position: emp.position_name,
        });
        results.created.push(emp.employee_code);
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
