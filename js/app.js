import { Player } from './player.js';

const main = document.getElementById('main');
const top = document.getElementById('top');
const player = new Player();
const A = 'assets/vhub/';
let DB = { families: {}, items: [] };
let cleanup = [];
let viewAbort = new AbortController();

/* ================= utilitaires ================= */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3h4v4l-1.5-1.5-4.2 4.2-1.4-1.4 4.2-4.2zM3 5.4 4.4 4l15.1 15.1 1.5-1.5v4h-4l1.1-1.1zM9.3 13.3l1.4 1.4-6.3 6.3L3 19.6z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m12 7 7 7-1.4 1.4L12 9.8l-5.6 5.6L5 14z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m12 17-7-7 1.4-1.4 5.6 5.6 5.6-5.6L19 10z"/></svg>',
};
const TRI = `<img class="tri" src="${A}play-tri.svg" alt="">`;

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

async function share(title, hash) {
  const url = `${location.origin}${location.pathname}${hash}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${title} — VSound`, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien copié');
  } catch {
    prompt('Copiez ce lien :', url);
  }
}

const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('vsound.' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('vsound.' + k, JSON.stringify(v));
    } catch {}
  },
};

/* ================= données ================= */
// Logos repris de la maquette ; les autres marques s'affichent en toutes lettres.
const BRAND_INFO = {
  'Aston Martin': { country: 'Royaume-Uni' },
  'Alfa Romeo': { country: 'Italie' },
  'Rolls-Royce': { country: 'Royaume-Uni' },
  Mercedes: { country: 'Allemagne', name: 'Mercedes-Benz', logo: 'brand-mercedes.svg', full: true, tile: 'tile-mercedes.svg' },
  Bugatti: { country: 'France', logo: 'brand-bugatti.svg', w: 154, h: 104 },
  Chevrolet: { country: 'États-Unis' },
  Dodge: { country: 'États-Unis', logo: 'tile-dodge-logo.svg', w: 248.13, h: 42.33, tileLogo: true },
  Ferrari: { country: 'Italie', logo: 'brand-ferrari.svg', w: 234, h: 156 },
  Ford: { country: 'États-Unis', logo: 'brand-ford.svg', w: 178, h: 118 },
  Honda: { country: 'Japon' },
  Lamborghini: { country: 'Italie', logo: 'brand-lamborghini.svg', w: 214, h: 142 },
  Lancia: { country: 'Italie' },
  Lexus: { country: 'Japon' },
  Maserati: { country: 'Italie' },
  McLaren: { country: 'Royaume-Uni' },
  Mazda: { country: 'Japon' },
  Nissan: { country: 'Japon', logo: 'brand-nissan.svg', w: 190, h: 126, tile: 'tile-nissan.svg' },
  Porsche: { country: 'Allemagne' },
  Renault: { country: 'France' },
  Shelby: { country: 'États-Unis' },
  Toyota: { country: 'Japon', logo: 'brand-toyota.svg', full: true, tile: 'tile-toyota.svg' },
  BMW: { country: 'Allemagne', logo: 'brand-bmw.svg', w: 110, h: 110, tileLogo: 'tile-bmw-logo.svg' },
  Volkswagen: { country: 'Allemagne' },
  Datsun: { country: 'Japon' },
  Audi: { country: 'Allemagne' },
  Subaru: { country: 'Japon', logo: 'brand-subaru.svg', w: 270, h: 180 },
  Jaguar: { country: 'Royaume-Uni' },
  Morris: { country: 'Royaume-Uni' },
  Peugeot: { country: 'France' },
};
// Profils de l'écran « Choose your driver » (Frame 01 de la maquette)
const PROFILES = [
  { id: 'camille', name: 'Camille' },
  { id: 'maxime', name: 'Maxime' },
  { id: 'amine', name: 'Amine' },
];
const currentProfile = () => PROFILES.find((p) => p.id === store.get('profile', null)) || null;
const followKey = () => 'follow.' + (currentProfile()?.id || 'invite');

function renderUser() {
  const p = currentProfile();
  const a = document.querySelector('.user');
  a.querySelector('span').textContent = p ? p.name : 'Profils';
  const img = a.querySelector('img');
  img.src = p ? `${A}profile-${p.id}.jpg` : `${A}user.png`;
  img.classList.toggle('photo', !!p);
  a.setAttribute('aria-label', p ? `Profil : ${p.name}, changer de profil` : 'Choisir un profil');
}

const COUNTRIES = ['Italie', 'Allemagne', 'Japon', 'États-Unis', 'Royaume-Uni', 'France'];

function igCode(url) {
  const m = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

function prepare(raw) {
  const items = [];
  for (const it of raw.items || []) {
    const base = { brands: [], ...it };
    if (it.type === 'instagram') {
      const code = it.code || igCode(it.url);
      if (code) items.push({ ...base, code, vertical: true, credit: { source: 'Instagram', url: it.url, ...(it.credit || {}) } });
    } else if (it.type === 'youtube' || it.type === 'audio') {
      items.push(base);
    }
  }
  for (const it of items) it.countries = [...new Set(it.brands.map((b) => BRAND_INFO[b]?.country).filter(Boolean))];
  return { families: raw.families || {}, items };
}

const visuals = () => DB.items.filter((i) => i.type !== 'audio');
const sounds = () => DB.items.filter((i) => i.type === 'audio');
const famLabel = (f) => DB.families[f] || f || '';
const typeLabel = (it) => (it.type === 'audio' ? 'Son' : it.type === 'instagram' ? 'Reel' : it.vertical ? 'Short' : 'Vidéo');
const thumbOf = (it) => (it.type === 'youtube' ? `https://i.ytimg.com/vi/${encodeURIComponent(it.videoId)}/hqdefault.jpg` : it.thumb || null);
const shortName = (it) => (it.type === 'audio' ? it.title : it.car && !/compilation|plusieurs/i.test(it.car) ? it.car.split(' · ')[0] : it.title);
const byVideo = (id) => DB.items.find((i) => i.videoId === id);
const byId = (id) => DB.items.find((i) => i.id === id);

function brandList() {
  const m = new Map();
  for (const it of DB.items) for (const b of it.brands) m.set(b, (m.get(b) || 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count, slug: slug(name) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function creatorList(type) {
  const m = new Map();
  for (const it of DB.items) {
    if ((type === 'audio') !== (it.type === 'audio')) continue;
    const a = it.credit?.author;
    if (!a) continue;
    if (!m.has(a)) m.set(a, { name: a, slug: slug(a), items: [] });
    m.get(a).items.push(it);
  }
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/* catégories : architecture, origine, format */
const CAT_PICKS = {
  archi: { V12: 'Awi5LQkRfwA', V10: 'm8mgAXhNNPo', V8: 'r0ivLc0rj_I', Flat: 'Ca5o7RW2SlA', Rotary: 'sxXtpMngivM', Exotic: 'Ilbjr5aYCTQ' },
  pays: { Italie: 'eAAvR1U56K8', Allemagne: 'xA9Jm7_jNz8', Japon: 'sxXtpMngivM', 'États-Unis': 'ford-gt40-1965', 'Royaume-Uni': 'aston-martin-one-77', France: 'Ilbjr5aYCTQ' },
  format: { videos: 'AWLFN0o2sl8', shorts: 'Lp394JR8uMo', sons: 'ferrari-f12-berlinetta' },
};
function categoryGroups() {
  const fams = Object.keys(DB.families).map((f) => ({ key: f, label: famLabel(f), items: DB.items.filter((i) => i.family === f) }));
  const pays = COUNTRIES.map((c) => ({ key: c, label: c, items: DB.items.filter((i) => i.countries.includes(c)) }));
  const formats = [
    { key: 'videos', label: 'Vidéos', items: DB.items.filter((i) => i.type === 'youtube' && !i.vertical) },
    { key: 'shorts', label: 'Shorts', items: DB.items.filter((i) => i.type === 'youtube' && i.vertical) },
    { key: 'reels', label: 'Reels', items: DB.items.filter((i) => i.type === 'instagram') },
    { key: 'sons', label: 'Sons', items: sounds() },
  ];
  return [
    { type: 'archi', label: 'Architecture', cats: fams },
    { type: 'pays', label: 'Origine', cats: pays },
    { type: 'format', label: 'Format', cats: formats },
  ].map((g) => ({ ...g, cats: g.cats.filter((c) => c.items.length) }));
}
function catCover(type, cat) {
  const pick = CAT_PICKS[type]?.[cat.key];
  const it = (pick && (byVideo(pick) || byId(pick))) || cat.items.find((i) => i.type === 'youtube') || cat.items.find((i) => thumbOf(i));
  return it ? thumbOf(it) : null;
}

/* ================= fragments ================= */
function cardHTML({ href, img, label, tag }) {
  const media = img
    ? `<img src="${esc(img)}" alt="" loading="lazy">`
    : `<div class="card-fallback"><span>${esc(label)}</span></div>`;
  return `<a class="card" href="${esc(href)}">${media}${tag ? `<span class="card-tag">${esc(tag)}</span>` : ''}<span class="card-label${label.length > 15 ? ' long' : ''}">${esc(label)}</span></a>`;
}
const itemCard = (it, withTag = true) => cardHTML({ href: `#/s/${it.id}`, img: thumbOf(it), label: shortName(it), tag: withTag ? typeLabel(it) : '' });

function rowHTML(label, cards, href) {
  return `<section class="row">
    <h2 class="row-label">${href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)}</h2>
    <div class="row-view">
      <button class="chev prev" aria-label="Précédents"><img src="${A}chevron-right.svg" alt=""></button>
      <div class="row-track">${cards.join('')}</div>
      <button class="chev next" aria-label="Suivants"><img src="${A}chevron-right.svg" alt=""></button>
    </div>
  </section>`;
}

function bindRows(root) {
  const update = (view) => {
    const t = view.querySelector('.row-track');
    view.querySelector('.prev').disabled = t.scrollLeft <= 2;
    view.querySelector('.next').disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
  };
  for (const view of root.querySelectorAll('.row-view')) {
    const t = view.querySelector('.row-track');
    t.addEventListener('scroll', () => update(view), { passive: true, signal: viewAbort.signal });
    update(view);
  }
  root.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('.chev');
      if (!b) return;
      const t = b.parentElement.querySelector('.row-track');
      const step = t.querySelector(':scope > *')?.getBoundingClientRect().width || 300;
      const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
      const n = Math.max(1, Math.floor((t.clientWidth + gap) / (step + gap)));
      t.scrollBy({ left: (b.classList.contains('next') ? 1 : -1) * n * (step + gap), behavior: 'smooth' });
    },
    { signal: viewAbort.signal },
  );
  addEventListener('resize', () => root.querySelectorAll('.row-view').forEach(update), { signal: viewAbort.signal });
}

function searchHTML(value, placeholder) {
  return `<form class="search-c" role="search" data-search>
    <input type="search" name="q" placeholder="${esc(placeholder)}" value="${esc(value || '')}" aria-label="${esc(placeholder)}" autocomplete="off">
    <button type="submit" aria-label="Rechercher"><img src="${A}search-box-icon.svg" alt=""></button>
  </form>`;
}
// Le champ de recherche des en-têtes de page renvoie vers la page de recherche.
function bindSearchForms(root, onInput) {
  for (const f of root.querySelectorAll('[data-search]')) {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = f.q.value.trim();
      if (onInput) onInput(q);
      else location.hash = `#/recherche${q ? '?q=' + encodeURIComponent(q) : ''}`;
    });
    if (onInput) f.q.addEventListener('input', () => onInput(f.q.value.trim()));
  }
}

const pageHead = (title, search = 'Votre recherche', value = '') =>
  `<div class="page-head"><h1 class="page-title">| ${esc(title)}</h1>${search ? searchHTML(value, search) : ''}</div>`;

function brandLogoHTML(b, mode) {
  const info = BRAND_INFO[b.name] || {};
  if (mode === 'home') {
    if (info.tile) return { bare: true, html: `<img class="full" src="${A}${info.tile}" alt="">` };
    const src = info.tileLogo === true ? info.logo : info.tileLogo;
    if (src) {
      const [w, h] = info.tileLogo === true ? [info.w, info.h] : [110, 110];
      return { html: logoImg(src, w, h) };
    }
  }
  if (info.logo) return { html: info.full ? `<img class="full" src="${A}${info.logo}" alt="">` : logoImg(info.logo, info.w, info.h) };
  return { html: `<span class="brand-word">${esc(info.name || b.name)}</span>` };
}
const logoImg = (src, w, h) =>
  `<img src="${A}${src}" alt=""${src.includes('dodge') ? ' class="flip-y"' : ''} style="width:calc(var(--u) * ${w});height:calc(var(--u) * ${h});left:calc(50% - var(--u) * ${w / 2});top:calc(50% - var(--u) * ${h / 2})">`;

function brandTile(b, mode) {
  const { html, bare } = brandLogoHTML(b, mode);
  const name = BRAND_INFO[b.name]?.name || b.name;
  return `<a class="brand-tile${bare ? ' bare' : ''}" href="#/marque/${esc(b.slug)}" aria-label="${esc(name)}, ${plural(b.count, 'pièce')}">${html}</a>`;
}

function trackHTML(it, n) {
  const cur = player.current && player.current.id === it.id;
  const th = thumbOf(it);
  return `<li class="track${cur ? ' playing' : ''}" data-id="${esc(it.id)}">
    <span class="track-n">${String(n).padStart(2, '0')}</span>
    ${th ? `<img class="track-th" src="${esc(th)}" alt="" loading="lazy">` : '<span class="track-th"></span>'}
    <div>
      <div class="track-title"><a href="#/s/${esc(it.id)}">${esc(it.title)}</a></div>
      <div class="track-sub">${esc(it.engine)}</div>
      <div class="track-credit">${esc(it.credit.author)} · ${esc(it.credit.source)}${it.credit.license ? ' · ' + esc(it.credit.license) : ''}</div>
    </div>
    <span class="track-dur">${fmtDur(it.duration)}</span>
    <button class="pbtn" data-play aria-label="${cur && player.playing ? 'Pause' : 'Écouter'} ${esc(it.title)}">${cur && player.playing ? ICON.pause : ICON.play}</button>
  </li>`;
}

function bindProgramme(root, getList) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.track');
    if (!li) return;
    const list = getList();
    const it = list.find((x) => x.id === li.dataset.id);
    if (it) player.playItem(it, list);
  });
  cleanup.push(
    player.on(() => {
      for (const li of root.querySelectorAll('.track')) {
        const cur = player.current && player.current.id === li.dataset.id;
        li.classList.toggle('playing', !!cur);
        li.querySelector('[data-play]').innerHTML = cur && player.playing ? ICON.pause : ICON.play;
      }
    }),
  );
}

const footer = () =>
  `<footer class="foot">VSound — la musique des moteurs. Vidéos et enregistrements crédités à leurs auteurs. <a href="#/a-propos">Sources et licences</a>.</footer>`;

/* ================= Accueil (Frame 1 / 2 / 3) ================= */
function viewHome() {
  top.classList.add('overlay');
  const s = sounds();
  const mercedes = DB.items.filter((i) => i.brands.includes('Mercedes'));
  const film = byVideo('sxXtpMngivM') || visuals()[0];
  const slides = [
    {
      bg: 'hero-engine.jpg',
      avatar: `${A}avatar-kb.png`,
      name: 'Kilian Barbier',
      role: 'Photographe',
      count: `Fondateur · ${DB.items.length} pièces`,
      action: `<button class="wbtn" data-act="programme">Écouter le programme</button>`,
      follow: 'Kilian Barbier',
    },
    {
      bg: 'hero-mercedes.jpg',
      avatar: `${A}avatar-mercedes.png`,
      name: 'Mercedes-Benz',
      role: 'Marque',
      count: plural(mercedes.length, 'pièce'),
      action: `<a class="wbtn" href="#/marque/mercedes">Voir leur page</a>`,
      follow: 'Mercedes-Benz',
    },
    {
      bg: 'hero-race.jpg',
      avatar: thumbOf(film),
      name: film.car,
      role: film.engine,
      count: film.credit.author,
      action: `<a class="wbtn" href="#/s/${esc(film.id)}">Regarder ${TRI}</a>`,
      follow: film.credit.author,
    },
  ];
  const followed = new Set(store.get(followKey(), []));
  const homeBrands = ['BMW', 'Mercedes', 'Toyota', 'Dodge', 'Nissan']
    .map((n) => brandList().find((b) => b.name === n))
    .filter(Boolean);
  const rows = [
    ['À l’affiche', ['AWLFN0o2sl8', 'F0tfrCQ-N2M', 'm8mgAXhNNPo', 'eAAvR1U56K8', 'Ca5o7RW2SlA', 'xHEQG9pW9jU', 'B4Th3LxCgb4'].map(byVideo).filter(Boolean)],
    ['Les V12', DB.items.filter((i) => i.family === 'V12')],
    ['Le rotatif', DB.items.filter((i) => i.family === 'Rotary')],
    ['Six à plat et autres boxers', DB.items.filter((i) => i.family === 'Flat')],
  ];
  main.innerHTML = `
  <section class="hero" aria-roledescription="carrousel" aria-label="À la une">
    ${slides
      .map(
        (sl, i) => `<div class="slide${i === 0 ? ' on' : ''}" aria-hidden="${i !== 0}">
        <img class="bg" src="${A}${sl.bg}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>
        <div class="creator">
          <img class="av" src="${esc(sl.avatar)}" alt="">
          <p class="nm">${esc(sl.name)}</p>
          <p class="rl">${esc(sl.role)}</p>
          <p class="ct">${esc(sl.count)}</p>
        </div>
        <div class="hero-actions">
          ${sl.action}
          <button class="bell" data-follow="${esc(sl.follow)}" aria-pressed="${followed.has(sl.follow)}" aria-label="Suivre ${esc(sl.follow)}"><img src="${A}bell.svg" alt=""></button>
        </div>
      </div>`,
      )
      .join('')}
  </section>
  <section class="home-brands">
    <h2 class="section-title">| Les marques</h2>
    <div class="home-tiles">${homeBrands.map((b) => brandTile(b, 'home')).join('')}</div>
  </section>
  <div class="rows home-more">
    ${rows.map(([label, list]) => rowHTML(label, list.map((it) => itemCard(it)))).join('')}
  </div>
  ${footer()}`;

  // carrousel : fondu toutes les 7 s, en pause au survol
  const els = [...main.querySelectorAll('.slide')];
  let cur = 0;
  let paused = false;
  const show = (i) => {
    els[cur].classList.remove('on');
    els[cur].setAttribute('aria-hidden', 'true');
    cur = (i + els.length) % els.length;
    els[cur].classList.add('on');
    els[cur].setAttribute('aria-hidden', 'false');
  };
  const hero = main.querySelector('.hero');
  hero.addEventListener('pointerenter', () => (paused = true));
  hero.addEventListener('pointerleave', () => (paused = false));
  hero.addEventListener('focusin', () => (paused = true));
  const timer = setInterval(() => !paused && !document.hidden && show(cur + 1), 7000);
  cleanup.push(() => clearInterval(timer));

  hero.addEventListener('click', (e) => {
    const bell = e.target.closest('[data-follow]');
    if (bell) {
      const f = new Set(store.get(followKey(), []));
      const name = bell.dataset.follow;
      const on = !f.has(name);
      on ? f.add(name) : f.delete(name);
      store.set(followKey(), [...f]);
      for (const b of main.querySelectorAll(`[data-follow="${CSS.escape(name)}"]`)) b.setAttribute('aria-pressed', String(on));
      toast(on ? `Vous suivez ${name}` : `Vous ne suivez plus ${name}`);
    }
    if (e.target.closest('[data-act="programme"]')) player.playQueue(shuffle(s));
  });
  bindRows(main);
}

/* ================= Catégories (Frame 4) ================= */
function viewCategories() {
  const groups = categoryGroups();
  main.innerHTML = `<div class="page">
    ${pageHead('Choisissez votre catégorie', 'Votre catégorie')}
    <div class="rows">${groups
      .map((g) =>
        rowHTML(
          g.label,
          g.cats.map((c) => cardHTML({ href: `#/c/${g.type}/${encodeURIComponent(c.key)}`, img: catCover(g.type, c), label: c.label })),
        ),
      )
      .join('')}</div>
  </div>${footer()}`;
  bindRows(main);
  bindSearchForms(main);
}

function viewCategory(type, key) {
  const g = categoryGroups().find((x) => x.type === type);
  const c = g?.cats.find((x) => x.key === key);
  if (!c) return viewNotFound();
  listPage(c.label, c.items, `${g.label} · ${plural(c.items.length, 'pièce')}`);
}

/* ================= Marques (Frame 5) ================= */
function viewBrands() {
  const list = brandList();
  main.innerHTML = `<div class="page">
    ${pageHead('Choisissez votre marque', 'Votre marque')}
    <div class="brand-grid" id="bgrid">${list.map((b) => brandTile(b, 'page')).join('')}</div>
  </div>${footer()}`;
  const grid = document.getElementById('bgrid');
  bindSearchForms(main, (q) => {
    const n = norm(q);
    grid.innerHTML = list.filter((b) => !n || norm(b.name).includes(n)).map((b) => brandTile(b, 'page')).join('') || '<p class="empty">Aucune marque.</p>';
  });
}

function viewBrand(s) {
  const b = brandList().find((x) => x.slug === s);
  if (!b) return viewNotFound();
  const info = BRAND_INFO[b.name] || {};
  listPage(info.name || b.name, DB.items.filter((i) => i.brands.includes(b.name)), `${info.country || ''}${info.country ? ' · ' : ''}${plural(b.count, 'pièce')}`);
}

/* ================= Créateurs (Frame 6) ================= */
function viewCreators() {
  const groups = [
    ['Vidéastes', creatorList('video')],
    ['Preneurs de son', creatorList('audio')],
  ];
  const card = (c) => cardHTML({ href: `#/createur/${c.slug}`, img: c.items.map(thumbOf).find(Boolean), label: c.name });
  main.innerHTML = `<div class="page">
    ${pageHead('Choisissez votre créateur', 'Votre créateur')}
    <div class="rows">${groups.map(([label, list]) => rowHTML(label, list.map(card))).join('')}</div>
  </div>${footer()}`;
  bindRows(main);
  bindSearchForms(main);
}

function viewCreator(s) {
  const c = [...creatorList('video'), ...creatorList('audio')].find((x) => x.slug === s);
  if (!c) return viewNotFound();
  const src = c.items[0].credit;
  listPage(c.name, c.items, `${src.source}${src.license ? ' · ' + src.license : ''} · ${plural(c.items.length, 'pièce')}`);
}

/* liste générique : grille 5 colonnes + programme audio */
function listPage(title, items, sub) {
  const audio = items.filter((i) => i.type === 'audio');
  main.innerHTML = `<div class="page">
    ${pageHead(title)}
    <p class="row-label" style="margin-top:calc(var(--u) * 14);color:var(--g2)">${esc(sub)}</p>
    ${audio.length ? `<div class="btn-row" style="padding:0 var(--pad);margin-top:calc(var(--u) * 20)"><button class="wbtn" id="all">${ICON.play} Écouter les ${plural(audio.length, 'son')}</button>${items.some((i) => i.type !== 'audio') ? `<a class="obtn" href="#/fil?ids=${items.filter((i) => i.type !== 'audio').map((i) => i.id).join(',')}">Voir en fil</a>` : ''}</div>` : ''}
    <div class="grid5">${items.map((it) => itemCard(it)).join('')}</div>
  </div>${footer()}`;
  bindSearchForms(main);
  document.getElementById('all')?.addEventListener('click', () => player.playQueue(audio));
  document.title = `${title} — VSound`;
}

/* ================= Sons (Frame 01 + programme) ================= */
function viewSons(params) {
  const all = sounds();
  let list = all;
  const fams = Object.keys(DB.families).filter((f) => all.some((i) => i.family === f));
  main.innerHTML = `
  <div class="page">
    ${pageHead('Tous les sons', 'Votre son', params.q)}
    <div class="chips">${['', ...fams].map((f) => `<button class="chip" data-f="${esc(f)}" aria-pressed="${(params.f || '') === f}">${f ? esc(famLabel(f)) : 'Tous'}</button>`).join('')}</div>
    <div class="btn-row" style="padding:0 var(--pad);margin-top:calc(var(--u) * 26)"><button class="wbtn" id="all">${ICON.play} Tout écouter</button><button class="obtn" id="shuf">${ICON.shuffle} Aléatoire</button></div>
    <ol class="programme" id="prog"></ol>
  </div>${footer()}`;
  const prog = document.getElementById('prog');
  const draw = () => {
    const n = norm(params.q || '');
    list = all.filter((i) => (!params.f || i.family === params.f) && (!n || norm(`${i.title} ${i.engine} ${i.credit.author}`).includes(n)));
    prog.innerHTML = list.length ? list.map((it, i) => trackHTML(it, i + 1)).join('') : '<li class="empty">Aucun enregistrement ne correspond.</li>';
    for (const c of main.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String((c.dataset.f || '') === (params.f || '')));
    const p = new URLSearchParams(Object.entries({ f: params.f, q: params.q }).filter(([, v]) => v));
    history.replaceState(null, '', `#/sons${p.size ? '?' + p : ''}`);
  };
  draw();
  bindProgramme(prog, () => list);
  bindSearchForms(main, (q) => {
    params.q = q;
    draw();
  });
  main.querySelector('.chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    params.f = c.dataset.f;
    draw();
  });
  document.getElementById('all').onclick = () => list.length && player.playQueue(list);
  document.getElementById('shuf').onclick = () => list.length && player.playQueue(shuffle(list));
}

/* ================= Profils (Frame 01) ================= */
function viewProfiles(params) {
  document.body.classList.add('bare');
  const cur = currentProfile();
  main.innerHTML = `<section class="profiles">
    <img class="bg" src="${A}splash-red.jpg" alt="">
    <div class="profiles-inner">
      <div class="p-logo" role="img" aria-label="VSound"><svg viewBox="0 0 214 32.15" aria-hidden="true">
          <defs><mask id="logo-cut-xl"><rect x="44.72" y="3.9" width="165" height="24.45" fill="#fff"/><text x="127.22" y="26.05" text-anchor="middle" textLength="159" lengthAdjust="spacingAndGlyphs" font-family="Montserrat, Arial Black, sans-serif" font-weight="900" font-size="28.6" fill="#000">SOUND</text></mask></defs>
          <path d="M22.83 23.21H19.43L29.16 6H37.7L25.67 26.05H16.39L4.35 6H13.07L22.83 23.21Z" fill="currentColor"/>
          <rect x="44.72" y="3.9" width="165" height="24.45" fill="currentColor" mask="url(#logo-cut-xl)"/>
        </svg></div>
      <h1>CHOISISSEZ VOTRE PILOTE</h1>
      <div class="picks">${PROFILES.map(
        (p) => `<button class="pick" data-profile="${p.id}" aria-pressed="${cur?.id === p.id}"><span class="ph"><img src="${A}profile-${p.id}.jpg" alt=""></span><b>${esc(p.name)}</b></button>`,
      ).join('')}</div>
    </div>
  </section>`;
  main.querySelector('.picks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-profile]');
    if (!b) return;
    store.set('profile', b.dataset.profile);
    renderUser();
    location.hash = params.next ? decodeURIComponent(params.next) : '#/';
  });
}

/* ================= Recherche ================= */
function viewSearch(params) {
  main.innerHTML = `<div class="page">
    ${pageHead('Recherche', 'Votre recherche', params.q)}
    <p class="row-label" id="count" style="margin-top:calc(var(--u) * 14);color:var(--g2)"></p>
    <div class="grid5" id="res"></div>
  </div>${footer()}`;
  const res = document.getElementById('res');
  const draw = (q) => {
    const n = norm(q || '');
    const list = n ? DB.items.filter((i) => norm(`${i.title} ${i.car || ''} ${i.engine} ${i.brands.join(' ')} ${famLabel(i.family)} ${i.credit?.author || ''}`).includes(n)) : DB.items;
    res.innerHTML = list.map((it) => itemCard(it)).join('');
    document.getElementById('count').textContent = n ? `${plural(list.length, 'résultat')} pour « ${q} »` : `${plural(list.length, 'pièce')} au total`;
    history.replaceState(null, '', `#/recherche${q ? '?q=' + encodeURIComponent(q) : ''}`);
  };
  draw(params.q);
  bindSearchForms(main, draw);
  main.querySelector('.search-c input').focus();
}

/* ================= Fil ================= */
function embedSrc(it, autoplay) {
  if (it.type === 'instagram') return `https://www.instagram.com/reel/${encodeURIComponent(it.code)}/embed/`;
  const p = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1', autoplay: autoplay ? '1' : '0' });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.videoId)}?${p}`;
}
function frameHTML(it, { mounted = false, autoplay = false } = {}) {
  const cls = it.type === 'instagram' ? 'frame ig' : it.vertical ? 'frame vertical' : 'frame';
  if (mounted) {
    const allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    return `<div class="${cls}"><iframe src="${embedSrc(it, autoplay)}" title="${esc(it.title)}" allow="${allow}" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }
  const th = thumbOf(it);
  return `<div class="${cls}">${th ? `<img class="poster" src="${esc(th)}" alt="" loading="lazy">` : ''}<button class="poster-btn" data-mount aria-label="Lire « ${esc(it.title)} »"><span><img src="${A}play-tri.svg" alt=""></span></button></div>`;
}
function creditText(it) {
  const c = it.credit || {};
  const src = c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.source)}</a>` : esc(c.source || '');
  const lic = c.license ? (c.licenseUrl ? ` · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : ` · ${esc(c.license)}`) : '';
  return `${c.author ? `<b>${esc(c.author)}</b> — ` : ''}${src}${lic}`;
}

function viewFeed(params) {
  const all = visuals();
  let list = all;
  if (params.ids) {
    const ids = params.ids.split(',');
    list = ids.map(byId).filter(Boolean);
  } else {
    if (params.f) list = list.filter((i) => i.family === params.f);
    if (params.t === 'youtube') list = list.filter((i) => i.type === 'youtube' && !i.vertical);
    if (params.t === 'short') list = list.filter((i) => i.type === 'youtube' && i.vertical);
    if (params.t === 'instagram') list = list.filter((i) => i.type === 'instagram');
  }
  const types = [
    ['', 'Tout'],
    ['youtube', 'Vidéos'],
    ['short', 'Shorts'],
    ['instagram', 'Reels'],
  ].filter(([t]) => !t || all.some((i) => (t === 'instagram' ? i.type === 'instagram' : t === 'short' ? i.vertical && i.type === 'youtube' : i.type === 'youtube' && !i.vertical)));
  const fams = Object.keys(DB.families).filter((f) => all.some((i) => i.family === f));
  main.innerHTML = `
    <div class="feed-bar" role="toolbar" aria-label="Filtres du fil">
      ${types.map(([t, l]) => `<button class="chip" data-t="${t}" aria-pressed="${!params.ids && (params.t || '') === t}">${l}</button>`).join('')}
      <span class="sep"></span>
      ${['', ...fams].map((f) => `<button class="chip" data-f="${esc(f)}" aria-pressed="${!params.ids && (params.f || '') === f}">${f ? esc(famLabel(f)) : 'Toutes'}</button>`).join('')}
    </div>
    <div class="feed" id="feed" tabindex="0" aria-label="Fil de vidéos, faites défiler">
      ${
        list.length
          ? list
              .map(
                (it, i) => `<section class="fslide" data-i="${i}" aria-label="${esc(it.title)}">
          <div class="stage">${frameHTML(it)}</div>
          <div class="fcaption">
            <div>
              <h2><a href="#/s/${esc(it.id)}">${esc(it.title)}</a></h2>
              <div class="meta">${esc(typeLabel(it))} · ${esc(it.car || '')}${it.car ? ' · ' : ''}${esc(it.engine)}</div>
              <div class="credit">${creditText(it)}</div>
            </div>
            <div class="feed-nav">
              <button class="sq" data-share aria-label="Partager">${ICON.share}</button>
              <button class="sq" data-prev aria-label="Précédente">${ICON.up}</button>
              <button class="sq" data-next aria-label="Suivante">${ICON.down}</button>
            </div>
          </div>
        </section>`,
              )
              .join('')
          : `<div class="empty">Rien dans cette catégorie pour l’instant.</div>`
      }
    </div>`;
  const feed = document.getElementById('feed');
  const slides = [...feed.querySelectorAll('.fslide')];
  let active = -1;
  let started = false;
  const mount = (i, autoplay) => {
    slides[i].querySelector('.stage').innerHTML = frameHTML(list[i], { mounted: true, autoplay });
    player.pause();
  };
  const unmount = (i) => {
    const st = slides[i].querySelector('.stage');
    if (st.querySelector('iframe')) st.innerHTML = frameHTML(list[i]);
  };
  const activate = (i) => {
    if (i === active) return;
    if (active >= 0) unmount(active);
    active = i;
    if (started) mount(i, true);
  };
  const go = (d) => slides[Math.min(slides.length - 1, Math.max(0, (active < 0 ? 0 : active) + d))]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const io = new IntersectionObserver((en) => en.forEach((e) => e.isIntersecting && activate(+e.target.dataset.i)), { root: feed, threshold: 0.6 });
  slides.forEach((s) => io.observe(s));
  cleanup.push(() => io.disconnect());
  feed.addEventListener('click', (e) => {
    const sl = e.target.closest('.fslide');
    if (!sl) return;
    const i = +sl.dataset.i;
    if (e.target.closest('[data-mount]')) {
      started = true;
      active = i;
      mount(i, true);
    } else if (e.target.closest('[data-next]')) go(1);
    else if (e.target.closest('[data-prev]')) go(-1);
    else if (e.target.closest('[data-share]')) share(list[i].title, `#/s/${list[i].id}`);
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.target.matches('input, textarea')) return;
      if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      }
    },
    { signal: viewAbort.signal },
  );
  main.querySelector('.feed-bar').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const p = params.ids ? {} : { f: params.f, t: params.t };
    if ('f' in c.dataset) p.f = c.dataset.f;
    if ('t' in c.dataset) p.t = c.dataset.t;
    location.hash = `#/fil?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`;
  });
  const start = params.id ? list.findIndex((i) => i.id === params.id) : -1;
  if (start > 0) {
    started = true;
    requestAnimationFrame(() => slides[start].scrollIntoView({ block: 'start' }));
  }
}

/* ================= Page d'un contenu ================= */
function viewItem(id) {
  const it = byId(id);
  if (!it) return viewNotFound();
  const same = it.type === 'audio' ? sounds() : visuals();
  const idx = same.indexOf(it);
  const prev = same[idx - 1];
  const next = same[idx + 1];
  const related = shuffle(DB.items.filter((i) => i.id !== it.id && (i.family === it.family || i.brands.some((b) => it.brands.includes(b))))).slice(0, 10);
  const media =
    it.type === 'audio'
      ? `<div class="audio-stage" id="astage">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : ''}<canvas id="aviz"></canvas><button class="big" id="bigplay" aria-label="Écouter">${ICON.play.replace('<svg', '<svg class="i-play"')}${ICON.pause.replace('<svg', '<svg class="i-pause"')}</button></div>`
      : frameHTML(it, { mounted: true, autoplay: false });
  const brandLinks = it.brands.map((b) => `<a href="#/marque/${slug(b)}">${esc(BRAND_INFO[b]?.name || b)}</a>`).join(', ');
  main.innerHTML = `<div class="page">
    ${pageHead(typeLabel(it), '')}
    <div class="item-layout">
      <div class="item-media">${media}</div>
      <div class="item-info">
        <div class="info-card">
          <h1>${esc(it.title)}</h1>
          <p class="rl">${esc(it.engine)}</p>
          <dl class="facts">
            ${it.car ? `<dt>Voiture</dt><dd>${esc(it.car)}</dd>` : ''}
            ${brandLinks ? `<dt>Marque</dt><dd>${brandLinks}</dd>` : ''}
            <dt>Architecture</dt><dd><a href="#/c/archi/${esc(it.family)}">${esc(famLabel(it.family))}</a></dd>
            ${it.duration ? `<dt>Durée</dt><dd>${fmtDur(it.duration)}</dd>` : ''}
          </dl>
          <p class="credit-line">Crédit : ${creditText(it)}<br>${it.type === 'audio' ? 'Enregistrement réutilisé selon les termes de sa licence, sans modification.' : 'Vidéo intégrée via le lecteur officiel ; tous les droits restent à son auteur.'}</p>
        </div>
        <div class="btn-row">
          <button class="wbtn" id="share">${ICON.share} Partager</button>
          ${it.type !== 'audio' ? `<a class="obtn" href="#/fil?id=${esc(it.id)}">Ouvrir dans le fil</a>` : ''}
        </div>
        <div class="btn-row">
          ${prev ? `<a class="obtn" href="#/s/${esc(prev.id)}">← Précédent</a>` : ''}
          ${next ? `<a class="obtn" href="#/s/${esc(next.id)}">Suivant →</a>` : ''}
        </div>
      </div>
    </div>
    ${related.length ? `<div class="rows" style="margin-top:calc(var(--u) * 60)">${rowHTML('Dans la même veine', related.map((r) => itemCard(r)))}</div>` : ''}
  </div>${footer()}`;
  document.getElementById('share').onclick = () => share(it.title, `#/s/${it.id}`);
  document.title = `${it.title} — VSound`;
  bindRows(main);
  if (it.type === 'audio') {
    const stage = document.getElementById('astage');
    const sync = () => stage.classList.toggle('playing', !!(player.current?.id === it.id && player.playing));
    document.getElementById('bigplay').onclick = () => player.playItem(it, sounds());
    cleanup.push(player.addViz(document.getElementById('aviz')));
    cleanup.push(player.on(sync));
    sync();
  } else {
    player.pause();
  }
}

/* ================= À propos ================= */
function viewAbout() {
  const rows = DB.items
    .map(
      (it) =>
        `<tr><td><a href="#/s/${esc(it.id)}">${esc(it.title)}</a></td><td>${typeLabel(it)}</td><td>${esc(it.credit?.author || '')}</td><td>${it.credit?.url ? `<a href="${esc(it.credit.url)}" target="_blank" rel="noopener">${esc(it.credit.source)}</a>` : esc(it.credit?.source || '')}</td><td>${esc(it.credit?.license || 'Intégration officielle')}</td></tr>`,
    )
    .join('');
  main.innerHTML = `<div class="page">
    ${pageHead('À propos', '')}
    <div class="prose">
      <p>VSound est consacré à une seule chose : le son des moteurs. Des montées en régime, des démarrages à froid, des passages à pleine charge, à écouter comme on écoute un orchestre.</p>
      <h2 class="section-title">| D’où viennent les sons</h2>
      <p><b>Vidéos YouTube et Reels Instagram</b> : intégrés avec les lecteurs officiels des plateformes. Ils restent hébergés chez leurs auteurs, à qui reviennent les vues et tous les droits.</p>
      <p><b>Enregistrements audio</b> : la collection « engine and exhaust sound » de Wikimedia Commons, sous licence CC BY 3.0. L’auteur, la source et la licence de chaque piste sont indiqués partout où elle apparaît ; les vignettes sont celles des vidéos dont ces enregistrements sont extraits.</p>
      <p>Vous êtes l’auteur d’un contenu présent ici et souhaitez qu’il soit retiré ? Ouvrez une demande sur le dépôt GitHub du projet : il le sera.</p>
      <h2 class="section-title">| Ajouter un son</h2>
      <p>Tout le catalogue tient dans <code>data/catalogue.json</code>. Une entrée par contenu :</p>
      <pre>{ "id": "mon-reel", "type": "instagram",
  "url": "https://www.instagram.com/reel/XXXXXXXXX/",
  "title": "…", "car": "…", "engine": "V12 6,5 L", "family": "V12",
  "brands": ["Lamborghini"],
  "credit": { "author": "@compte", "source": "Instagram",
              "url": "https://www.instagram.com/reel/XXXXXXXXX/" } }</pre>
      <p>Types possibles : <code>youtube</code> (avec <code>videoId</code>, et <code>vertical: true</code> pour un Short), <code>instagram</code> (avec <code>url</code>) et <code>audio</code> (avec <code>src</code> vers un MP3 et une <code>credit.license</code>).</p>
      <h2 class="section-title">| Crédits complets</h2>
      <div class="credits-wrap"><table class="credits-table"><thead><tr><th>Pièce</th><th>Type</th><th>Auteur</th><th>Source</th><th>Licence</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
  </div>${footer()}`;
}

function viewNotFound() {
  main.innerHTML = `<div class="page">${pageHead('Silence…', '')}<p class="row-label" style="margin-top:20px;color:var(--g2)">Cette page n’existe pas ou a été retirée. <a href="#/" style="text-decoration:underline">Retour à l’accueil</a></p></div>`;
}

/* ================= routeur ================= */
function route() {
  for (const fn of cleanup) fn();
  cleanup = [];
  viewAbort.abort();
  viewAbort = new AbortController();
  top.classList.remove('overlay');
  document.body.classList.remove('bare');

  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const page = parts[0] || 'home';
  const navKey = { c: 'categories', marque: 'marques', createur: 'createurs' }[page] || page;
  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === navKey;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  const titles = { profils: 'Profils', categories: 'Catégories', marques: 'Marques', createurs: 'Créateurs', sons: 'Sons', fil: 'Le fil', recherche: 'Recherche', 'a-propos': 'À propos' };
  document.title = titles[page] ? `${titles[page]} — VSound` : 'VSound — la musique des moteurs';

  const views = {
    home: () => (currentProfile() ? viewHome() : location.replace('#/profils')),
    profils: () => viewProfiles(params),
    categories: () => viewCategories(),
    c: () => viewCategory(parts[1], parts[2]),
    marques: () => viewBrands(),
    marque: () => viewBrand(parts[1]),
    createurs: () => viewCreators(),
    createur: () => viewCreator(parts[1]),
    sons: () => viewSons(params),
    fil: () => viewFeed(params),
    recherche: () => viewSearch(params),
    s: () => viewItem(parts[1]),
    'a-propos': () => viewAbout(),
  };
  (views[page] || viewNotFound)();
  if (page !== 'fil') window.scrollTo(0, 0);
}

async function boot() {
  try {
    const res = await fetch('data/catalogue.json', { cache: 'no-cache' });
    DB = prepare(await res.json());
  } catch (e) {
    main.innerHTML = `<div class="page">${pageHead('Catalogue indisponible', '')}</div>`;
    console.error(e);
    return;
  }
  renderUser();
  addEventListener('hashchange', route);
  route();
}

boot();
