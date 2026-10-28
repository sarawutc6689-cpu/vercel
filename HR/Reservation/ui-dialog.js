/* ---- uiDialog: แทน alert()/confirm() ของเบราว์เซอร์ ---- */
(function () {
  const css = `
  .uid-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100000;font-family:'Sarabun',sans-serif}
  .uid-box{background:#fff;border-radius:20px;padding:28px;width:90%;max-width:380px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.15);animation:uidin .15s ease-out}
  @keyframes uidin{from{transform:scale(.92);opacity:0}to{transform:none;opacity:1}}
  .uid-ic{font-size:46px;margin-bottom:10px}.uid-ic.success{color:#059669}.uid-ic.error{color:#dc2626}.uid-ic.warn{color:#d97706}
  .uid-msg{color:#1e293b;font-size:16px;line-height:1.5;margin-bottom:20px;white-space:pre-line}
  .uid-btns{display:flex;gap:10px;justify-content:center}
  .uid-btn{flex:1;padding:10px 18px;border:none;border-radius:40px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}
  .uid-ok{background:linear-gradient(135deg,#2563eb,#1e4b8a);color:#fff}.uid-ok.danger{background:linear-gradient(135deg,#ef4444,#b91c1c)}
  .uid-cancel{background:#eef2f6;color:#475569}`;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warn: 'fa-exclamation-triangle' };
  function open(msg, type, buttons) {
    return new Promise(resolve => {
      if (!document.getElementById('uid-style')) {
        const s = document.createElement('style'); s.id = 'uid-style'; s.textContent = css; document.head.appendChild(s);
      }
      const ov = document.createElement('div'); ov.className = 'uid-ov';
      const box = document.createElement('div'); box.className = 'uid-box';
      box.innerHTML = `<div class="uid-ic ${type}"><i class="fas ${icons[type] || icons.warn}"></i></div><div class="uid-msg"></div><div class="uid-btns"></div>`;
      box.querySelector('.uid-msg').textContent = msg;            // textContent กัน XSS
      const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
      buttons.forEach(b => {
        const el = document.createElement('button'); el.className = 'uid-btn ' + b.cls; el.textContent = b.text;
        el.onclick = () => done(b.value); box.querySelector('.uid-btns').appendChild(el);
      });
      ov.appendChild(box); document.body.appendChild(ov); document.addEventListener('keydown', onKey);
      box.querySelector('.uid-ok').focus();
    });
  }
  window.uiDialog = {
    alert: (msg, type = 'success') => open(msg, type, [{ text: 'ตกลง', cls: 'uid-ok', value: true }]),
    confirm: (msg, o = {}) => open(msg, 'warn', [
      { text: o.cancelText || 'ยกเลิก', cls: 'uid-cancel', value: false },
      { text: o.okText || 'ตกลง', cls: 'uid-ok' + (o.danger ? ' danger' : ''), value: true }])
  };
})();
