/**
 * ============================================================
 * SHARED-NAV.JS — เมนูกลางของระบบตรวจ 5ส
 * ============================================================
 * วิธีใช้: ใส่บรรทัดนี้ไว้ก่อนปิด </body> ของทุกหน้า
 *   <script src="shared-nav.js"></script>
 *
 * พฤติกรรม:
 * - จอกว้าง (desktop, >768px)  → แสดงเป็น sidebar ถาวรด้านซ้าย
 * - จอแคบ (มือถือ, ≤768px)     → ซ่อนไว้ กดปุ่มหาม (☰) ที่มุมซ้ายบน
 *                                 ของ header เพื่อเปิดเป็นลิ้นชักเลื่อนออกมา
 *
 * แก้เมนู (เพิ่ม/ลบ/เปลี่ยนชื่อ) แก้แค่ตรงนี้ที่เดียว มีผลกับทุกหน้าอัตโนมัติ
 * ============================================================
 */
(function () {
  const NAV_LINKS = [
    { href: "index.html", label: "เมนูหลัก", icon: "🏠" },
    { href: "5s_audit_form.html", label: "ตรวจ 5ส", icon: "📋" },
    { href: "5s_dashboard.html", label: "รายงานผลตรวจ", icon: "📊" },
    { href: "5s_followup.html", label: "ติดตามการแก้ไข", icon: "✅" },
  ];

  const currentFile = (location.pathname.split("/").pop() || "index.html");

  // ------------------------------------------------------------
  // CSS
  // ------------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #shared-sidebar {
      display: none;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 220px;
      background: var(--card, #fff);
      border-right: 1px solid var(--line, #d9dccf);
      padding: 20px 12px;
      z-index: 50;
      overflow-y: auto;
    }
    #shared-sidebar .sidebar-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--ink, #23281f);
      padding: 0 10px 16px;
    }
    #shared-sidebar a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 10px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--ink, #23281f);
      font-size: 14px;
      margin-bottom: 4px;
    }
    #shared-sidebar a.active {
      background: var(--accent-dim, #e7efe4);
      color: var(--accent, #3d6b3f);
      font-weight: 600;
    }

    #shared-hamburger {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      border: 1px solid var(--line, #d9dccf);
      background: var(--card, #fff);
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      z-index: 20;
    }
    header.has-shared-nav { position: relative; padding-left: 56px !important; }

    #shared-drawer-backdrop {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 60;
    }
    #shared-drawer-backdrop.open { display: block; }

    #shared-drawer {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 78%;
      max-width: 280px;
      background: var(--card, #fff);
      z-index: 61;
      padding: 20px 12px;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      overflow-y: auto;
    }
    #shared-drawer.open { transform: translateX(0); }
    #shared-drawer .sidebar-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--ink, #23281f);
      padding: 0 10px 16px;
    }
    #shared-drawer a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 10px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--ink, #23281f);
      font-size: 15px;
      margin-bottom: 4px;
    }
    #shared-drawer a.active {
      background: var(--accent-dim, #e7efe4);
      color: var(--accent, #3d6b3f);
      font-weight: 600;
    }

    @media (min-width: 769px) {
      #shared-sidebar { display: flex; }
      #shared-hamburger { display: none; }
      header.has-shared-nav { padding-left: inherit !important; }
      body { padding-left: 220px; }
    }
  `;
  document.head.appendChild(style);

  // ------------------------------------------------------------
  // สร้างลิงก์เมนู (ใช้ร่วมกันทั้ง sidebar และ drawer)
  // ------------------------------------------------------------
  function buildLinksHtml() {
    return NAV_LINKS.map(link => {
      const isActive = link.href === currentFile;
      return `<a href="${link.href}" class="${isActive ? "active" : ""}">
                <span>${link.icon}</span><span>${link.label}</span>
              </a>`;
    }).join("");
  }

  // ------------------------------------------------------------
  // Sidebar (desktop)
  // ------------------------------------------------------------
  const sidebar = document.createElement("nav");
  sidebar.id = "shared-sidebar";
  sidebar.innerHTML = `<div class="sidebar-title">ระบบตรวจ 5ส</div>${buildLinksHtml()}`;
  document.body.prepend(sidebar);

  // ------------------------------------------------------------
  // Hamburger + Drawer (มือถือ)
  // ------------------------------------------------------------
  const header = document.querySelector("header");
  if (header) {
    header.classList.add("has-shared-nav");
    const hamburger = document.createElement("button");
    hamburger.id = "shared-hamburger";
    hamburger.type = "button";
    hamburger.setAttribute("aria-label", "เปิดเมนู");
    hamburger.textContent = "☰";
    header.prepend(hamburger);
    hamburger.addEventListener("click", () => openDrawer());
  }

  const backdrop = document.createElement("div");
  backdrop.id = "shared-drawer-backdrop";
  document.body.appendChild(backdrop);

  const drawer = document.createElement("nav");
  drawer.id = "shared-drawer";
  drawer.innerHTML = `<div class="sidebar-title">ระบบตรวจ 5ส</div>${buildLinksHtml()}`;
  document.body.appendChild(drawer);

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("open");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  }
  backdrop.addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));
})();
