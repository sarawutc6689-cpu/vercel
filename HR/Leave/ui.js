/* ui.js — กล่องยืนยัน/แจ้งเตือนแบบสวยงาม ใช้แทน confirm() / alert() ของเบราว์เซอร์
 *
 *   if (await uiConfirm({ title:"ส่งใบลา", message:"ตรวจสอบก่อนส่ง", rows:[["ประเภท","ลาพักร้อน"]], okText:"ส่งใบลา", tone:"primary" })) { ... }
 *   await uiAlert({ title:"บันทึกไม่สำเร็จ", message:"...", tone:"error" });
 *
 * tone: primary (ฟ้า) | success (เขียว) | danger (แดง) | warn (เหลือง) | error (แดง) | info (ฟ้า)
 * ใช้สีจากตัวแปร CSS ของหน้า (--text, --muted, --line) ถ้ามี
 */
(function () {
  if (window.uiConfirm) return;

  var TONES = {
    primary: { c: "#1d6fd8", b: "#dbeafe", i: "q" },
    info:    { c: "#1d6fd8", b: "#dbeafe", i: "i" },
    success: { c: "#16a34a", b: "#dcfce7", i: "ok" },
    danger:  { c: "#dc2626", b: "#fee2e2", i: "warn" },
    warn:    { c: "#d97706", b: "#fef3c7", i: "warn" },
    error:   { c: "#dc2626", b: "#fee2e2", i: "x" }
  };
  var S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var ICONS = {
    q:    '<svg ' + S + '><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/></svg>',
    i:    '<svg ' + S + '><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    ok:   '<svg ' + S + '><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
    warn: '<svg ' + S + '><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    x:    '<svg ' + S + '><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
  };

  var css = [
    ".ui-ov{position:fixed;inset:0;z-index:99999;background:rgba(15,35,70,.45);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .16s ease}",
    ".ui-ov.in{opacity:1}",
    ".ui-md{background:#fff;color:var(--text,#1e3a5f);border-radius:16px;width:min(100%,400px);max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 24px 60px rgba(15,35,70,.32);transform:translateY(10px) scale(.97);transition:transform .16s ease;font-family:inherit}",
    ".ui-ov.in .ui-md{transform:none}",
    ".ui-bar{height:5px;background:var(--uc)}",
    ".ui-bd{padding:22px 22px 6px;text-align:center}",
    ".ui-ic{width:54px;height:54px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:var(--ub);color:var(--uc)}",
    ".ui-ic svg{width:28px;height:28px}",
    ".ui-t{font-size:18px;font-weight:700;margin:0 0 6px;line-height:1.35}",
    ".ui-m{font-size:14px;color:var(--muted,#5b7391);white-space:pre-line;line-height:1.55;word-break:break-word}",
    ".ui-rows{margin:14px 0 0;background:#f3f8fe;border:1px solid var(--line,#d6e4f5);border-radius:10px;padding:6px 12px;text-align:left;font-size:14px}",
    ".ui-r{display:flex;justify-content:space-between;gap:14px;padding:7px 0}",
    ".ui-r+.ui-r{border-top:1px dashed var(--line,#d6e4f5)}",
    ".ui-r>span:first-child{color:var(--muted,#5b7391);flex:none}",
    ".ui-r>span:last-child{font-weight:600;text-align:right;word-break:break-word}",
    ".ui-ft{display:flex;gap:10px;padding:18px 22px 22px}",
    ".ui-ft button{flex:1;font:inherit;font-size:15px;line-height:1.2;padding:11px 14px;border-radius:10px;cursor:pointer;border:1px solid var(--line,#d6e4f5);background:#fff;color:var(--text,#1e3a5f);transition:filter .12s,background .12s}",
    ".ui-ft button:hover{background:#f3f8fe}",
    ".ui-ft button.ui-ok{background:var(--uc);border-color:var(--uc);color:#fff;font-weight:600}",
    ".ui-ft button.ui-ok:hover{background:var(--uc);filter:brightness(1.08)}",
    ".ui-ft button:focus-visible{outline:3px solid rgba(29,111,216,.45);outline-offset:2px}",
    "@media (max-width:360px){.ui-ft{flex-direction:column-reverse}}",
    "@media (prefers-reduced-motion:reduce){.ui-ov,.ui-md{transition:none}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var chain = Promise.resolve();   // เปิดทีละกล่อง ถ้าเรียกซ้อนจะรอคิว
  var uid = 0;

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function show(o) {
    return new Promise(function (resolve) {
      var tone = TONES[o.tone] || TONES[o.confirm ? "primary" : "info"];
      var id = "ui-" + (++uid);
      var prev = document.activeElement;
      var prevOverflow = document.body.style.overflow;

      var ov = mk("div", "ui-ov");
      ov.style.setProperty("--uc", tone.c);
      ov.style.setProperty("--ub", tone.b);
      var md = mk("div", "ui-md");
      md.setAttribute("role", o.confirm ? "alertdialog" : "dialog");
      md.setAttribute("aria-modal", "true");
      md.setAttribute("aria-labelledby", id + "-t");
      if (o.message) md.setAttribute("aria-describedby", id + "-m");

      md.appendChild(mk("div", "ui-bar"));
      var bd = mk("div", "ui-bd");
      var ic = mk("div", "ui-ic");
      ic.innerHTML = ICONS[tone.i];
      bd.appendChild(ic);
      var t = mk("h2", "ui-t", o.title || (o.confirm ? "ยืนยันการทำรายการ" : "แจ้งเตือน"));
      t.id = id + "-t";
      bd.appendChild(t);
      if (o.message) {
        var m = mk("div", "ui-m", o.message);
        m.id = id + "-m";
        bd.appendChild(m);
      }
      if (o.rows && o.rows.length) {
        var box = mk("div", "ui-rows");
        o.rows.forEach(function (r) {
          if (!r || r[1] == null || r[1] === "") return;
          var row = mk("div", "ui-r");
          row.appendChild(mk("span", null, r[0]));
          row.appendChild(mk("span", null, r[1]));
          box.appendChild(row);
        });
        bd.appendChild(box);
      }
      md.appendChild(bd);

      var ft = mk("div", "ui-ft");
      var cancel = null;
      if (o.confirm) {
        cancel = mk("button", null, o.cancelText || "ยกเลิก");
        cancel.type = "button";
        ft.appendChild(cancel);
      }
      var ok = mk("button", "ui-ok", o.okText || (o.confirm ? "ยืนยัน" : "ตกลง"));
      ok.type = "button";
      ft.appendChild(ok);
      md.appendChild(ft);
      ov.appendChild(md);

      var closed = false;
      function close(v) {
        if (closed) return;
        closed = true;
        document.removeEventListener("keydown", onKey, true);
        ov.classList.remove("in");
        document.body.style.overflow = prevOverflow;
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 170);
        try { if (prev && prev.focus) prev.focus(); } catch (e) {}
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(o.confirm ? false : true); }
        else if (e.key === "Tab") {
          var els = cancel ? [cancel, ok] : [ok];
          var i = els.indexOf(document.activeElement);
          e.preventDefault();
          els[(i + (e.shiftKey ? els.length - 1 : 1)) % els.length].focus();
        }
      }
      ok.onclick = function () { close(true); };
      if (cancel) cancel.onclick = function () { close(false); };
      ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(o.confirm ? false : true); });
      document.addEventListener("keydown", onKey, true);

      document.body.style.overflow = "hidden";
      document.body.appendChild(ov);
      requestAnimationFrame(function () {
        ov.classList.add("in");
        // การกระทำที่ย้อนไม่ได้ (สีแดง/เหลือง) ให้โฟกัสปุ่มยกเลิกก่อน กันกด Enter พลาด
        (cancel && (o.tone === "danger" || o.tone === "warn") ? cancel : ok).focus();
      });
    });
  }

  function queue(o) {
    var p = chain.then(function () { return show(o); });
    chain = p.catch(function () {});
    return p;
  }

  window.uiConfirm = function (o) {
    o = typeof o === "string" ? { message: o } : (o || {});
    o.confirm = true;
    return queue(o);
  };
  window.uiAlert = function (o) {
    o = typeof o === "string" ? { message: o } : (o || {});
    o.confirm = false;
    return queue(o);
  };
})();
