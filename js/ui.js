/* Habits — UI helpers: escaping, icons, toasts, sheets/dialogs, press-and-hold sorting. */
(function () {
  'use strict';
  const HT = window.HT;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  HT.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  HT.$ = (sel, root) => (root || document).querySelector(sel);
  HT.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ico = (d, extra) =>
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
    (extra || '') + '>' + d + '</svg>';
  HT.icon = {
    today: ico('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>'),
    finance: ico('<path d="M4 20h16M7 16v-4M12 16V9M17 16v-6M4 9l5-4 4 3 7-5"/>'),
    history: ico('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    stats: ico('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
    trackers: ico('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    settings: ico('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    check: ico('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.4"'),
    plus: ico('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.2"'),
    minus: ico('<path d="M5 12h14"/>', ' stroke-width="2.2"'),
    back: ico('<path d="m14.5 5-7 7 7 7"/>'),
    next: ico('<path d="m9.5 5 7 7-7 7"/>'),
    x: ico('<path d="M6 6l12 12M18 6 6 18"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'),
    pause: ico('<path d="M8 5v14M16 5v14"/>'),
    play: ico('<path d="M7 5v14l12-7z"/>'),
    archive: ico('<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2"/><path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>'),
    trash: ico('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12"/>'),
    flame: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.5-1 5-2.5 7C8 11 7 12.5 7 15a5 5 0 0 0 10 0c0-2-1-3.5-2-5-.3 1.2-1 2-2 2.5.5-3.5 0-7-1-10.5z"/></svg>',
  };

  /* ---------- toast ---------- */
  let toastTimer;
  HT.toast = (msg) => {
    const el = HT.$('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  /* ---------- sheets + dialogs ---------- */
  const root = () => HT.$('#overlay-root');

  HT.openSheet = (opts) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay ' + (opts.kind || 'sheet');
    wrap.innerHTML =
      '<div class="backdrop" data-close></div>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-label="' + HT.esc(opts.title) + '">' +
      '<div class="panel-head"><h2>' + HT.esc(opts.title) + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="Close">' + HT.icon.x + '</button></div>' +
      '<div class="panel-body">' + opts.html + '</div>' +
      (opts.footer ? '<div class="panel-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      setTimeout(() => {
        wrap.remove();
        if (!root().children.length) document.documentElement.classList.remove('locked');
      }, 220);
      if (opts.onClose) opts.onClose(result);
    };
    // A sheet that is animating out must not react to a second tap (e.g. a double-tapped Save).
    wrap.addEventListener('click', (e) => { if (closed) e.stopImmediatePropagation(); }, true);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });
    wrap.closeSheet = close;
    root().appendChild(wrap);
    document.documentElement.classList.add('locked');
    wrap.offsetHeight; // start the enter transition from the hidden state
    wrap.classList.add('open');
    if (opts.onMount) opts.onMount(wrap, close);
    return wrap;
  };

  HT.closeTopSheet = () => {
    const open = Array.from(root().children).filter((el) => el.classList.contains('open'));
    const last = open[open.length - 1];
    if (last && last.closeSheet) { last.closeSheet(); return true; }
    return false;
  };

  HT.closeAllSheets = () => {
    Array.from(root().children).forEach((el) => { if (el.closeSheet) el.closeSheet(); });
  };

  HT.confirm = (opts) =>
    new Promise((resolve) => {
      HT.openSheet({
        kind: 'dialog',
        title: opts.title,
        html: '<p class="dialog-msg">' + opts.message + '</p>',
        footer:
          '<button type="button" class="btn" data-close>Cancel</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + HT.esc(opts.confirmLabel || 'OK') + '</button>',
        onMount: (wrap, close) => {
          HT.$('[data-ok]', wrap).addEventListener('click', () => close(true));
        },
        onClose: (result) => resolve(result === true),
      });
    });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') HT.closeTopSheet();
  });

  /* Keep sheets inside the visible area when the on-screen keyboard is open. */
  if (window.visualViewport) {
    const sync = () => {
      const vv = window.visualViewport;
      document.documentElement.style.setProperty('--vvh', vv.height + 'px');
      document.documentElement.style.setProperty('--vvt', vv.offsetTop + 'px');
    };
    window.visualViewport.addEventListener('resize', sync);
    window.visualViewport.addEventListener('scroll', sync);
    sync();
  }
  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches('.overlay input, .overlay select, .overlay textarea')) {
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
    }
  });

  /* ---------- press-and-hold sorting ----------
     Any element with [data-sortable] gets reorderable children. Touch: hold ~0.4s, then drag.
     Mouse: just drag. When a drag ends the list fires a "sorted" event with detail.ids. */
  let press = null, drag = null, pressTimer = null, raf = 0, lastDragEnd = 0;

  HT.justDragged = () => Date.now() - lastDragEnd < 400;

  function cancelPress() {
    clearTimeout(pressTimer);
    press = null;
  }

  function startDrag() {
    if (!press) return;
    const item = press.item;
    drag = { item, list: item.parentNode, id: press.id, startPageY: press.y + window.scrollY, lastY: press.y };
    press = null;
    clearTimeout(pressTimer);
    item.classList.add('dragging');
    document.documentElement.classList.add('is-dragging');
    try { item.setPointerCapture(drag.id); } catch (err) { /* pointer already gone */ }
    if (navigator.vibrate) navigator.vibrate(12);
    const loop = () => {
      if (!drag) return;
      const edge = 90;
      if (drag.lastY < edge) window.scrollBy(0, -9);
      else if (drag.lastY > window.innerHeight - edge - 40) window.scrollBy(0, 9);
      updateDrag();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function swap(sib, after) {
    const item = drag.item;
    const before = item.offsetTop;
    const sibBefore = sib.getBoundingClientRect().top;
    if (after) drag.list.insertBefore(sib, item);
    else drag.list.insertBefore(item, sib);
    drag.startPageY += item.offsetTop - before;
    const sibAfter = sib.getBoundingClientRect().top;
    sib.style.transition = 'none';
    sib.style.transform = 'translateY(' + (sibBefore - sibAfter) + 'px)';
    sib.offsetHeight;
    sib.style.transition = 'transform .18s ease';
    sib.style.transform = '';
  }

  function updateDrag() {
    const item = drag.item;
    const place = () => {
      item.style.transform = 'translateY(' + (drag.lastY + window.scrollY - drag.startPageY) + 'px) scale(1.02)';
    };
    place();
    const r = item.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const next = item.nextElementSibling, prev = item.previousElementSibling;
    if (next) {
      const nr = next.getBoundingClientRect();
      if (mid > nr.top + nr.height / 2) { swap(next, true); place(); return; }
    }
    if (prev) {
      const pr = prev.getBoundingClientRect();
      if (mid < pr.top + pr.height / 2) { swap(prev, false); place(); }
    }
  }

  function endDrag() {
    const d = drag;
    drag = null;
    cancelAnimationFrame(raf);
    lastDragEnd = Date.now();
    d.item.style.transition = 'transform .16s ease';
    d.item.style.transform = '';
    document.documentElement.classList.remove('is-dragging');
    setTimeout(() => {
      d.item.classList.remove('dragging');
      d.item.style.transition = '';
    }, 170);
    const ids = Array.from(d.list.children).map((el) => el.dataset.id).filter(Boolean);
    d.list.dispatchEvent(new CustomEvent('sorted', { bubbles: true, detail: { ids } }));
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button || drag) return;
    const item = e.target.closest('[data-sortable] > [data-id]');
    if (!item || e.target.closest('[data-nodrag]')) return;
    press = { item, x: e.clientX, y: e.clientY, id: e.pointerId, mouse: e.pointerType === 'mouse' };
    clearTimeout(pressTimer);
    if (!press.mouse) pressTimer = setTimeout(startDrag, 380);
  });
  document.addEventListener('pointermove', (e) => {
    if (drag) {
      if (e.pointerId === drag.id) drag.lastY = e.clientY;
      return;
    }
    if (!press || e.pointerId !== press.id) return;
    const moved = Math.abs(e.clientX - press.x) > 7 || Math.abs(e.clientY - press.y) > 7;
    if (!moved) return;
    if (press.mouse) startDrag();
    else cancelPress();
  });
  const release = () => {
    if (drag) endDrag();
    else cancelPress();
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  // Once a drag is active the page must not scroll under the finger.
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (drag || press) e.preventDefault();
  });
})();
