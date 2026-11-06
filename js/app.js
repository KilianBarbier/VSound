import { Player } from './player.js';
import * as auth from './auth.js';
import { createYT } from './yt.js';

const main = document.getElementById('main');
const top = document.getElementById('top');
const player = new Player();
const A = 'assets/vhub/';
let DB = { families: {}, items: [] };
let cleanup = [];
let viewAbort = new AbortController();
// Interface mobile : rendu propre au téléphone sous 640 px
const MQ = matchMedia('(max-width: 640px)');
const isMobile = () => MQ.matches;
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.6 4.6 7.4 7.4-7.4 7.4 1.4 1.4 8.8-8.8L10 3.2z"/></svg>';

/* ================= utilitaires ================= */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
// « 3 sons et 2 vidéos » : le catalogue mêle enregistrements audio et vidéos
const countOf = (list) => {
  const a = list.filter((i) => i.type === 'audio').length;
  const v = list.length - a;
  return [a && plural(a, 'son'), v && plural(v, 'vidéo')].filter(Boolean).join(' et ') || 'Aucun son';
};
const brandItems = (name) => DB.items.filter((i) => i.brands.includes(name));
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
  shuffle: '<svg viewBox="0 0 24 24"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z"/></svg>',
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
  Pagani: { country: 'Italie' },
  Mitsubishi: { country: 'Japon' },
};
// Pilotes du compte connecté (écran « Choisissez votre pilote »)
const currentProfile = () => auth.currentPilot();
const initial = (n) => (String(n || '').trim()[0] || '?').toUpperCase();
function avatarHTML(p, cls = '') {
  const u = auth.photoUrl(p);
  return u ? `<img class="av ${cls}" src="${esc(u)}" alt="">` : `<span class="av av-i ${cls}" aria-hidden="true">${esc(initial(p?.name))}</span>`;
}

function renderUser() {
  const p = currentProfile();
  const u = auth.user();
  const a = document.querySelector('.user');
  a.href = u ? '#/profils' : '#/connexion';
  a.innerHTML = p ? `<span>${esc(p.name)}</span>${avatarHTML(p, 'photo')}` : `<span>${u ? 'Profils' : 'Connexion'}</span><img src="${A}user.png" alt="">`;
  a.setAttribute('aria-label', p ? `Pilote : ${p.name}, changer de pilote` : u ? 'Choisir un pilote' : 'Se connecter');
}

const COUNTRIES = ['Italie', 'Allemagne', 'Japon', 'États-Unis', 'Royaume-Uni', 'France'];

function igCode(url) {
  const m = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

// Son pur : pas (ou presque pas) de voix ni de musique d'après le contrôle qualité
const isPure = (it) => {
  const q = it.qc;
  if (!q || q.verdict === 'erreur') return true; // pas encore analysé
  return !['parole', 'musique'].includes(q.verdict) && (q.speech ?? 0) < 0.1 && (q.music ?? 0) < 0.15;
};
function prepare(raw) {
  const items = [];
  for (const it of raw.items || []) {
    // contrôle qualité (tools/qc_audio.py) : on écarte ce qui est surtout de la parole ou de la musique,
    // sauf si le contenu a été validé à la main (« qcOk »: true)
    if (!isPure(it) && it.qcOk !== true) continue;
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
// candidats du blind test, y compris ceux écartés automatiquement (pour le contrôle qualité) :
// les MP3, et les vidéos YouTube dont le contrôle qualité a trouvé des passages sans voix ni musique
const btCandidates = () => (DB.all || DB.items).filter((i) => (i.type === 'audio' && i.src) || (i.type === 'youtube' && i.qc?.clips?.length));
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
    <div class="row-head"><h2 class="row-label">${href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)}</h2>${href ? `<a class="row-more mb" href="${esc(href)}">Tout voir</a>` : ''}</div>
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

// `short` : titre plus court affiché sur mobile
const pageHead = (title, search = 'Votre recherche', value = '', short = '') =>
  `<div class="page-head"><h1 class="page-title"><span class="bar">| </span>${short ? `<span class="dk">${esc(title)}</span><span class="mb">${esc(short)}</span>` : esc(title)}</h1>${search ? searchHTML(value, search) : ''}</div>`;
const secHead = (label, href) =>
  `<div class="row-head"><h2 class="row-label">${esc(label)}</h2>${href ? `<a class="row-more" href="${esc(href)}">Tout voir</a>` : ''}</div>`;

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
  return `<a class="brand-tile${bare ? ' bare' : ''}" href="#/marque/${esc(b.slug)}" aria-label="${esc(name)}, ${countOf(brandItems(b.name))}">${html}</a>`;
}

function trackHTML(it, n) {
  const cur = player.current && player.current.id === it.id;
  const th = thumbOf(it);
  return `<li class="track${cur ? ' playing' : ''}" data-id="${esc(it.id)}">
    <span class="track-n">${String(n).padStart(2, '0')}</span>
    ${th ? `<img class="track-th" src="${esc(th.replace('/hqdefault.', '/mqdefault.'))}" alt="" loading="lazy">` : '<span class="track-th"></span>'}
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
  const s = sounds();
  const mercedes = DB.items.filter((i) => i.brands.includes('Mercedes'));
  const film = byVideo('sxXtpMngivM') || visuals()[0];
  const slides = [
    {
      bg: 'hero-engine.jpg',
      avatar: 'favicon.svg',
      name: 'Le programme VSound',
      role: 'En lecture aléatoire',
      count: countOf(DB.items),
      tag: 'Le programme',
      action: `<button class="wbtn" data-act="programme">Écouter le programme</button>`,
      follow: null,
    },
    {
      bg: 'hero-mercedes.jpg',
      avatar: `${A}avatar-mercedes.png`,
      name: 'Mercedes-Benz',
      role: 'Marque',
      count: countOf(mercedes),
      tag: 'Marque',
      action: `<a class="wbtn" href="#/marque/mercedes">Voir leur page</a>`,
      follow: 'Mercedes-Benz',
    },
    {
      bg: 'hero-race.jpg',
      avatar: thumbOf(film),
      name: film.car,
      role: film.engine,
      count: film.credit.author,
      tag: 'À l’affiche',
      action: `<a class="wbtn" href="#/s/${esc(film.id)}">Regarder ${TRI}</a>`,
      follow: film.credit.author,
    },
  ];
  const followed = auth.following();
  const homeBrands = ['BMW', 'Mercedes', 'Toyota', 'Dodge', 'Nissan']
    .map((n) => brandList().find((b) => b.name === n))
    .filter(Boolean);
  const rows = [
    ['À l’affiche', ['AWLFN0o2sl8', 'F0tfrCQ-N2M', 'm8mgAXhNNPo', 'eAAvR1U56K8', 'Ca5o7RW2SlA', 'xHEQG9pW9jU', 'B4Th3LxCgb4'].map(byVideo).filter(Boolean)],
    ['Les V12', DB.items.filter((i) => i.family === 'V12'), '#/c/archi/V12'],
    ['Le rotatif', DB.items.filter((i) => i.family === 'Rotary'), '#/c/archi/Rotary'],
    ['Six à plat et autres boxers', DB.items.filter((i) => i.family === 'Flat'), '#/c/archi/Flat'],
  ];
  const onHeroClick = (e) => {
    const bell = e.target.closest('[data-follow]');
    if (bell) {
      const name = bell.dataset.follow;
      const press = (on) => {
        for (const b of main.querySelectorAll(`[data-follow="${CSS.escape(name)}"]`)) b.setAttribute('aria-pressed', String(on));
      };
      const on = !auth.following().has(name);
      press(on);
      auth
        .toggleFollow(name)
        .then(() => toast(on ? `Vous suivez ${name}` : `Vous ne suivez plus ${name}`))
        .catch((err) => {
          press(!on);
          toast(auth.frError(err));
        });
    }
    if (e.target.closest('[data-act="programme"]')) player.playQueue(shuffle(s));
  };
  if (isMobile()) return viewHomeMobile({ slides, followed, homeBrands, rows, onHeroClick });
  top.classList.add('overlay');
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
          ${sl.follow ? `<button class="bell" data-follow="${esc(sl.follow)}" aria-pressed="${followed.has(sl.follow)}" aria-label="Suivre ${esc(sl.follow)}"><img src="${A}bell.svg" alt=""></button>` : ''}
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
    ${rows.map(([label, list, href]) => rowHTML(label, list.map((it) => itemCard(it)), href)).join('')}
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

  hero.addEventListener('click', onHeroClick);
  bindRows(main);
}

/* Accueil mobile : carrousel au doigt, raccourcis, marques, rangées */
function viewHomeMobile({ slides, followed, homeBrands, rows, onHeroClick }) {
  const p = currentProfile();
  const h = new Date().getHours();
  const hello = h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
  const fam = (f) => ({ key: f, items: DB.items.filter((i) => i.family === f) });
  const shorts = [
    `<button data-act="programme"><span class="ic">${ICON.play}</span><span>Tout écouter</span></button>`,
    `<a href="#/fil"><img src="${esc(thumbOf(byVideo('Lp394JR8uMo') || visuals()[0]))}" alt="" loading="lazy"><span>Le fil</span></a>`,
    ...['V12', 'V10', 'V8', 'Rotary'].map((f) => `<a href="#/c/archi/${f}"><img src="${esc(catCover('archi', fam(f)) || '')}" alt="" loading="lazy"><span>${esc(famLabel(f))}</span></a>`),
  ];
  main.innerHTML = `<div class="m-home">
    <h1 class="m-greet"><span>${hello}${p ? ',' : ''}</span>${esc(p ? p.name : 'Bienvenue')}</h1>
    <div class="m-hero" id="mhero" aria-label="À la une">
      ${slides
        .map(
          (sl) => `<article class="m-slide">
        <img class="bg" src="${A}${sl.bg}" alt="">
        <span class="ms-tag">${esc(sl.tag)}</span>
        <div class="ms-body">
          <div class="ms-who"><img src="${esc(sl.avatar)}" alt=""><div><b>${esc(sl.name)}</b><span>${esc(sl.role)} · ${esc(sl.count)}</span></div></div>
          <div class="ms-actions">${sl.action}${sl.follow ? `<button class="bell" data-follow="${esc(sl.follow)}" aria-pressed="${followed.has(sl.follow)}" aria-label="Suivre ${esc(sl.follow)}"><img src="${A}bell.svg" alt=""></button>` : ''}</div>
        </div>
      </article>`,
        )
        .join('')}
    </div>
    <div class="m-dots" aria-hidden="true">${slides.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
    <div class="m-short">${shorts.join('')}</div>
    ${btPromo()}
    <section class="m-sec">${secHead('Les marques', '#/marques')}<div class="m-brands">${homeBrands.map((b) => brandTile(b, 'home')).join('')}</div></section>
    <div class="rows">${rows.map(([label, list, href]) => rowHTML(label, list.map((it) => itemCard(it)), href)).join('')}</div>
    ${footer()}
  </div>`;
  main.addEventListener('click', onHeroClick, { signal: viewAbort.signal });
  const hero = document.getElementById('mhero');
  const dots = [...main.querySelectorAll('.m-dots i')];
  hero.addEventListener(
    'scroll',
    () => {
      const w = hero.querySelector('.m-slide').offsetWidth + 10;
      const i = Math.min(dots.length - 1, Math.round(hero.scrollLeft / w));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
    },
    { passive: true },
  );
}

/* Explorer (mobile) : catégories, marques, créateurs en un seul écran */
function viewExplorer() {
  if (!isMobile()) return location.replace('#/categories');
  const groups = categoryGroups();
  const tile = (g, c) => {
    const img = catCover(g.type, c);
    return `<a class="x-tile" href="#/c/${g.type}/${encodeURIComponent(c.key)}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<b>${esc(c.label)}</b><span>${countOf(c.items)}</span></a>`;
  };
  const sec = (g) => `<section class="m-sec">${secHead(g.label, '#/categories')}<div class="x-grid">${g.cats.map((c) => tile(g, c)).join('')}</div></section>`;
  const [archi, pays, format] = groups;
  const creators = [...creatorList('video'), ...creatorList('audio')].sort((a, b) => b.items.length - a.items.length).slice(0, 14);
  main.innerHTML = `<div class="page">
    ${pageHead('Explorer', 'Marque, moteur, créateur…')}
    <div class="rows">
      ${sec(archi)}
      <section class="m-sec">${secHead('Marques', '#/marques')}<div class="m-brands">${brandList().slice(0, 12).map((b) => brandTile(b, 'home')).join('')}</div></section>
      ${sec(pays)}
      <section class="m-sec">${secHead('Créateurs', '#/createurs')}<div class="m-avatars">${creators
        .map((c) => {
          const th = c.items.map(thumbOf).find(Boolean);
          return `<a href="#/createur/${esc(c.slug)}">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : '<span class="av0"></span>'}<span>${esc(c.name)}</span></a>`;
        })
        .join('')}</div></section>
      ${format ? sec(format) : ''}
      ${btPromo()}
      <a class="m-link" href="#/a-propos">À propos, sources et licences ${CHEV}</a>
    </div>
  </div>`;
  bindSearchForms(main);
}

/* ================= Catégories (Frame 4) ================= */
function viewCategories() {
  const groups = categoryGroups();
  main.innerHTML = `<div class="page">
    ${pageHead('Choisissez votre catégorie', 'Votre catégorie', '', 'Catégories')}
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
  listPage(c.label, c.items, `${g.label} · ${countOf(c.items)}`);
}

/* ================= Marques (Frame 5) ================= */
function viewBrands() {
  const list = brandList();
  main.innerHTML = `<div class="page">
    ${pageHead('Choisissez votre marque', 'Votre marque', '', 'Marques')}
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
  listPage(info.name || b.name, DB.items.filter((i) => i.brands.includes(b.name)), `${info.country || ''}${info.country ? ' · ' : ''}${countOf(brandItems(b.name))}`);
}

/* ================= Créateurs (Frame 6) ================= */
function viewCreators() {
  const groups = [
    ['Vidéastes', creatorList('video')],
    ['Preneurs de son', creatorList('audio')],
  ];
  const card = (c) => cardHTML({ href: `#/createur/${c.slug}`, img: c.items.map(thumbOf).find(Boolean), label: c.name });
  if (isMobile()) {
    const cell = (c) => {
      const th = c.items.map(thumbOf).find(Boolean);
      return `<a class="m-cell" href="#/createur/${esc(c.slug)}">${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : '<span class="av0"></span>'}<div><b>${esc(c.name)}</b><span>${countOf(c.items)} · ${esc(c.items[0].credit.source)}</span></div>${CHEV}</a>`;
    };
    main.innerHTML = `<div class="page">
      ${pageHead('Créateurs', '')}
      ${groups.map(([label, list]) => `<section class="m-sec">${secHead(label)}<div class="m-cells">${list.map(cell).join('')}</div></section>`).join('')}
    </div>${footer()}`;
    return;
  }
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
  listPage(c.name, c.items, `${src.source}${src.license ? ' · ' + src.license : ''} · ${countOf(c.items)}`);
}

/* liste générique : grille 5 colonnes + programme audio */
function listPage(title, items, sub) {
  const audio = items.filter((i) => i.type === 'audio');
  main.innerHTML = `<div class="page">
    ${pageHead(title)}
    <p class="row-label page-sub" style="margin-top:calc(var(--u) * 14);color:var(--g2)">${esc(sub)}</p>
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
    ${pageHead('Tous les sons', 'Votre son', params.q, 'Sons')}
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

/* ================= Compte et pilotes (fond rouge, Frame 01) ================= */
const LOGO_SVG = `<div class="p-logo" role="img" aria-label="VSound"><svg viewBox="0 0 214.07 32.15" aria-hidden="true">
    <rect width="214.07" height="32.15" fill="#000"/>
    <rect x="44.72" y="3.9" width="165" height="24.45" fill="#fff"/>
    <path d="M22.83 23.21H19.43L29.16 6H37.7L25.67 26.05H16.39L4.35 6H13.07L22.83 23.21Z" fill="#fff"/>
    <text x="127.22" y="26.05" text-anchor="middle" textLength="159" lengthAdjust="spacingAndGlyphs" font-family="Montserrat, Arial Black, sans-serif" font-weight="900" font-size="28.6" fill="#000">SOUND</text>
  </svg></div>`;
function redScreen(title, inner) {
  document.body.classList.add('bare');
  main.innerHTML = `<section class="profiles">
    <img class="bg" src="${A}splash-red.jpg" alt="">
    <div class="profiles-inner">
      <a href="#/sons" class="p-home" aria-label="VSound, parcourir sans compte">${LOGO_SVG}</a>
      <h1>${title}</h1>
      ${inner}
    </div>
  </section>`;
}
const nextOf = (params) => (params.next ? decodeURIComponent(params.next) : '#/');
const withNext = (h, params) => (params.next ? `${h}${h.includes('?') ? '&' : '?'}next=${encodeURIComponent(params.next)}` : h);
// Envoi d'un formulaire : bouton occupé, message d'erreur sous les champs
function busyForm(form, run) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const msg = form.querySelector('.a-msg');
    btn.disabled = true;
    msg.className = 'a-msg';
    msg.textContent = '';
    try {
      await run(new FormData(form), msg);
    } catch (err) {
      msg.className = 'a-msg err';
      msg.textContent = auth.frError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function viewLogin(params) {
  if (auth.user() && params.mode !== 'oubli') return location.replace(withNext('#/profils', params));
  const mode = ['inscription', 'oubli'].includes(params.mode) ? params.mode : 'connexion';
  const tab = (m, label) => `<a href="${withNext(m === 'connexion' ? '#/connexion' : `#/connexion?mode=${m}`, params)}" class="${m === mode ? 'on' : ''}" ${m === mode ? 'aria-current="page"' : ''}>${label}</a>`;
  const field = (name, label, type, auto, extra = '') =>
    `<label class="a-field"><span>${label}</span><input name="${name}" type="${type}" autocomplete="${auto}" required ${extra}></label>`;
  const forms = {
    connexion: `${field('email', 'E-mail', 'email', 'email')}${field('password', 'Mot de passe', 'password', 'current-password')}
      <button class="a-btn" type="submit">Se connecter</button>
      <a class="a-link" href="${withNext('#/connexion?mode=oubli', params)}">Mot de passe oublié ?</a>`,
    inscription: `${field('name', 'Prénom', 'text', 'given-name', 'maxlength="24"')}${field('email', 'E-mail', 'email', 'email')}${field('password', 'Mot de passe (6 caractères min.)', 'password', 'new-password', 'minlength="6"')}
      <button class="a-btn" type="submit">Créer mon compte</button>`,
    oubli: `<p class="a-note">Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.</p>${field('email', 'E-mail', 'email', 'email')}
      <button class="a-btn" type="submit">Envoyer le lien</button>
      <a class="a-link" href="${withNext('#/connexion', params)}">Retour à la connexion</a>`,
  };
  redScreen(
    { connexion: 'CONNEXION', inscription: 'CRÉER UN COMPTE', oubli: 'MOT DE PASSE OUBLIÉ' }[mode],
    `<form class="a-card" novalidate>
      ${mode === 'oubli' ? '' : `<nav class="a-tabs">${tab('connexion', 'Se connecter')}${tab('inscription', 'Créer un compte')}</nav>`}
      ${forms[mode]}
      <p class="a-msg" role="alert"></p>
    </form>
    <a class="a-skip" href="#/sons">Écouter sans compte</a>`,
  );
  const form = main.querySelector('form');
  for (const inp of form.querySelectorAll('input')) inp.addEventListener('invalid', (e) => e.preventDefault());
  busyForm(form, async (d, msg) => {
    const email = String(d.get('email') || '').trim();
    const password = String(d.get('password') || '');
    if (!email) throw new Error('Indique ton adresse e-mail.');
    if (mode === 'oubli') {
      await auth.resetPassword(email);
      msg.className = 'a-msg ok';
      msg.textContent = `Si un compte existe pour ${email}, un lien vient d’y être envoyé.`;
      return;
    }
    if (!password) throw new Error('Indique ton mot de passe.');
    if (mode === 'inscription') {
      const name = String(d.get('name') || '').trim();
      if (!name) throw new Error('Indique ton prénom.');
      if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.');
      const { confirm } = await auth.signUp(name, email, password);
      if (confirm) {
        form.innerHTML = `<p class="a-note big">Compte créé&nbsp;!</p><p class="a-note">Ouvre le lien envoyé à <b>${esc(email)}</b> pour confirmer ton adresse, puis reviens te connecter.</p>
          <a class="a-btn" href="${withNext('#/connexion', params)}">Se connecter</a>`;
        return;
      }
      await auth.signIn(email, password);
    } else {
      await auth.signIn(email, password);
    }
    renderUser();
    location.hash = withNext('#/profils', params);
  });
  form.querySelector('input').focus({ preventScroll: true });
}

function viewNewPassword() {
  if (!auth.user()) return location.replace('#/connexion?mode=oubli');
  redScreen(
    'NOUVEAU MOT DE PASSE',
    `<form class="a-card" novalidate>
      <label class="a-field"><span>Nouveau mot de passe (6 caractères min.)</span><input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="a-btn" type="submit">Enregistrer</button>
      <p class="a-msg" role="alert"></p>
    </form>`,
  );
  const form = main.querySelector('form');
  busyForm(form, async (d) => {
    const pw = String(d.get('password') || '');
    if (pw.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.');
    await auth.setPassword(pw);
    toast('Mot de passe modifié');
    location.hash = '#/profils';
  });
}

function viewProfiles(params) {
  if (!auth.user()) return location.replace(withNext('#/connexion', params));
  if (params.edit) return viewPilotEditor(params);
  const list = auth.pilots();
  const cur = currentProfile();
  const manage = params.gerer === '1';
  const pen = '<span class="p-edit" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z"/></svg></span>';
  redScreen(
    manage ? 'GÉRER LES PILOTES' : 'CHOISISSEZ VOTRE PILOTE',
    `<div class="picks${manage ? ' managing' : ''}">${list
      .map(
        (p) => `<button class="pick" data-pilot="${p.id}" aria-pressed="${!manage && cur?.id === p.id}"${manage ? ` aria-label="Modifier ${esc(p.name)}"` : ''}><span class="ph">${avatarHTML(p)}${manage ? pen : ''}</span><b>${esc(p.name)}</b></button>`,
      )
      .join('')}${
      list.length < auth.MAX_PILOTS
        ? `<a class="pick add" href="${withNext('#/profils?edit=nouveau', params)}"><span class="ph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg></span><b>Ajouter</b></a>`
        : ''
    }</div>
    <div class="p-actions">
      ${manage ? `<a class="a-btn ghost" href="${withNext('#/profils', params)}">Terminé</a>` : `<a class="a-btn ghost" href="${withNext('#/profils?gerer=1', params)}">Gérer les pilotes</a>`}
      ${auth.isAdmin() ? '<a class="a-link" href="#/qc">Contrôle qualité du blind test</a>' : ''}
      <button class="a-link" id="logout">Se déconnecter (${esc(auth.user().email)})</button>
    </div>`,
  );
  main.querySelector('.picks').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pilot]');
    if (!b) return;
    if (manage) {
      location.hash = withNext(`#/profils?edit=${b.dataset.pilot}`, params);
      return;
    }
    await auth.choosePilot(b.dataset.pilot);
    renderUser();
    location.hash = nextOf(params);
  });
  document.getElementById('logout').onclick = async () => {
    await auth.signOut();
    renderUser();
    toast('Vous êtes déconnecté');
    location.hash = '#/connexion';
  };
}

function viewPilotEditor(params) {
  const isNew = params.edit === 'nouveau';
  const p = isNew ? null : auth.pilots().find((x) => x.id === params.edit);
  if (!isNew && !p) return location.replace(withNext('#/profils?gerer=1', params));
  if (isNew && auth.pilots().length >= auth.MAX_PILOTS) return location.replace(withNext('#/profils', params));
  const back = withNext(isNew ? '#/profils' : '#/profils?gerer=1', params);
  let file = null; // photo choisie, envoyée à l'enregistrement
  let drop = false; // retirer la photo actuelle
  redScreen(
    isNew ? 'NOUVEAU PILOTE' : 'MODIFIER LE PILOTE',
    `<form class="a-card" novalidate>
      <div class="pe-photo">
        <span class="ph" id="pe-prev"></span>
        <div class="pe-btns">
          <label class="a-btn ghost small">Importer une photo<input type="file" id="pe-file" accept="image/*" hidden></label>
          <button type="button" class="a-link" id="pe-clear">Retirer la photo</button>
        </div>
      </div>
      <label class="a-field"><span>Prénom</span><input name="name" type="text" maxlength="24" autocomplete="off" required value="${esc(p?.name || '')}"></label>
      <button class="a-btn" type="submit">${isNew ? 'Créer le pilote' : 'Enregistrer'}</button>
      ${!isNew && auth.pilots().length > 1 ? '<button type="button" class="a-link danger" id="pe-del">Supprimer ce pilote</button>' : ''}
      <a class="a-link" href="${back}">Annuler</a>
      <p class="a-msg" role="alert"></p>
    </form>`,
  );
  const form = main.querySelector('form');
  const nameIn = form.elements.name;
  const prev = document.getElementById('pe-prev');
  let blobUrl = null;
  const draw = () => {
    if (file) prev.innerHTML = `<img class="av" src="${blobUrl}" alt="">`;
    else prev.innerHTML = avatarHTML({ name: nameIn.value || p?.name, photo: drop ? null : p?.photo });
    document.getElementById('pe-clear').hidden = !(file || (p?.photo && !drop));
  };
  draw();
  nameIn.addEventListener('input', () => !file && draw());
  document.getElementById('pe-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Choisis une image');
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    file = f;
    blobUrl = URL.createObjectURL(f);
    drop = false;
    draw();
  });
  document.getElementById('pe-clear').onclick = () => {
    file = null;
    drop = true;
    draw();
  };
  cleanup.push(() => blobUrl && URL.revokeObjectURL(blobUrl));
  const del = document.getElementById('pe-del');
  if (del)
    del.onclick = async () => {
      if (!confirm(`Supprimer le pilote ${p.name} et ses abonnements ?`)) return;
      try {
        await auth.removePilot(p.id);
        renderUser();
        location.hash = back;
      } catch (err) {
        toast(auth.frError(err));
      }
    };
  busyForm(form, async (d) => {
    const name = String(d.get('name') || '').trim();
    if (!name) throw new Error('Indique un prénom.');
    const target = isNew ? await auth.addPilot(name) : p;
    if (!isNew && name !== p.name) await auth.editPilot(p.id, { name });
    if (file) await auth.setPhoto(target, file);
    else if (drop && p?.photo) await auth.clearPhoto(p);
    renderUser();
    toast(isNew ? `Pilote ${name} créé` : 'Pilote enregistré');
    location.hash = back;
  });
}

/* ================= Blind test : écouter l'extrait, deviner la marque ================= */
const BT_ROUNDS = 10;
const BT_CLIP = 10; // secondes d'extrait
const BT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1v-7H5v-1a7 7 0 0 1 14 0v1h-2v7h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9z"/></svg>';
const brandLabel = (b) => BRAND_INFO[b]?.name || b;
const btPromo = () =>
  `<a class="bt-promo" href="#/blindtest"><span class="bt-ic">${BT_ICON}</span><span><b>Blind test</b><small>Écoute l’extrait, devine la marque</small></span>${CHEV}</a>`;

function viewBlindtest() {
  // Extraits jouables : ceux validés à la main dans le contrôle qualité (#/qc), avec leur recadrage ;
  // à défaut, les passages repérés par tools/qc_audio.py (10 s sans voix ni musique). Les sons écartés sont exclus.
  let decisions = {};
  let pool = [];
  let brands = [];
  const buildPool = () => {
    pool = [];
    for (const it of btCandidates()) {
      if (it.brands.length !== 1) continue;
      const d = decisions[it.id];
      if (d?.status === 'ecarte') continue;
      if (d?.status === 'valide') pool.push({ it, starts: [d.clip_start], len: d.clip_end - d.clip_start, checked: true });
      else if (it.qc?.clips?.length && isPure(it)) pool.push({ it, starts: it.qc.clips, len: BT_CLIP });
    }
    brands = [...new Set(pool.map((r) => r.it.brands[0]))];
  };
  buildPool();
  const best = () => store.get('blindtest.best', 0);
  const audio = new Audio();
  audio.preload = 'auto';
  let game = null;
  let timer = 0;
  let ytp = null; // lecteur YouTube, créé au premier extrait vidéo et gardé toute la partie
  const stopClip = () => {
    clearTimeout(timer);
    clearTimeout(stopClip.poll);
    cancelAnimationFrame(stopClip.raf);
    audio.pause();
    ytp?.pause();
  };
  cleanup.push(() => {
    stopClip();
    audio.removeAttribute('src');
    audio.load();
    ytp?.destroy();
  });

  // la vidéo est floutée : on entend le moteur sans voir la voiture ni le titre
  main.innerHTML = `<div class="page bt">${pageHead('Blind test', '')}
    <div class="bt-ythost" id="bt-ythost" aria-hidden="true"><div class="bt-ytframe"></div><p>Touchez la vidéo floutée pour lancer le son</p></div>
    <div class="bt-stage" id="bt"></div></div>${footer()}`;
  const stage = document.getElementById('bt');
  const host = document.getElementById('bt-ythost');

  const intro = () => {
    stopClip();
    stage.innerHTML = `<div class="bt-card bt-intro">
      <span class="bt-big-ic">${BT_ICON}</span>
      <h2>Devine la marque à l’oreille</h2>
      <p>${BT_ROUNDS} extraits de quelques secondes, tirés de ${pool.length} enregistrements vérifiés : que du moteur, sans voix ni musique. À la fin de chaque extrait, choisis la bonne marque entre deux propositions.</p>
      <button class="bt-go" id="bt-start">Lancer la partie</button>
      ${best() ? `<p class="bt-best">Ton record : ${best()} / ${BT_ROUNDS}</p>` : ''}
      ${auth.isAdmin() ? '<a class="bt-admin" href="#/qc">Contrôle qualité des extraits</a>' : ''}
    </div>`;
    document.getElementById('bt-start').onclick = start;
  };

  auth
    .loadClips()
    .then((d) => {
      decisions = d;
      buildPool();
      if (!game) intro();
    })
    .catch((e) => console.warn('Décisions du contrôle qualité indisponibles', e));

  const start = () => {
    player.pause();
    game = { rounds: shuffle(pool).slice(0, BT_ROUNDS), i: 0, score: 0, answers: [] };
    question();
  };

  // barre de progression, fondu sur la dernière seconde, arrêt au bout de « len » secondes
  const runClip = (len, setVol, onEnd) => {
    const t0 = performance.now();
    const bar = stage.querySelector('.bt-progress i');
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / (len * 1000));
      if (bar) bar.style.transform = `scaleX(${p})`;
      const left = len * (1 - p);
      if (left < 1) setVol(Math.max(0, left));
      if (p < 1) stopClip.raf = requestAnimationFrame(tick);
    };
    stopClip.raf = requestAnimationFrame(tick);
    timer = setTimeout(() => {
      stopClip();
      onEnd();
    }, len * 1000);
  };

  // Vidéo YouTube : on attend qu'elle joue vraiment le bon passage (après une éventuelle publicité,
  // coupée en sourdine) avant de lancer le chrono. Sur téléphone, le premier son exige de toucher la vidéo.
  const playYT = async (it, from, len, onEnd) => {
    host.classList.add('on');
    if (!ytp) ytp = await createYT(host.querySelector('.bt-ytframe'));
    ytp.load(it.videoId, from, { muted: true });
    const t0 = performance.now();
    const wait = () => {
      const inClip = ytp.playing && ytp.videoId === it.videoId && Math.abs(ytp.currentTime - from) < 3 && (!it.duration || Math.abs(ytp.duration - it.duration) < 6);
      if (inClip) {
        host.classList.remove('tap');
        ytp.mute(false);
        ytp.volume(1);
        return runClip(len, (v) => ytp.volume(v), onEnd);
      }
      if (!ytp.playing && performance.now() - t0 > 2500) {
        host.classList.add('tap');
        const st = stage.querySelector('.bt-status');
        if (st) st.textContent = 'Touchez la vidéo floutée pour lancer le son';
      }
      stopClip.poll = setTimeout(wait, 120);
    };
    wait();
  };

  const playClip = (it, from, len, onEnd) => {
    stopClip();
    if (it.type === 'youtube') return playYT(it, from, len, onEnd);
    host.classList.remove('on', 'tap');
    const go = () => {
      audio.currentTime = from;
      audio.volume = 1;
      audio.play().then(() => runClip(len, (v) => (audio.volume = v), onEnd), () => {
        stage.querySelector('.bt-status').textContent = 'Touchez pour lancer le son';
        stage.querySelector('.bt-eq').onclick = () => playClip(it, from, len, onEnd);
      });
    };
    if (audio.dataset.id === it.id && audio.readyState >= 1) go();
    else {
      audio.dataset.id = it.id;
      audio.src = it.src;
      audio.addEventListener('loadedmetadata', go, { once: true });
      audio.load();
    }
  };

  const head = () =>
    `<div class="bt-top"><span>Extrait ${game.i + 1} / ${game.rounds.length}</span><span>Score ${game.score}</span></div>
     <div class="bt-steps">${game.rounds.map((_, k) => `<i class="${k < game.i ? (game.answers[k].ok ? 'ok' : 'ko') : k === game.i ? 'now' : ''}"></i>`).join('')}</div>`;

  const question = () => {
    const round = game.rounds[game.i];
    const it = round.it;
    const right = it.brands[0];
    const wrong = shuffle(brands.filter((b) => b !== right))[0];
    const choices = shuffle([right, wrong]);
    const from = shuffle(round.starts)[0];
    const len = round.len;
    stage.innerHTML = `<div class="bt-card">
      ${head()}
      <div class="bt-eq playing" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      <p class="bt-status" role="status">Écoute bien…</p>
      <div class="bt-progress"><i></i></div>
      <div class="bt-choices" hidden>${choices.map((b) => `<button data-b="${esc(b)}">${esc(brandLabel(b))}</button>`).join('')}</div>
      <button class="bt-again" hidden>Réécouter l’extrait</button>
    </div>`;
    const eq = stage.querySelector('.bt-eq');
    const status = stage.querySelector('.bt-status');
    const box = stage.querySelector('.bt-choices');
    const again = stage.querySelector('.bt-again');
    const ask = () => {
      eq.classList.remove('playing');
      status.textContent = 'Quelle marque ?';
      box.hidden = false;
      again.hidden = false;
      box.querySelector('button').focus({ preventScroll: true });
    };
    again.onclick = () => {
      eq.classList.add('playing');
      status.textContent = 'Écoute bien…';
      again.hidden = true;
      playClip(it, from, len, () => {
        eq.classList.remove('playing');
        status.textContent = 'Quelle marque ?';
        again.hidden = false;
      });
    };
    box.onclick = (e) => {
      const b = e.target.closest('[data-b]');
      if (!b || box.dataset.done) return;
      box.dataset.done = '1';
      stopClip();
      const ok = b.dataset.b === right;
      if (ok) game.score++;
      game.answers.push({ it, ok });
      for (const x of box.querySelectorAll('button')) {
        x.disabled = true;
        if (x.dataset.b === right) x.classList.add('right');
        else if (x === b) x.classList.add('wrong');
      }
      again.remove();
      status.textContent = ok ? 'Bien joué !' : `Raté, c’était ${brandLabel(right)}.`;
      status.className = `bt-status ${ok ? 'ok' : 'ko'}`;
      stage.querySelector('.bt-top span:last-child').textContent = `Score ${game.score}`;
      const th = thumbOf(it);
      box.insertAdjacentHTML(
        'afterend',
        `<div class="bt-reveal">
          ${th ? `<img src="${esc(th.replace('/hqdefault.', '/mqdefault.'))}" alt="">` : ''}
          <div><b>${esc(it.title)}</b><span>${esc(it.engine || '')}</span><a href="#/s/${esc(it.id)}">Écouter en entier</a></div>
        </div>
        <button class="bt-go" id="bt-next">${game.i + 1 < game.rounds.length ? 'Extrait suivant' : 'Voir mon score'}</button>`,
      );
      document.getElementById('bt-next').onclick = () => {
        game.i++;
        game.i < game.rounds.length ? question() : end();
      };
      document.getElementById('bt-next').focus({ preventScroll: true });
    };
    playClip(it, from, len, ask);
    // si le son ne se charge pas, on passe à un autre extrait
    audio.onerror = () => {
      if (stage.querySelector('.bt-choices')?.hidden === false) return;
      const spare = shuffle(pool.filter((x) => !game.rounds.includes(x)))[0];
      if (spare) {
        game.rounds[game.i] = spare;
        question();
      } else ask();
    };
  };

  const end = () => {
    stopClip();
    const n = game.rounds.length;
    const record = game.score > best();
    if (record) store.set('blindtest.best', game.score);
    const verdict = game.score === n ? 'Oreille absolue !' : game.score >= n * 0.7 ? 'Belle oreille.' : game.score >= n * 0.5 ? 'Pas mal du tout.' : 'Il va falloir réécouter le catalogue.';
    stage.innerHTML = `<div class="bt-card bt-end">
      <p class="bt-score"><b>${game.score}</b> / ${n}</p>
      <h2>${verdict}</h2>
      ${record ? '<p class="bt-best">Nouveau record !</p>' : best() ? `<p class="bt-best">Ton record : ${best()} / ${n}</p>` : ''}
      <ol class="bt-recap">${game.answers
        .map((a) => `<li class="${a.ok ? 'ok' : 'ko'}"><span>${a.ok ? '✓' : '✗'}</span><a href="#/s/${esc(a.it.id)}">${esc(a.it.title)}</a><em>${esc(brandLabel(a.it.brands[0]))}</em></li>`)
        .join('')}</ol>
      <button class="bt-go" id="bt-again">Rejouer</button>
    </div>`;
    document.getElementById('bt-again').onclick = start;
  };

  intro();
}

/* ================= Contrôle qualité du blind test (administrateurs) ================= */
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const QC_LABEL = { valide: 'Validé', ecarte: 'Écarté' };
const AUTO_LABEL = { moteur: 'Moteur', mixte: 'Mixte', parole: 'Parole', musique: 'Musique', erreur: 'Non analysé' };

function viewQC(params) {
  if (!auth.user()) return location.replace('#/connexion?next=' + encodeURIComponent('#/qc'));
  if (!auth.isAdmin()) {
    main.innerHTML = `<div class="page">${pageHead('Contrôle qualité', '')}<p class="page-sub qc-empty">Cette page est réservée aux administrateurs de VSound.</p></div>${footer()}`;
    return;
  }
  const list = btCandidates();
  let decisions = {};
  let filter = ['todo', 'valide', 'ecarte', 'all'].includes(params.f) ? params.f : 'todo';
  let openId = null;
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  const peaks = new Map(); // id -> Float32Array des crêtes
  let ed = null; // éditeur ouvert
  let raf = 0;
  // ce qu'on écoute : l'élément <audio> pour un MP3, un lecteur YouTube pour une vidéo
  const idle = { currentTime: 0, paused: true, play: () => Promise.resolve(), pause() {} };
  let media = audio;
  let ytp = null;
  const dropYT = () => {
    ytp?.destroy();
    ytp = null;
  };
  cleanup.push(() => {
    cancelAnimationFrame(raf);
    audio.pause();
    media.pause();
    dropYT();
    audio.removeAttribute('src');
    audio.load();
  });
  player.pause();

  main.innerHTML = `<div class="page qc">
    ${pageHead('Contrôle qualité', '', '', 'Contrôle')}
    <p class="page-sub qc-intro">Écoute chaque son, recadre l’extrait du blind test, puis valide-le ou écarte-le. Tant qu’un son n’est pas traité, le blind test utilise le passage repéré automatiquement.</p>
    <div class="qc-stats" id="qc-stats"></div>
    <div class="chips qc-chips" id="qc-f">${[
      ['todo', 'À traiter'],
      ['valide', 'Validés'],
      ['ecarte', 'Écartés'],
      ['all', 'Tous'],
    ]
      .map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`)
      .join('')}</div>
    <p class="qc-keys dk">Raccourcis : <kbd>Espace</kbd> écouter l’extrait · <kbd>V</kbd> valider · <kbd>X</kbd> écarter · <kbd>N</kbd> suivant</p>
    <ol class="qc-list" id="qc-list"><li class="qc-empty">Chargement des décisions…</li></ol>
  </div>${footer()}`;
  const listEl = document.getElementById('qc-list');

  const stat = (it) => decisions[it.id]?.status || 'todo';
  const stats = () => {
    const c = { valide: 0, ecarte: 0, todo: 0 };
    for (const it of list) c[stat(it)]++;
    document.getElementById('qc-stats').innerHTML = `<span><b>${c.valide}</b> ${c.valide > 1 ? 'validés' : 'validé'}</span><span><b>${c.ecarte}</b> ${c.ecarte > 1 ? 'écartés' : 'écarté'}</span><span><b>${c.todo}</b> à traiter</span><span><b>${list.length}</b> sons</span>`;
  };
  const shown = () => list.filter((it) => filter === 'all' || stat(it) === filter);

  const rowHTML = (it) => {
    const st = stat(it);
    const d = decisions[it.id];
    const auto = it.qc?.verdict;
    const th = it.thumb ? it.thumb.replace('/hqdefault.', '/mqdefault.') : null;
    return `<li class="qc-row" data-id="${esc(it.id)}">
      <button class="qc-head" aria-expanded="${openId === it.id}">
        ${th ? `<img src="${esc(th)}" alt="" loading="lazy">` : '<span class="qc-th0"></span>'}
        <span class="qc-name"><b>${esc(it.title)}</b><small>${esc(brandLabel(it.brands[0] || '—'))} · ${fmtDur(it.duration)}${auto ? ` · auto : ${AUTO_LABEL[auto] || auto}${it.qc.speech ? `, ${Math.round(it.qc.speech * 100)} % de voix` : ''}` : ''}</small></span>
        <span class="qc-badge ${st}">${st === 'todo' ? 'À traiter' : QC_LABEL[st]}${st === 'valide' && d ? ` · ${(d.clip_end - d.clip_start).toFixed(1)} s` : ''}</span>
      </button>
      ${openId === it.id ? '<div class="qc-ed" id="qc-ed"></div>' : ''}
    </li>`;
  };
  const drawList = () => {
    stats();
    const rows = shown();
    listEl.innerHTML = rows.length ? rows.map(rowHTML).join('') : `<li class="qc-empty">${filter === 'todo' ? 'Tout est traité. Bravo !' : 'Aucun son ici.'}</li>`;
    if (openId && document.getElementById('qc-ed')) openEditor(list.find((i) => i.id === openId));
  };

  const close = () => {
    cancelAnimationFrame(raf);
    audio.pause();
    media.pause();
    dropYT();
    media = audio;
    ed = null;
    openId = null;
  };
  const toggle = (id) => {
    if (openId === id) {
      close();
      drawList();
      return;
    }
    close();
    openId = id;
    drawList();
    document.querySelector(`.qc-row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const nextTodo = () => {
    const rows = list.filter((it) => stat(it) === 'todo');
    const i = rows.findIndex((it) => it.id === openId);
    const nx = rows[i + 1] || rows.find((it) => it.id !== openId);
    close();
    if (nx) {
      if (filter !== 'all' && filter !== 'todo') filter = 'todo';
      for (const c of document.querySelectorAll('#qc-f .chip')) c.setAttribute('aria-pressed', String(c.dataset.f === filter));
      toggle(nx.id);
    } else drawList();
  };

  /* ---------- éditeur : forme d'onde, sélection, écoute ---------- */
  async function loadPeaks(it, url = it.src) {
    if (peaks.has(it.id)) return peaks.get(it.id);
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100);
    const data = (await ctx.decodeAudioData(buf)).getChannelData(0);
    const N = 1200;
    const out = new Float32Array(N);
    const step = Math.floor(data.length / N) || 1;
    for (let k = 0; k < N; k++) {
      let m = 0;
      for (let j = k * step, e = Math.min(data.length, j + step); j < e; j += 4) m = Math.max(m, Math.abs(data[j]));
      out[k] = m;
    }
    const max = Math.max(...out) || 1;
    for (let k = 0; k < N; k++) out[k] /= max;
    peaks.set(it.id, out);
    return out;
  }

  function openEditor(it) {
    const box = document.getElementById('qc-ed');
    const d = decisions[it.id];
    const dur = it.duration || 60;
    const auto = it.qc?.clips || [];
    const first = d?.status === 'valide' ? d.clip_start : auto[0] ?? Math.min(5, Math.max(0, dur - BT_CLIP));
    ed = { it, dur, a: first, b: d?.status === 'valide' ? d.clip_end : Math.min(dur, first + BT_CLIP), mode: null, wave: null };
    const isYT = it.type === 'youtube';
    box.innerHTML = `
      ${isYT ? '<div class="qc-yt"><div></div></div>' : it.thumb ? `<img class="qc-cover" src="${esc(it.thumb.replace('/hqdefault.', '/mqdefault.'))}" alt="">` : ''}
      <div class="qc-wave${isYT ? ' flat' : ''}" id="qc-wave"><canvas></canvas>${isYT ? '' : '<p class="qc-load">Chargement de la forme d’onde…</p>'}</div>
      <div class="qc-time"><span id="qc-pos">0:00.0</span><span id="qc-sel"></span><span>${fmtT(dur)}</span></div>
      ${auto.length ? `<div class="qc-auto"><span>Passages repérés sans voix :</span>${auto.map((c) => `<button data-auto="${c}">${fmtT(c)}</button>`).join('')}</div>` : '<p class="qc-auto"><span>Aucun passage sans voix repéré automatiquement : écoute et choisis toi-même.</span></p>'}
      <div class="qc-ctrl">
        <button class="qc-btn main" data-act="clip">▶ Écouter l’extrait</button>
        <button class="qc-btn" data-act="free">▶ Lecture libre</button>
        <button class="qc-btn" data-act="a">Début ici</button>
        <button class="qc-btn" data-act="b">Fin ici</button>
        <span class="qc-nudge"><button class="qc-btn" data-act="m">−0,5 s</button><button class="qc-btn" data-act="p">+0,5 s</button></span>
      </div>
      <div class="qc-dec">
        <button class="qc-ok" data-act="ok">Valider cet extrait</button>
        <button class="qc-ko" data-act="ko">Écarter du blind test</button>
        ${d ? '<button class="qc-reset" data-act="reset">Remettre à traiter</button>' : ''}
        <a class="qc-full" href="#/s/${esc(it.id)}">Page du son</a>
      </div>
      <p class="qc-msg" id="qc-msg" role="status"></p>`;
    const wave = box.querySelector('#qc-wave');
    const cv = wave.querySelector('canvas');
    ed.wave = wave;
    const showPeaks = (url) =>
      loadPeaks(it, url)
        .then(() => wave.querySelector('.qc-load')?.remove())
        .catch(() => {
          const p = wave.querySelector('.qc-load');
          if (p) p.textContent = 'Forme d’onde indisponible, l’écoute reste possible.';
        });
    if (isYT) {
      // la copie sans publicité du NAS si elle existe, sinon le lecteur YouTube
      media = idle;
      const slot = box.querySelector('.qc-yt > div');
      auth.qcVideoUrl(it.videoId).then((url) => {
        if (!ed || ed.it !== it) return;
        if (url) {
          const v = document.createElement('video');
          v.preload = 'auto';
          v.playsInline = true;
          v.src = url;
          v.addEventListener('loadedmetadata', () => ed?.it === it && (v.currentTime = ed.a), { once: true });
          slot.appendChild(v);
          media = v;
          wave.classList.remove('flat');
          wave.insertAdjacentHTML('beforeend', '<p class="qc-load">Chargement de la forme d’onde…</p>');
          return showPeaks(url);
        }
        createYT(slot).then((y) => {
          if (!ed || ed.it !== it) return y.destroy();
          ytp = y;
          y.cue(it.videoId, ed.a);
          media = y;
        });
      });
    } else {
      media = audio;
      if (audio.dataset.id !== it.id) {
        audio.dataset.id = it.id;
        audio.src = it.src;
      }
    }
    const clamp = () => {
      ed.a = Math.max(0, Math.min(ed.a, ed.dur - 3));
      ed.b = Math.max(ed.a + 3, Math.min(ed.b, ed.dur, ed.a + 30));
    };
    const draw = () => {
      if (!ed || ed.it !== it) return;
      const w = wave.clientWidth;
      const h = wave.clientHeight;
      const dpr = devicePixelRatio || 1;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const x = (t) => (t / ed.dur) * w;
      // passages repérés automatiquement
      g.fillStyle = 'rgba(46, 204, 113, .16)';
      for (const c of auto) g.fillRect(x(c), 0, Math.max(2, x(c + BT_CLIP) - x(c)), h);
      // sélection
      g.fillStyle = 'rgba(213, 0, 0, .28)';
      g.fillRect(x(ed.a), 0, x(ed.b) - x(ed.a), h);
      const pk = peaks.get(it.id);
      if (pk) {
        for (let k = 0; k < w; k++) {
          const v = pk[Math.floor((k / w) * pk.length)];
          const t = (k / w) * ed.dur;
          g.fillStyle = t >= ed.a && t <= ed.b ? '#fff' : '#7a7a7a';
          g.fillRect(k, h / 2 - (v * h) / 2.2, 1, Math.max(1, (v * h) / 1.1));
        }
      }
      // poignées
      g.fillStyle = '#ff3b30';
      for (const t of [ed.a, ed.b]) g.fillRect(x(t) - 1.5, 0, 3, h);
      // tête de lecture
      g.fillStyle = '#ffd60a';
      g.fillRect(x(media.currentTime || 0) - 1, 0, 2, h);
      document.getElementById('qc-pos').textContent = fmtT(media.currentTime || 0);
      document.getElementById('qc-sel').textContent = `Extrait ${fmtT(ed.a)} → ${fmtT(ed.b)} (${(ed.b - ed.a).toFixed(1)} s)`;
    };
    ed.draw = draw;
    const loop = () => {
      draw();
      if (ed?.clipEnd != null && media.currentTime >= ed.clipEnd) {
        media.pause();
        ed.clipEnd = null;
      }
      raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(raf);
    loop();
    if (!isYT) showPeaks();

    // souris et doigt : cliquer = placer la tête de lecture, tirer une poignée = recadrer,
    // tirer dans la sélection = la déplacer, tirer ailleurs = nouvelle sélection
    const tAt = (e) => {
      const r = wave.getBoundingClientRect();
      return Math.max(0, Math.min(ed.dur, ((e.clientX - r.left) / r.width) * ed.dur));
    };
    wave.addEventListener('pointerdown', (e) => {
      const t = tAt(e);
      const px = (ed.dur / wave.clientWidth) * 10; // 10 px de tolérance
      ed.mode = Math.abs(t - ed.a) < px ? 'a' : Math.abs(t - ed.b) < px ? 'b' : t > ed.a && t < ed.b ? 'move' : 'new';
      ed.t0 = t;
      ed.a0 = ed.a;
      ed.b0 = ed.b;
      ed.moved = false;
      wave.setPointerCapture(e.pointerId);
    });
    wave.addEventListener('pointermove', (e) => {
      if (!ed.mode) return;
      const t = tAt(e);
      if (Math.abs(t - ed.t0) > ed.dur / 400) ed.moved = true;
      if (!ed.moved) return;
      if (ed.mode === 'a') ed.a = Math.min(t, ed.b - 3);
      else if (ed.mode === 'b') ed.b = Math.max(t, ed.a + 3);
      else if (ed.mode === 'move') {
        const len = ed.b0 - ed.a0;
        ed.a = Math.max(0, Math.min(ed.dur - len, ed.a0 + t - ed.t0));
        ed.b = ed.a + len;
        return;
      } else {
        ed.a = Math.min(ed.t0, t);
        ed.b = Math.max(ed.t0, t);
      }
      clamp();
    });
    const up = () => {
      if (ed.mode && !ed.moved) media.currentTime = ed.t0;
      if (ed.mode === 'new' && ed.moved && ed.b - ed.a < 3) ed.b = ed.a + BT_CLIP;
      clamp();
      ed.mode = null;
    };
    wave.addEventListener('pointerup', up);
    wave.addEventListener('pointercancel', up);
  }

  const playClipQC = () => {
    if (!ed) return;
    media.currentTime = ed.a;
    ed.clipEnd = ed.b;
    media.play();
  };
  const msg = (t, ok = true) => {
    const m = document.getElementById('qc-msg');
    if (m) {
      m.textContent = t;
      m.className = `qc-msg ${ok ? 'ok' : 'ko'}`;
    }
  };
  const decide = async (status) => {
    if (!ed) return;
    const it = ed.it;
    try {
      decisions[it.id] = status === 'valide' ? await auth.saveClip(it.id, 'valide', +ed.a.toFixed(2), +ed.b.toFixed(2)) : await auth.saveClip(it.id, 'ecarte');
      toast(status === 'valide' ? `Extrait validé : ${it.title}` : `Écarté du blind test : ${it.title}`);
      nextTodo();
    } catch (e) {
      msg(auth.frError(e), false);
    }
  };

  listEl.addEventListener('click', async (e) => {
    const head = e.target.closest('.qc-head');
    if (head) return toggle(head.closest('.qc-row').dataset.id);
    if (!ed) return;
    const au = e.target.closest('[data-auto]');
    if (au) {
      ed.a = +au.dataset.auto;
      ed.b = Math.min(ed.dur, ed.a + BT_CLIP);
      return playClipQC();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'clip') playClipQC();
    else if (act === 'free') {
      ed.clipEnd = null;
      media.paused ? media.play() : media.pause();
    } else if (act === 'a') {
      ed.a = Math.min(media.currentTime, ed.b - 3);
      if (ed.b - ed.a > 30) ed.b = ed.a + 30;
    } else if (act === 'b') {
      ed.b = Math.max(media.currentTime, ed.a + 3);
      if (ed.b - ed.a > 30) ed.a = ed.b - 30;
    } else if (act === 'm' || act === 'p') {
      const dt = act === 'm' ? -0.5 : 0.5;
      const len = ed.b - ed.a;
      ed.a = Math.max(0, Math.min(ed.dur - len, ed.a + dt));
      ed.b = ed.a + len;
    } else if (act === 'ok') decide('valide');
    else if (act === 'ko') decide('ecarte');
    else if (act === 'reset') {
      try {
        await auth.clearClip(ed.it.id);
        delete decisions[ed.it.id];
        toast('Remis à traiter');
        drawList();
      } catch (err) {
        msg(auth.frError(err), false);
      }
    }
  });
  document.getElementById('qc-f').addEventListener('click', (e) => {
    const c = e.target.closest('[data-f]');
    if (!c) return;
    filter = c.dataset.f;
    for (const x of document.querySelectorAll('#qc-f .chip')) x.setAttribute('aria-pressed', String(x === c));
    history.replaceState(null, '', `#/qc?f=${filter}`);
    close();
    drawList();
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!ed || e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        media.paused ? playClipQC() : media.pause();
      } else if (k === 'v') decide('valide');
      else if (k === 'x') decide('ecarte');
      else if (k === 'n') nextTodo();
    },
    { signal: viewAbort.signal },
  );
  addEventListener('resize', () => ed?.draw?.(), { signal: viewAbort.signal });

  auth
    .loadClips()
    .then((d) => {
      decisions = d;
      drawList();
    })
    .catch((e) => (listEl.innerHTML = `<li class="qc-empty">${esc(auth.frError(e))}</li>`));
}

/* ================= Recherche ================= */
function viewSearch(params) {
  main.innerHTML = `<div class="page">
    ${pageHead('Recherche', 'Votre recherche', params.q)}
    <p class="row-label page-sub" id="count" style="margin-top:calc(var(--u) * 14);color:var(--g2)"></p>
    <div class="grid5" id="res"></div>
  </div>${footer()}`;
  const res = document.getElementById('res');
  const draw = (q) => {
    const n = norm(q || '');
    const list = n ? DB.items.filter((i) => norm(`${i.title} ${i.car || ''} ${i.engine} ${i.brands.join(' ')} ${famLabel(i.family)} ${i.credit?.author || ''}`).includes(n)) : DB.items;
    res.innerHTML = list.map((it) => itemCard(it)).join('');
    document.getElementById('count').textContent = n ? `${plural(list.length, 'résultat')} pour « ${q} »` : `${countOf(list)} au total`;
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
  main.innerHTML = `<div class="page page-item">
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
  main.innerHTML = `<div class="page">${pageHead('Silence…', '')}<p class="row-label page-sub" style="margin-top:20px;color:var(--g2)">Cette page n’existe pas ou a été retirée. <a href="#/" style="text-decoration:underline">Retour à l’accueil</a></p></div>`;
}

/* ================= routeur ================= */
function route() {
  for (const fn of cleanup) fn();
  cleanup = [];
  viewAbort.abort();
  viewAbort = new AbortController();
  top.classList.remove('overlay');
  document.body.classList.remove('bare', 'scrolled');
  closeSheet();

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
  const it = page === 's' ? byId(parts[1]) : null;
  const tabKey = page === 's' ? (it?.type === 'audio' ? 'sons' : 'fil') : TAB_OF[page] || '';
  for (const a of document.querySelectorAll('[data-tab]')) {
    const on = a.dataset.tab === tabKey;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  document.body.dataset.page = page;
  document.body.classList.toggle('sub', !ROOTS.has(page));
  track(location.hash);
  parentHash = page === 's' ? (it?.type === 'audio' ? '#/sons' : '#/fil') : PARENT[page] || '#/';
  const titles = { profils: 'Pilotes', connexion: 'Connexion', 'nouveau-mot-de-passe': 'Nouveau mot de passe', categories: 'Catégories', marques: 'Marques', createurs: 'Créateurs', sons: 'Sons', fil: 'Le fil', recherche: 'Recherche', 'a-propos': 'À propos', blindtest: 'Blind test', qc: 'Contrôle qualité' };
  document.title = titles[page] ? `${titles[page]} — VSound` : 'VSound — la musique des moteurs';

  const views = {
    home: () => (!auth.user() ? location.replace('#/connexion') : currentProfile() ? viewHome() : location.replace('#/profils')),
    profils: () => viewProfiles(params),
    connexion: () => viewLogin(params),
    'nouveau-mot-de-passe': () => viewNewPassword(),
    categories: () => viewCategories(),
    c: () => viewCategory(parts[1], parts[2]),
    marques: () => viewBrands(),
    marque: () => viewBrand(parts[1]),
    createurs: () => viewCreators(),
    createur: () => viewCreator(parts[1]),
    explorer: () => viewExplorer(),
    sons: () => viewSons(params),
    fil: () => viewFeed(params),
    recherche: () => viewSearch(params),
    s: () => viewItem(parts[1]),
    'a-propos': () => viewAbout(),
    blindtest: () => viewBlindtest(),
    qc: () => viewQC(params),
  };
  (views[page] || viewNotFound)();
  if (page !== 'fil') window.scrollTo(0, 0);
  const t = main.querySelector('.page-title');
  mTitle.textContent = t ? (t.querySelector('.mb') || t).textContent.replace(/^\|\s*/, '') : '';
}

/* ---------- navigation mobile : retour, titre, lecteur plein écran ---------- */
const ROOTS = new Set(['home', 'explorer', 'sons', 'fil']);
const TAB_OF = { home: 'home', blindtest: 'home', qc: 'home', explorer: 'explorer', categories: 'explorer', c: 'explorer', marques: 'explorer', marque: 'explorer', createurs: 'explorer', createur: 'explorer', recherche: 'explorer', sons: 'sons', fil: 'fil' };
const PARENT = { blindtest: '#/', qc: '#/blindtest', categories: '#/explorer', c: '#/explorer', marques: '#/explorer', marque: '#/marques', createurs: '#/explorer', createur: '#/createurs', recherche: '#/explorer' };
const mTitle = document.getElementById('m-title');
let parentHash = '#/';
const stack = [];
function track(h) {
  if (stack[stack.length - 1] === h) return;
  if (stack[stack.length - 2] === h) stack.pop();
  else stack.push(h);
}
document.getElementById('m-back').addEventListener('click', () => {
  if (stack.length > 1) history.back();
  else location.hash = parentHash;
});
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 44), { passive: true });

const plEl = document.getElementById('player');
function openSheet() {
  plEl.classList.add('full');
  document.body.classList.add('sheet-open');
}
function closeSheet() {
  plEl.classList.remove('full');
  document.body.classList.remove('sheet-open');
}
plEl.addEventListener('click', (e) => {
  if (!isMobile() || plEl.classList.contains('full')) return;
  if (e.target.closest('button, input')) return;
  e.preventDefault();
  openSheet();
});
document.getElementById('pl-down').addEventListener('click', closeSheet);
addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
// En passant d'un format à l'autre, on redessine la page (sauf le fil, pour ne pas couper une vidéo)
MQ.addEventListener('change', () => {
  if (!isMobile()) closeSheet();
  if (document.body.dataset.page !== 'fil') route();
});

async function boot() {
  try {
    const res = await fetch('data/catalogue.json', { cache: 'no-cache' });
    const raw = await res.json();
    DB = prepare(raw);
    DB.all = (raw.items || []).map((it) => ({ brands: [], ...it }));
  } catch (e) {
    main.innerHTML = `<div class="page">${pageHead('Catalogue indisponible', '')}</div>`;
    console.error(e);
    return;
  }
  await auth.init();
  // le lien reçu par e-mail revient avec ?code=… : on nettoie l'adresse
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  auth.onChange(() => {
    renderUser();
    if (['home', 'profils', 'connexion'].includes(document.body.dataset.page)) route();
  });
  renderUser();
  addEventListener('hashchange', route);
  route();
}

boot();
