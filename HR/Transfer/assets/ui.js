/* ========================================================
   UI Helpers ที่ใช้ร่วมกันทุกหน้า (badge, chip, nav, toast ฯลฯ)
   ต้องเรียก initLookups() ก่อนใช้ deptChipHtml / flowChipHtml
   ======================================================== */

let DEPT_CACHE = new Map();   // id -> department row
let UNIT_CACHE = new Map();   // id -> unit row
let UNITS_BY_DEPT = new Map(); // department_id -> [unit,...]

async function initLookups() {
  const [depts, units] = await Promise.all([db.getDepartments(), db.getUnits()]);
  DEPT_CACHE = new Map(depts.map(d => [d.id, d]));
  UNIT_CACHE = new Map(units.map(u => [u.id, u]));
  UNITS_BY_DEPT = new Map();
  units.forEach(u => {
    if (!UNITS_BY_DEPT.has(u.department_id)) UNITS_BY_DEPT.set(u.department_id, []);
    UNITS_BY_DEPT.get(u.department_id).push(u);
  });
  return { depts, units };
}

const STATUS_LABEL = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธแล้ว',
  returned: 'คืนตัวแล้ว', partially_returned: 'คืนบางส่วน',
  normal: 'ปกติ', on_loan: 'กำลังโอนย้าย', pending_transfer: 'รอดำเนินการ',
};
const STATUS_CLASS = {
  pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected',
  returned: 'badge-returned', partially_returned: 'badge-returned',
  normal: 'badge-normal', on_loan: 'badge-onloan', pending_transfer: 'badge-pending',
};
const ACTION_LABEL = { approved: 'อนุมัติคำขอ', rejected: 'ปฏิเสธคำขอ', returned: 'คืนตัวพนักงาน' };
const ACTION_CLASS = { approved: 'badge-approved', rejected: 'badge-rejected', returned: 'badge-returned' };

function badgeHtml(status) {
  return `<span class="badge ${STATUS_CLASS[status] || 'badge-normal'}">${STATUS_LABEL[status] || status}</span>`;
}

function deptChipHtml(deptId) {
  const d = DEPT_CACHE.get(deptId);
  if (!d) return '<span class="cell-muted">-</span>';
  return `<span class="dept-chip"><span class="dept-dot" style="background:${d.color}"></span>${d.name}</span>`;
}

function flowChipHtml(fromDeptId, toDeptId, live) {
  return `<span class="flow-chip ${live ? 'is-live' : ''}">${deptChipHtml(fromDeptId)}<span class="flow-arrow"></span>${deptChipHtml(toDeptId)}</span>`;
}

function unitName(unitId) {
  const u = UNIT_CACHE.get(unitId);
  return u ? u.name : '-';
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysLeft(endDate) {
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(endDate);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
}
function dueBadgeHtml(endDate) {
  const d = daysLeft(endDate);
  if (d < 0) return `<span class="badge badge-rejected">เกินกำหนด ${Math.abs(d)} วัน</span>`;
  if (d <= 3) return `<span class="badge badge-pending">ใกล้ครบกำหนด (${d} วัน)</span>`;
  return `<span class="badge badge-approved">ปกติ (เหลือ ${d} วัน)</span>`;
}

/* ---------------- Toast ---------------- */
function showToast(message, isError) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span class="toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.style.background = isError ? 'var(--color-danger)' : 'var(--color-primary)';
  toast.querySelector('.toast-msg').textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}
function showError(err, fallback) {
  console.error(err);
  showToast((err && err.message) ? err.message : (fallback || 'เกิดข้อผิดพลาด กรุณาลองใหม่'), true);
}

/* ---------------- Loading row ---------------- */
function loadingRowHtml(colspan, label) {
  return `<tr><td colspan="${colspan}" style="text-align:center; padding:40px; color:var(--color-text-muted);">${label || 'กำลังโหลดข้อมูล...'}</td></tr>`;
}

/* ---------------- Export CSV ---------------- */
function exportCsv(filename, headers, rows) {
  const escapeCell = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach(row => lines.push(row.map(escapeCell).join(',')));
  // ใส่ BOM นำหน้า เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง ไม่เพี้ยนเป็นอักขระแปลก
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Sidebar navigation ---------------- */
const NAV_ITEMS = [
  { key: 'request', href: 'request.html', label: 'คำขอยืมพนักงาน',
    icon: '<path d="M9 12h6M9 16h6M9 8h1"/><rect x="4" y="3" width="16" height="18" rx="2"/>' },
  { key: 'manage', href: 'manage-requests.html', label: 'การจัดการคำขอ',
    icon: '<path d="m9 12 2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>' },
  { key: 'return', href: 'return.html', label: 'ขอคืนพนักงาน',
    icon: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v1"/>' },
  { key: 'status', href: 'status.html', label: 'สถานะการโอนย้าย',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' },
  { key: 'history', href: 'history.html', label: 'ประวัติการยืม',
    icon: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>' },
  { key: 'report', href: 'report.html', label: 'รายงาน',
    icon: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>' },
  { key: 'guide', href: 'guide.html', label: 'คู่มือการใช้งาน',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 1.8-2 3.5"/><path d="M12 17h.01"/>' },
  { key: 'admin', href: 'admin-employees.html', label: 'จัดการพนักงาน',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
];

function renderShell(activeKey, opts) {
  opts = opts || {};
  const navHtml = NAV_ITEMS.map(item => `
    <a class="nav-item ${item.key === activeKey ? 'active' : ''}" href="${item.href}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
      ${item.label}
    </a>`).join('');

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-mark">TS</div>
      <div class="sidebar-brand-text"><strong>ระบบโอนย้ายพนักงาน</strong><span>Employee Transfer System</span></div>
    </div>
    <nav>${navHtml}</nav>
    <div class="sidebar-foot" id="sidebar-user">กำลังตรวจสอบการเข้าสู่ระบบ...</div>
  `;

  document.getElementById('topbar').innerHTML = `
    <div>
      <div class="topbar-eyebrow">${opts.eyebrow || ''}</div>
      <h1>${opts.title || ''}</h1>
      <p>${opts.desc || ''}</p>
    </div>
    ${opts.actionsHtml || ''}
  `;
}
