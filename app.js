(() => {
  'use strict';
  const APP_VERSION = '1.1.0'; // keep in sync with VERSION in sw.js
  const KEY_THEME = 'studio.theme'; // shared suite key; the only non-ianua key this app writes
  const KEY_LAST = 'ianua.last';       // {id, at}: last app opened from here
  const KEY_SEEN = 'ianua.seen';       // {appId: version}: version last seen when opened from here
  const KEY_VERS = 'ianua.versions';   // {appId: {v, updated, checked}}: last version each app reported
  const KEY_SPLASH = 'ianua.splashSeen'; // sessionStorage
  const OWN_KEYS = [KEY_LAST, KEY_SEEN, KEY_VERS];
  const THEMES = ['dark', 'gray', 'light'];
  const LABELS = { dark: 'Dark', gray: 'Gray', light: 'Light' };
  const ID_RE = /^[a-z0-9-]{1,32}$/;

  const store = (area) => ({
    get(k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[area].setItem(k, v); } catch (e) {} }
  });
  const ls = store('localStorage'), ss = store('sessionStorage');
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  function readJSON(key) { try { const v = JSON.parse(ls.get(key)); return isObj(v) ? v : null; } catch (e) { return null; } }

  // ---------- Settings: localStorage plus an IndexedDB mirror (ianua-db) so a wiped key can be restored ----------
  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('ianua-db', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => { db.close(); res(q.result); }; q.onerror = () => { db.close(); res(undefined); }; });
    },
    async put(k, v) {
      const db = await this.open();
      return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => { db.close(); res(true); }; t.onerror = () => { db.close(); res(false); }; t.onabort = () => { db.close(); res(false); }; });
    }
  };
  function snapshot() {
    const o = {};
    OWN_KEYS.forEach((k) => { const v = ls.get(k); if (typeof v === 'string') o[k] = v; });
    return o;
  }
  let mirrorTimer = null;
  function mirrorNow() { clearTimeout(mirrorTimer); mirrorTimer = null; try { idb.put('settings', snapshot()).catch(() => {}); } catch (e) {} }
  function setSetting(key, value) { ls.set(key, value); clearTimeout(mirrorTimer); mirrorTimer = setTimeout(mirrorNow, 300); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && mirrorTimer) mirrorNow(); });
  window.addEventListener('pagehide', () => { if (mirrorTimer) mirrorNow(); });
  async function restoreSettings() {
    try {
      const snap = await Promise.race([idb.get('settings'), new Promise((r) => setTimeout(() => r(null), 1200))]);
      if (isObj(snap)) OWN_KEYS.forEach((k) => { if (ls.get(k) == null && typeof snap[k] === 'string') ls.set(k, snap[k]); });
      if (OWN_KEYS.some((k) => ls.get(k) != null)) mirrorNow(); // resync the mirror on every load, in case a pagehide write was cut short
    } catch (e) {}
  }

  // ---------- Theme ----------
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = 'dark';
    root.dataset.theme = t;
    $('btn-theme').textContent = LABELS[t];
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  }
  const savedTheme = ls.get(KEY_THEME);
  applyTheme(THEMES.includes(savedTheme) ? savedTheme : 'dark'); // absent key: look dark, write nothing
  $('btn-theme').addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length];
    ls.set(KEY_THEME, next);
    applyTheme(next);
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY_THEME && THEMES.includes(e.newValue)) applyTheme(e.newValue); });

  // ---------- Splash: about 2.1s, once per session, any tap or key skips; reduced motion skips it entirely ----------
  const splash = $('splash');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let splashActive = !root.classList.contains('nosplash') && !reduced;
  let splashTimer;
  function hideSplash() {
    if (!splashActive) return;
    splashActive = false;
    clearTimeout(splashTimer);
    ss.set(KEY_SPLASH, '1');
    root.classList.add('skip');
    splash.classList.add('gone');
    setTimeout(() => { splash.style.display = 'none'; }, 300);
  }
  if (splashActive) {
    ss.set(KEY_SPLASH, '1'); // a reload mid-splash must not replay it
    splashTimer = setTimeout(() => { splashActive = false; ss.set(KEY_SPLASH, '1'); splash.style.display = 'none'; }, 2300);
    splash.addEventListener('pointerdown', hideSplash);
    window.addEventListener('keydown', (e) => { if (splashActive) { e.preventDefault(); e.stopPropagation(); hideSplash(); } }, true);
  } else {
    ss.set(KEY_SPLASH, '1');
  }

  // ---------- Registry and cards ----------
  let apps = [];
  const live = (a) => a.kind === 'app' && a.status === 'live';
  function cardEl(a) {
    const li = document.createElement('li');
    const isLive = a.status === 'live';
    let el;
    if (a.kind === 'link') {
      el = document.createElement('a');
      el.className = 'card link';
      el.href = a.url; el.target = '_blank'; el.rel = 'noopener noreferrer';
    } else if (isLive) {
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
    stat.textContent = a.kind === 'link' ? 'Opens in a new tab' : (isLive ? '' : 'Coming soon');
    el.append(name, desc, stat);
    if (a.kind === 'app' && a.n) {
      const k = document.createElement('span'); k.className = 'key'; k.setAttribute('aria-hidden', 'true'); k.textContent = a.n;
      el.appendChild(k);
    }
    li.appendChild(el);
    return li;
  }
  function render(reg) {
    apps = (Array.isArray(reg.apps) ? reg.apps : []).filter((a) => isObj(a) && ID_RE.test(a.id)).sort((x, y) => x.order - y.order);
    let n = 0;
    apps.forEach((a) => { if (a.kind === 'app') a.n = ++n; });
    const main = $('cards'), side = $('side');
    main.textContent = ''; side.textContent = '';
    apps.forEach((a) => (a.group === 'side' ? side : main).appendChild(cardEl(a)));
    document.querySelector('.side').hidden = !side.children.length;
  }

  // ---------- Update status (suite-app.json, optional; every failure is silent) ----------
  function cmpVer(a, b) {
    const pa = String(a).split('.').map((x) => parseInt(x, 10)), pb = String(b).split('.').map((x) => parseInt(x, 10));
    if (pa.concat(pb).some((x) => Number.isNaN(x))) return 0;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  function paintStatus() {
    const vers = readJSON(KEY_VERS) || {}, seen = readJSON(KEY_SEEN) || {};
    apps.filter(live).forEach((a) => {
      const el = document.querySelector('[data-stat="' + a.id + '"]');
      if (!el) return;
      el.textContent = '';
      const v = isObj(vers[a.id]) ? str(vers[a.id].v, 24) : '';
      if (!v) return;
      el.append('v' + v);
      if (seen[a.id] && cmpVer(v, seen[a.id]) > 0) {
        const u = document.createElement('span'); u.className = 'upd'; u.textContent = ' · update available';
        el.appendChild(u);
      }
    });
  }
  async function fetchOne(a) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(a.path + 'suite-app.json', { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      if (!isObj(j) || j.schema !== 1 || j.id !== a.id || typeof j.version !== 'string' || !/^[0-9][0-9A-Za-z.+-]{0,23}$/.test(j.version)) return null;
      return { v: j.version, updated: str(j.updated, 40) };
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  async function checkUpdates() {
    if (!navigator.onLine) return;
    const targets = apps.filter(live);
    const results = await Promise.all(targets.map(fetchOne));
    let changed = false;
    const vers = readJSON(KEY_VERS) || {}, seen = readJSON(KEY_SEEN) || {};
    targets.forEach((a, i) => {
      const res = results[i];
      if (!res) return;
      vers[a.id] = { v: res.v, updated: res.updated, checked: new Date().toISOString() };
      if (!seen[a.id]) seen[a.id] = res.v; // first sight sets the baseline silently
      changed = true;
    });
    if (changed) { setSetting(KEY_VERS, JSON.stringify(vers)); setSetting(KEY_SEEN, JSON.stringify(seen)); paintStatus(); }
  }
  function markSeen(id) {
    const vers = readJSON(KEY_VERS) || {}, seen = readJSON(KEY_SEEN) || {};
    if (isObj(vers[id]) && vers[id].v) { seen[id] = str(vers[id].v, 24); setSetting(KEY_SEEN, JSON.stringify(seen)); }
  }
  function noteOpened(id) {
    setSetting(KEY_LAST, JSON.stringify({ id, at: new Date().toISOString() }));
    markSeen(id);
  }

  // ---------- Recent work strip (reads only <prefix>.summary keys named in the registry, read-only) ----------
  function readSummary(a) {
    if (!a.summaryKey || !/^[a-z0-9.-]{1,40}\.summary$/i.test(a.summaryKey)) return null;
    try {
      const s = JSON.parse(localStorage.getItem(a.summaryKey));
      if (!isObj(s) || s.schema !== 1 || s.appId !== a.id) return null;
      const t = Date.parse(s.lastOpened);
      const recent = Array.isArray(s.recent) ? s.recent.filter((r) => isObj(r) && typeof r.title === 'string' && r.title.trim()) : [];
      const top = recent[0] ? { title: str(recent[0].title.trim(), 80), updated: Date.parse(recent[0].updated) } : null;
      return { opened: Number.isNaN(t) ? 0 : t, top };
    } catch (e) { return null; }
  }
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) { const h = Math.round(s / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    if (s < 172800) return 'yesterday';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' days ago';
    return new Date(ms).toLocaleDateString();
  }
  function paintStrip() {
    const strip = $('strip');
    try {
      const last = readJSON(KEY_LAST);
      let best = null;
      apps.filter(live).forEach((a) => {
        const sum = readSummary(a);
        const own = last && last.id === a.id ? Date.parse(last.at) || 0 : 0;
        const t = Math.max(own, sum ? sum.opened : 0);
        if (t > 0 && (!best || t > best.t)) best = { a, t, sum };
      });
      if (!best) { strip.hidden = true; strip.textContent = ''; return; }
      const { a, t, sum } = best;
      const link = document.createElement('a');
      link.className = 'strip-link'; link.href = a.path; link.dataset.id = a.id;
      link.style.setProperty('--accent', a.accent || '#f3b962');
      const img = document.createElement('img'); img.src = a.icon; img.alt = ''; img.width = 44; img.height = 44;
      const text = document.createElement('span'); text.className = 's-text';
      const label = document.createElement('span'); label.className = 's-label'; label.textContent = 'Continue where you left off';
      const main = document.createElement('span'); main.className = 's-main';
      const b = document.createElement('b'); b.textContent = a.name;
      main.appendChild(b);
      const when = sum && sum.top && !Number.isNaN(sum.top.updated) ? sum.top.updated : t;
      if (sum && sum.top) main.append(' · ' + sum.top.title);
      text.append(label, main);
      const w = document.createElement('span'); w.className = 's-when'; w.textContent = ago(when);
      const go = document.createElement('span'); go.className = 's-go'; go.textContent = 'Open →';
      link.append(img, text, w, go);
      strip.textContent = ''; strip.appendChild(link); strip.hidden = false;
    } catch (e) { strip.hidden = true; }
  }

  async function loadRegistry() {
    try {
      const r = await fetch('registry.json');
      render(await r.json());
    } catch (e) {
      const m = $('msg'); m.hidden = false; m.textContent = 'The app list could not be loaded. Reload once to try again.';
      return;
    }
    paintStatus(); paintStrip();
    checkUpdates();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-id]');
    if (a) noteOpened(a.dataset.id);
  });
  window.addEventListener('online', () => { if (apps.length) checkUpdates(); });

  // ---------- Keyboard: arrows between cards, Enter opens (native on links), 1-5 open apps ----------
  function focusables() { return Array.from(document.querySelectorAll('a.card, a.strip-link')); }
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
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) { e.preventDefault(); move(e.key); return; }
    if (/^[1-9]$/.test(e.key)) {
      const a = apps.find((x) => x.kind === 'app' && x.n === Number(e.key));
      if (a && a.status === 'live') { noteOpened(a.id); location.href = a.path; }
    }
  });

  // ---------- Install button (hidden unless the browser offers install and the app isn't installed) ----------
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

  // ---------- Export / import of the launcher's own small settings ----------
  let msgTimer;
  function note(text) {
    const m = $('msg'); m.hidden = false; m.textContent = text;
    clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 6000);
  }
  $('btn-export').addEventListener('click', () => {
    const out = {
      schema: 1, app: 'ianua', version: APP_VERSION, exported: new Date().toISOString(),
      settings: { theme: THEMES.includes(ls.get(KEY_THEME)) ? ls.get(KEY_THEME) : 'dark', last: readJSON(KEY_LAST), seen: readJSON(KEY_SEEN), versions: readJSON(KEY_VERS) }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'ianua-settings.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    note('Settings exported.');
  });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (f.size > 100000) throw new Error('size');
      const j = JSON.parse(await f.text());
      if (!isObj(j) || j.app !== 'ianua' || j.schema !== 1 || !isObj(j.settings)) throw new Error('shape');
      const s = j.settings;
      if (THEMES.includes(s.theme)) { ls.set(KEY_THEME, s.theme); applyTheme(s.theme); }
      if (isObj(s.last) && ID_RE.test(s.last.id) && !Number.isNaN(Date.parse(s.last.at))) setSetting(KEY_LAST, JSON.stringify({ id: s.last.id, at: new Date(s.last.at).toISOString() }));
      if (isObj(s.seen)) {
        const seen = {};
        Object.keys(s.seen).forEach((k) => { if (ID_RE.test(k) && typeof s.seen[k] === 'string') seen[k] = str(s.seen[k], 24); });
        setSetting(KEY_SEEN, JSON.stringify(seen));
      }
      if (isObj(s.versions)) {
        const vers = {};
        Object.keys(s.versions).forEach((k) => {
          const v = s.versions[k];
          if (ID_RE.test(k) && isObj(v) && typeof v.v === 'string') vers[k] = { v: str(v.v, 24), updated: str(v.updated, 40), checked: str(v.checked, 40) };
        });
        setSetting(KEY_VERS, JSON.stringify(vers));
      }
      mirrorNow(); paintStatus(); paintStrip();
      note('Settings imported.');
    } catch (err) {
      note('That file is not an Ianua settings export, so nothing was changed.');
    }
  });

  // ---------- Start ----------
  $('ver').textContent = 'v' + APP_VERSION;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: '/' }).catch(() => {}); });
  }
  restoreSettings().then(loadRegistry);
})();
