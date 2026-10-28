// supabase/functions/manage-staff-accounts/index.ts
// **Deploy this in the ITHelpdesk project**
//
// ตัวกลางจัดการบัญชี login (Supabase Auth + profiles) แทนการเข้า Dashboard เอง
// ใช้ service_role key (Admin API) ฝั่ง server เท่านั้น ไม่เคยส่งให้ browser เห็น
//
// สำคัญที่สุด: ฟังก์ชันนี้เช็คก่อนทุกครั้งว่าคนเรียกมา "login แล้ว" และ
// "role เป็น admin จริง" เท่านั้น ไม่งั้นใครก็เรียกมาสร้างบัญชี admin ให้ตัวเองได้
//
// เรียกจาก manage-staff.html ด้วย body แบบนี้:
//   { action: 'list' }
//   { action: 'create', username, email, password, name, role }
//   { action: 'update', id, name, role, newPassword? }
//   { action: 'delete', id }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ตรวจว่า token ที่แนบมาเป็นของ admin จริง — ใช้ยันทุก action ที่แก้ไขข้อมูล
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return userData.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const caller = await requireAdmin(req);
  if (!caller) {
    return jsonResponse({ error: "ไม่มีสิทธิ์ใช้งาน (เฉพาะ admin เท่านั้น)" }, 403);
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ---------------- LIST ----------------
    if (action === "list") {
      const { data, error } = await admin
        .from("profiles")
        .select("id, username, email, name, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return jsonResponse({ accounts: data });
    }

    // ---------------- CREATE ----------------
    if (action === "create") {
      const { username, email, password, name, role } = body;
      if (!username || !email || !password || !name || !role) {
        return jsonResponse({ error: "กรอกข้อมูลไม่ครบ" }, 400);
      }
      if (password.length < 6) {
        return jsonResponse({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) throw createErr;

      const { error: profileErr } = await admin.from("profiles").insert({
        id: created.user.id,
        username,
        email,
        name,
        role,
      });
      if (profileErr) {
        // ถ้าสร้าง profile ไม่สำเร็จ ลบบัญชี auth ที่เพิ่งสร้างทิ้ง กันมีบัญชีค้างไม่มี profile
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileErr;
      }

      return jsonResponse({ ok: true, id: created.user.id });
    }

    // ---------------- UPDATE ----------------
    if (action === "update") {
      const { id, name, role, newPassword } = body;
      if (!id || !name || !role) {
        return jsonResponse({ error: "กรอกข้อมูลไม่ครบ" }, 400);
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          return jsonResponse({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);
        }
        const { error: passErr } = await admin.auth.admin.updateUserById(id, { password: newPassword });
        if (passErr) throw passErr;
      }

      const { error: updateErr } = await admin
        .from("profiles")
        .update({ name, role })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return jsonResponse({ ok: true });
    }

    // ---------------- DELETE ----------------
    if (action === "delete") {
      const { id } = body;
      if (!id) return jsonResponse({ error: "ไม่มี id" }, 400);

      if (id === caller.id) {
        return jsonResponse({ error: "ลบบัญชีของตัวเองไม่ได้" }, 400);
      }

      await admin.from("profiles").delete().eq("id", id);
      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) throw delErr;

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "ไม่รู้จัก action นี้" }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
