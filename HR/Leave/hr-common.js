/* hr-common.js — ตัวช่วยร่วมของหน้า HR ที่ดึงข้อมูลจำนวนมาก (dashboard.html, report.html, summary.html)
 * ต้องโหลดหลังสร้าง supabase client ของแต่ละหน้า; ฟังก์ชันรับ sb เป็นพารามิเตอร์
 */
(function () {
  var HR = {};

  /* ---------- ค่าคงที่ ---------- */
  HR.PENDING = ["pending", "pending_manager", "pending_hr"];
  HR.STATUS_TH = {
    pending: "รออนุมัติ", pending_manager: "รอผู้จัดการฝ่าย", pending_hr: "รอฝ่ายบุคคล",
    approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", cancelled: "ยกเลิก"
  };
  HR.MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  HR.statusGroup = function (s) { return s === "approved" ? "approved" : HR.PENDING.indexOf(s) >= 0 ? "pending" : s; };

  HR.DEFAULT_TYPES = [
    { code: "vacation", name: "ลาพักร้อน", quota_mode: "tenure", quota_days: 0, tenure_tiers: [{ min_months: 0, days: 0 }, { min_months: 4, days: 6 }, { min_months: 24, days: 7 }, { min_months: 36, days: 8 }], hourly_allowed: false, gender: "all", active: true, sort_order: 10 },
    { code: "personal_paid", name: "ลากิจ (รับค่าจ้าง)", quota_mode: "fixed", quota_days: 6, hourly_allowed: true, gender: "all", active: true, sort_order: 20 },
    { code: "personal_unpaid", name: "ลากิจ (ไม่รับค่าจ้าง)", quota_mode: "fixed", quota_days: 6, hourly_allowed: true, gender: "all", active: true, sort_order: 30 },
    { code: "sick", name: "ลาป่วย", quota_mode: "fixed", quota_days: 30, hourly_allowed: false, gender: "all", active: true, sort_order: 40 },
    { code: "maternity", name: "ลาคลอด", quota_mode: "fixed", quota_days: 90, hourly_allowed: false, gender: "F", active: true, sort_order: 50 },
    { code: "military", name: "ลาราชการทหาร", quota_mode: "fixed", quota_days: 3, hourly_allowed: false, gender: "M", active: true, sort_order: 60 }
  ];

  /* ---------- จัดรูปแบบ ---------- */
  HR.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  HR.fmt = function (n) {
    n = Number(n);
    if (!isFinite(n)) return "-";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  HR.ymd = function (d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  HR.thaiDate = function (iso) {
    if (!iso) return "-";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1] + "/" + (Number(p[0]) + 543);
  };
  HR.monthsBetween = function (from, to) {
    var a = new Date(from), b = new Date(to);
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(m, 0);
  };
  HR.tenureText = function (m) { return (m >= 12 ? Math.floor(m / 12) + " ปี " : "") + (m % 12) + " เดือน"; };

  /* ---------- สิทธิ์ลา (ต้องตรงกับ _leave_quota ใน leave_types.sql) ---------- */
  HR.typeQuota = function (t, gender, months) {
    if (!t) return null;
    if (t.gender !== "all" && t.gender !== gender) return null;
    if (t.quota_mode === "tenure") {
      var q = 0;
      (t.tenure_tiers || []).slice().sort(function (a, b) { return a.min_months - b.min_months; })
        .forEach(function (x) { if (months >= x.min_months) q = Number(x.days); });
      return q;
    }
    return Number(t.quota_days || 0);
  };

  /* ---------- ดึงข้อมูลทีละหน้า (Supabase ตัดผลลัพธ์ที่ 1,000 แถวโดยปริยาย) ----------
   * factory ต้องสร้าง query ใหม่ทุกครั้งและมี .order(...) ที่ไม่ซ้ำ เพื่อให้แบ่งหน้าได้ถูกต้อง */
  HR.fetchAll = async function (factory) {
    var size = 1000, from = 0, out = [];
    for (;;) {
      var res = await factory().range(from, from + size - 1);
      if (res.error) throw res.error;
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) out.push(rows[i]);
      if (rows.length < size) break;
      from += size;
      if (from > 500000) break;     // กันวนไม่รู้จบ
    }
    return out;
  };

  HR.loadTypes = async function (sb) {
    var res = await sb.from("leave_types").select("*").order("sort_order").order("created_at");
    var rows = (!res.error && res.data && res.data.length) ? res.data : HR.DEFAULT_TYPES;
    return rows.map(function (t) { return Object.assign({}, t, { key: t.code, hourly: t.hourly_allowed }); });
  };

  var INACTIVE = /(resign|inactive|terminat|quit|retire|ลาออก|พ้นสภาพ|พ้นสถานะ|ไม่ใช้งาน|เลิกจ้าง)/i;
  HR.isInactive = function (e) { return !!e.status && INACTIVE.test(String(e.status)); };

  HR.normEmp = function (r) {
    var code = String(r.employee_code);
    var name = r.full_name || code;
    var m = String(name).match(/^\s*(นางสาว|น\.ส\.|นส\.|นาย|นาง)/);
    var p = m ? m[1] : "";
    var gender = p === "นาย" ? "M" : (p === "นางสาว" || p === "น.ส." || p === "นส." || p === "นาง") ? "F" : null;
    return { code: code, name: name, gender: gender, dept: r.department_code || "", hire: r.hire_date || null, status: r.status || "" };
  };

  HR.loadEmployees = async function (sb) {
    var rows = await HR.fetchAll(function () { return sb.from("employees").select("*").order("employee_code"); });
    var list = rows.map(HR.normEmp);
    var byCode = {};
    list.forEach(function (e) { byCode[e.code] = e; });
    return { list: list, byCode: byCode };
  };

  // ชื่อฝ่าย: ถ้าอ่านตารางไม่ได้ (RLS) จะได้แผนที่ว่าง แล้วหน้าเว็บแสดงรหัสฝ่ายแทน
  HR.loadDepartments = async function (sb) {
    var res = await sb.from("departments").select("*");
    var map = {};
    if (!res.error && res.data) res.data.forEach(function (d) { if (d.department_code != null) map[String(d.department_code)] = d.name || String(d.department_code); });
    return { map: map, ok: !res.error };
  };

  HR.loadLeaves = function (sb, o) {
    o = o || {};
    return HR.fetchAll(function () {
      var q = sb.from("leave_requests").select("*").order("id");
      if (o.startFrom) q = q.gte("start_date", o.startFrom);
      if (o.startTo) q = q.lte("start_date", o.startTo);
      if (o.endFrom) q = q.gte("end_date", o.endFrom);
      if (o.status) q = q.in("status", o.status);
      return q;
    });
  };

  HR.mergeById = function () {
    var seen = {}, out = [];
    for (var a = 0; a < arguments.length; a++) {
      arguments[a].forEach(function (r) { if (!seen[r.id]) { seen[r.id] = 1; out.push(r); } });
    }
    return out;
  };

  /* ---------- CSV (เปิดใน Excel ได้ภาษาไทย: UTF-8 + BOM) ---------- */
  HR.csvCell = function (v) {
    if (v == null) return "";
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // กัน CSV/formula injection จากข้อความที่ผู้ใช้พิมพ์
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  HR.toCSV = function (headers, rows) {
    var lines = [headers.map(HR.csvCell).join(",")];
    rows.forEach(function (r) { lines.push(r.map(HR.csvCell).join(",")); });
    return "﻿" + lines.join("\r\n");
  };
  HR.download = function (filename, text) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  window.HR = HR;
})();
