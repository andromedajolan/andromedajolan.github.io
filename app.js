(() => {
  'use strict';
  const APP_VERSION = '1.0.0'; // keep in sync with VERSION in sw.js
  const KEY_THEME = 'studio.theme'; // shared suite key; the only non-ianua key this app touches
  const KEY_LAST = 'ianua.last';
  const KEY_SPLASH = 'ianua.splashSeen';
  const THEMES = ['dark', 'gray', 'light'];
  const LABELS = { dark: 'Dark', gray: 'Gray', light: 'Light' };

  const store = (area) => ({
    get(k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[area].setItem(k, v); } catch (e) {} }
  });
  const ls = store('localStorage'), ss = store('sessionStorage');
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // Theme
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = 'dark';
    root.dataset.theme = t;
    $('btn-theme').textContent = LABELS[t];
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  }
  const saved = ls.get(KEY_THEME);
  applyTheme(THEMES.includes(saved) ? saved : 'dark'); // absent key: look dark, write nothing
  $('btn-theme').addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length];
    ls.set(KEY_THEME, next);
    applyTheme(next);
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY_THEME && THEMES.includes(e.newValue)) applyTheme(e.newValue); });

  // Splash: static, once per session, any tap or key skips it
  const splash = $('splash');
  let splashTimer;
  let splashActive = !root.classList.contains('nosplash');
  function hideSplash() {
    splashActive = false;
    clearTimeout(splashTimer);
    ss.set(KEY_SPLASH, '1');
    splash.classList.add('gone');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }
  if (splashActive) {
    splashTimer = setTimeout(hideSplash, 1700);
    splash.addEventListener('pointerdown', hideSplash);
    window.addEventListener('keydown', (e) => { if (splashActive) { e.preventDefault(); e.stopPropagation(); hideSplash(); } }, true);
  }

  // Cards
  let apps = [];
  function cardEl(a) {
    const li = document.createElement('li');
    const live = a.status === 'live';
    let el;
    if (a.kind === 'link') {
      el = document.createElement('a');
      el.className = 'card link';
      el.href = a.url; el.target = '_blank'; el.rel = 'noopener noreferrer';
    } else if (live) {
      el = document.createElement('a');
      el.className = 'card';
      el.href = a.path;
      el.dataset.id = a.id;
    } else {
      el = document.createElement('div');
      el.className = 'card soon';
      el.setAttribute('aria-disabled', 'true');
    }
    el.style.setProperty('--accent', a.accent || '#f3b962');
    if (a.kind === 'link') {
      const g = document.createElement('span'); g.className = 'glyph'; g.setAttribute('aria-hidden', 'true'); g.textContent = '↗';
      el.appendChild(g);
    } else {
      const img = document.createElement('img');
      img.className = 'icon'; img.src = a.icon; img.alt = ''; img.width = 80; img.height = 80;
      if (a.icon192) img.srcset = a.icon + ' 1x, ' + a.icon192 + ' 2x';
      el.appendChild(img);
    }
    const name = document.createElement('span'); name.className = 'name'; name.textContent = a.name;
    const desc = document.createElement('span'); desc.className = 'desc'; desc.textContent = a.description || '';
    const stat = document.createElement('span'); stat.className = 'stat'; stat.dataset.stat = a.id;
    stat.textContent = a.kind === 'link' ? 'Opens in a new tab' : (live ? '' : 'Coming soon');
    el.append(name, desc, stat);
    if (a.kind === 'app' && a.n) {
      const k = document.createElement('span'); k.className = 'key'; k.setAttribute('aria-hidden', 'true'); k.textContent = a.n;
      el.appendChild(k);
    }
    li.appendChild(el);
    return li;
  }

  function render(reg) {
    apps = (reg.apps || []).slice().sort((x, y) => x.order - y.order);
    let n = 0;
    apps.forEach((a) => { if (a.kind === 'app') a.n = ++n; });
    const main = $('cards'), side = $('side');
    main.textContent = ''; side.textContent = '';
    apps.forEach((a) => (a.group === 'side' ? side : main).appendChild(cardEl(a)));
    document.querySelector('.side').hidden = !side.children.length;
  }

  async function loadRegistry() {
    try {
      const r = await fetch('registry.json');
      render(await r.json());
    } catch (e) {
      const m = $('msg'); m.hidden = false; m.textContent = 'The app list could not be loaded. Reload once to try again.';
    }
  }

  // Remember the last app opened (used by the recent-work strip in the next stage)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a.card[data-id]');
    if (a) ls.set(KEY_LAST, JSON.stringify({ id: a.dataset.id, at: new Date().toISOString() }));
  });

  // Keyboard: arrows between cards, Enter opens (native on links), 1-5 open apps
  function focusables() { return Array.from(document.querySelectorAll('a.card')); }
  function move(dir) {
    const list = focusables();
    if (!list.length) return;
    const cur = list.indexOf(document.activeElement);
    if (cur < 0) { list[0].focus(); return; }
    const c = list[cur].getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, bestScore = Infinity;
    list.forEach((el, i) => {
      if (i === cur) return;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
      const across = (dir === 'ArrowRight' || dir === 'ArrowLeft') ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) return;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) best.focus();
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || splashActive) return;
    if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) { e.preventDefault(); move(e.key); return; }
    if (/^[1-9]$/.test(e.key)) {
      const a = apps.find((x) => x.kind === 'app' && x.n === Number(e.key));
      if (a && a.status === 'live') { ls.set(KEY_LAST, JSON.stringify({ id: a.id, at: new Date().toISOString() })); location.href = a.path; }
    }
  });

  // Install button (hidden unless the browser offers install and the app isn't installed)
  let deferred = null;
  const ib = $('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    if (!matchMedia('(display-mode: standalone)').matches) ib.hidden = false;
  });
  window.addEventListener('appinstalled', () => { deferred = null; ib.hidden = true; });
  ib.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null; ib.hidden = true;
  });

  // Small housekeeping
  $('ver').textContent = 'v' + APP_VERSION;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: '/' }).catch(() => {}); });
  }
  loadRegistry();
})();
