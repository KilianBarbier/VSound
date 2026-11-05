import { Player } from './player.js';

const main = document.getElementById('main');
const player = new Player();
let DB = { families: {}, items: [] };
let cleanup = [];

/* ---------------- utilitaires ---------------- */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
  ig: '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM12 2c-2.7 0-3 0-4.1.1C4.2 2.3 2.3 4.2 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.7 2.1 5.6 5.8 5.8 1 .1 1.4.1 4.1.1s3 0 4.1-.1c3.7-.2 5.6-2.1 5.8-5.8.1-1 .1-1.4.1-4.1s0-3-.1-4.1c-.2-3.7-2.1-5.6-5.8-5.8C15 2 14.7 2 12 2z"/></svg>',
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

async function share(item) {
  const url = `${location.origin}${location.pathname}#/s/${item.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${item.title} — VSound`, url });
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

/* ---------------- données ---------------- */
function igCode(url) {
  const m = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

function prepare(raw) {
  const items = [];
  for (const it of raw.items || []) {
    if (it.type === 'instagram') {
      const code = it.code || igCode(it.url);
      if (!code) continue;
      items.push({ ...it, code, vertical: true, credit: { source: 'Instagram', url: it.url, ...(it.credit || {}) } });
    } else if (it.type === 'youtube' || it.type === 'audio') {
      items.push(it);
    }
  }
  return { families: raw.families || {}, items };
}

const visuals = () => DB.items.filter((i) => i.type !== 'audio');
const sounds = () => DB.items.filter((i) => i.type === 'audio');
const famLabel = (f) => DB.families[f] || f || '';
const typeLabel = (it) =>
  it.type === 'audio' ? 'Son' : it.type === 'instagram' ? 'Reel' : it.vertical ? 'Short' : 'Vidéo';

function applyFilters(list, { f, q, t }) {
  let out = list;
  if (f) out = out.filter((i) => i.family === f);
  if (t === 'youtube') out = out.filter((i) => i.type === 'youtube' && !i.vertical);
  if (t === 'short') out = out.filter((i) => i.type === 'youtube' && i.vertical);
  if (t === 'instagram') out = out.filter((i) => i.type === 'instagram');
  if (q) {
    const n = norm(q);
    out = out.filter((i) => norm(`${i.title} ${i.car || ''} ${i.engine} ${i.credit?.author || ''}`).includes(n));
  }
  return out;
}

/* ---------------- fragments ---------------- */
function embedSrc(it, autoplay) {
  if (it.type === 'instagram') return `https://www.instagram.com/reel/${encodeURIComponent(it.code)}/embed/`;
  const p = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1', autoplay: autoplay ? '1' : '0' });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.videoId)}?${p}`;
}

function frameHTML(it, { mounted = false, autoplay = false } = {}) {
  const cls = it.type === 'instagram' ? 'frame ig' : it.vertical ? 'frame vertical' : 'frame';
  if (mounted) return `<div class="${cls}">${iframeHTML(it, autoplay)}</div>`;
  const poster =
    it.type === 'youtube'
      ? `<img class="poster" src="https://i.ytimg.com/vi/${esc(it.videoId)}/hqdefault.jpg" alt="" loading="lazy">`
      : `<div class="poster thumb-ig">${ICON.ig}</div>`;
  return `<div class="${cls}">${poster}<button class="poster-btn" data-mount aria-label="Lire « ${esc(it.title)} »"><span>${ICON.play}</span></button></div>`;
}

function iframeHTML(it, autoplay) {
  const allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  return `<iframe src="${embedSrc(it, autoplay)}" title="${esc(it.title)}" allow="${allow}" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function creditHTML(it, long = false) {
  const c = it.credit || {};
  const who = c.author ? `<b>${esc(c.author)}</b>` : '';
  const src = c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.source || 'source')}</a>` : esc(c.source || '');
  const lic = c.license
    ? c.licenseUrl
      ? ` · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>`
      : ` · ${esc(c.license)}`
    : '';
  if (!long) return `${who}${who && src ? ' — ' : ''}${src}${lic}`;
  const note =
    it.type === 'audio'
      ? c.license
        ? 'Enregistrement réutilisé selon les termes de sa licence, sans modification.'
        : 'Enregistrement crédité à son auteur.'
      : 'Vidéo intégrée via le lecteur officiel ; tous les droits restent à son auteur.';
  return `<div class="credit-box">Crédit : ${who}${who && src ? ' — ' : ''}${src}${lic}<br>${note}</div>`;
}

const ytThumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>';
const searchHTML = (value, placeholder) =>
  `<label class="search-box"><span class="sr">Rechercher</span><input class="search" type="search" placeholder="${esc(placeholder)}" value="${esc(value || '')}"><span>${SEARCH_ICON}</span></label>`;

function cardHTML(it) {
  let thumb;
  if (it.type === 'youtube') {
    thumb = `<img src="${ytThumb(it.videoId)}" alt="" loading="lazy">`;
  } else if (it.type === 'instagram') {
    thumb = `<div class="thumb-ig" style="position:absolute;inset:0">${ICON.ig}</div>`;
  } else {
    thumb = `<div class="thumb-audio"><span>${esc(famLabel(it.family))}</span></div>`;
  }
  return `<a class="card" href="#/s/${esc(it.id)}">
    <div class="thumb">${thumb}<span class="badge">${typeLabel(it)}</span><span class="label">${esc(it.car && it.type !== 'audio' ? it.car : it.title)}</span></div>
    <div class="meta">${esc(it.engine)}${it.credit?.author ? ' · ' + esc(it.credit.author) : ''}</div>
  </a>`;
}

function rowHTML(title, items) {
  return `<div class="row"><h3>${esc(title)}</h3><div class="row-wrap">
    <button class="row-btn" data-row="-1" aria-label="Précédents"><svg viewBox="0 0 24 24"><path d="m15.4 5-7 7 7 7-1.4 1.4L5.6 12 14 3.6z"/></svg></button>
    <div class="row-track">${items.map(cardHTML).join('')}</div>
    <button class="row-btn" data-row="1" aria-label="Suivants"><svg viewBox="0 0 24 24"><path d="m8.6 19 7-7-7-7L10 3.6l8.4 8.4L10 20.4z"/></svg></button>
  </div></div>`;
}

function bindRows(root) {
  root.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-row]');
      if (!b) return;
      const track = b.parentElement.querySelector('.row-track');
      track.scrollBy({ left: +b.dataset.row * track.clientWidth * 0.9, behavior: 'smooth' });
    },
    { signal: viewAbort.signal },
  );
}

function trackHTML(it, n) {
  const cur = player.current && player.current.id === it.id;
  return `<li class="track${cur ? ' playing' : ''}" data-id="${esc(it.id)}">
    <span class="track-n">${String(n).padStart(2, '0')}</span>
    <div>
      <div class="track-title"><a href="#/s/${esc(it.id)}">${esc(it.title)}</a></div>
      <div class="track-sub">${esc(it.engine)}</div>
      <div class="track-credit">${esc(it.credit.author)} · ${esc(it.credit.source)}${it.credit.license ? ' · ' + esc(it.credit.license) : ''}</div>
    </div>
    <span class="track-dur">${fmtDur(it.duration)}</span>
    <button class="ibtn" data-play aria-label="${cur && player.playing ? 'Pause' : 'Écouter'} ${esc(it.title)}">${cur && player.playing ? ICON.pause : ICON.play}</button>
  </li>`;
}

function bindProgramme(root, list) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.track');
    if (!li) return;
    const it = list.find((x) => x.id === li.dataset.id);
    if (it) player.playItem(it, list);
  });
  const refresh = () => {
    for (const li of root.querySelectorAll('.track')) {
      const cur = player.current && player.current.id === li.dataset.id;
      li.classList.toggle('playing', !!cur);
      const b = li.querySelector('[data-play]');
      b.innerHTML = cur && player.playing ? ICON.pause : ICON.play;
    }
  };
  cleanup.push(player.on(refresh));
}

function chipsHTML(active, counts) {
  const fams = Object.keys(DB.families).filter((f) => !counts || counts[f]);
  return [
    `<button class="chip" data-f="" aria-pressed="${!active}">Toutes</button>`,
    ...fams.map(
      (f) => `<button class="chip" data-f="${esc(f)}" aria-pressed="${active === f}">${esc(famLabel(f))}</button>`,
    ),
  ].join('');
}

function countBy(list) {
  const c = {};
  for (const i of list) c[i.family] = (c[i.family] || 0) + 1;
  return c;
}

function setQuery(base, params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  history.replaceState(null, '', `#/${base}${s ? '?' + s : ''}`);
}

const footer = () =>
  `<footer class="foot"><div class="wrap">VSound — la musique des moteurs. Vidéos et enregistrements crédités à leurs auteurs. <a href="#/a-propos">Sources et licences</a>.</div></footer>`;

/* ---------------- vues ---------------- */
function viewHome() {
  const v = visuals();
  const s = sounds();
  const vc = countBy(v);
  const sc = countBy(s);
  const hero = v.find((i) => i.videoId === 'AWLFN0o2sl8') || v[0];
  const evening = ['ferrari-f50', 'lexus-gs-f', 'mazda-rx-7', 'porsche-carrera-gt', 'aston-martin-vulcan', 'alfa-romeo-gtv6', 'audi-rs3', 'ferrari-812-superfast']
    .map((id) => s.find((i) => i.id === id))
    .filter(Boolean);
  // écran rouge : trois programmes audio, illustrés par une vidéo de la même famille
  const picks = [
    ['V12', 'Awi5LQkRfwA'],
    ['V8', 'r0ivLc0rj_I'],
    ['Flat', 'Ca5o7RW2SlA'],
  ].filter(([f]) => sc[f]);
  const rows = ['V12', 'V10', 'Rotary', 'Flat', 'V8', 'Exotic']
    .map((f) => [f, v.filter((i) => i.family === f)])
    .filter(([, l]) => l.length);
  main.innerHTML = `
  <section class="hero">
    <img class="hero-img" src="https://i.ytimg.com/vi/${esc(hero.videoId)}/maxresdefault.jpg" onerror="this.onerror=null;this.src='${ytThumb(hero.videoId)}'" alt="">
    <div class="wrap">
      <h1>Pour certains, c’est du bruit. <em>Pour nous, c’est de la musique.</em></h1>
      <p class="lede">Uniquement des sons de moteurs. ${v.length} vidéos et ${s.length} enregistrements, tous crédités à leurs auteurs.</p>
      <div class="pill-card">
        <span class="avatar">${ICON.play}</span>
        <div><b>${esc(hero.car)}</b><span>${esc(hero.engine)}</span><small>${esc(hero.credit.author)}</small></div>
      </div>
      <div class="pill-actions">
        <a class="btn btn-white" href="#/s/${esc(hero.id)}">Voir la vidéo</a>
        <button class="btn" id="play-all">${ICON.play} Écouter le programme</button>
        <button class="btn btn-square" id="hero-share" aria-label="Partager">${ICON.share}</button>
      </div>
    </div>
  </section>
  <div class="wrap section">
    <div class="section-head"><h2 class="title">Les architectures</h2></div>
    <div class="tiles">${Object.keys(DB.families)
      .map(
        (f) =>
          `<a class="tile" href="#/famille/${esc(f)}"><b>${esc(famLabel(f))}</b><span>${vc[f] || 0} vidéo${(vc[f] || 0) > 1 ? 's' : ''} · ${sc[f] || 0} son${(sc[f] || 0) > 1 ? 's' : ''}</span></a>`,
      )
      .join('')}</div>
  </div>
  <section class="splash">
    <a class="logo logo-xl" href="#/sons" aria-label="Tous les sons"><i>V</i><b>SOUND</b></a>
    <h2 class="title">Choisissez votre programme</h2>
    <div class="squares">${picks
      .map(
        ([f, vid]) =>
          `<button class="square" data-fam="${esc(f)}"><div class="img"><img src="${ytThumb(vid)}" alt="" loading="lazy"></div><b>${esc(famLabel(f))}</b><span>${sc[f]} enregistrement${sc[f] > 1 ? 's' : ''}</span></button>`,
      )
      .join('')}</div>
  </section>
  <div class="wrap section">
    <div class="section-head"><h2 class="title">À l’affiche</h2><a class="btn" href="#/videos">Toutes les vidéos</a></div>
    ${rows.map(([f, l]) => rowHTML(famLabel(f), l)).join('')}
  </div>
  <div class="wrap section">
    <div class="section-head"><h2 class="title">Programme du soir</h2><a class="btn" href="#/sons">Tous les sons</a></div>
    <ol class="programme" id="prog">${evening.map((it, i) => trackHTML(it, i + 1)).join('')}</ol>
  </div>${footer()}`;
  document.getElementById('play-all').onclick = () => player.playQueue(shuffle(s));
  document.getElementById('hero-share').onclick = () => share(hero);
  for (const b of main.querySelectorAll('.square')) {
    b.onclick = () => player.playQueue(shuffle(s.filter((i) => i.family === b.dataset.fam)));
  }
  bindRows(main);
  bindProgramme(document.getElementById('prog'), evening);
}

function viewSons(params) {
  const all = sounds();
  const draw = () => {
    const list = applyFilters(all, params);
    document.getElementById('prog').innerHTML = list.length
      ? list.map((it, i) => trackHTML(it, i + 1)).join('')
      : `<li class="feed-empty">Aucun enregistrement ne correspond.</li>`;
    document.getElementById('count').textContent = `${list.length} enregistrement${list.length > 1 ? 's' : ''}`;
    for (const c of document.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String((c.dataset.f || '') === (params.f || '')));
    setQuery('sons', params);
    return list;
  };
  main.innerHTML = `<div class="wrap section">
    <div class="section-head"><div><h2 class="title">Le programme</h2><p class="lede">Des pistes audio pures, sans image, à écouter à la suite comme un disque. Le lecteur continue pendant que vous naviguez.</p></div>
      <div class="btn-row"><button class="btn btn-white" id="all">${ICON.play} Tout écouter</button><button class="btn" id="shuf">${ICON.shuffle} Aléatoire</button></div></div>
    <div class="filters">${chipsHTML(params.f, countBy(all))}${searchHTML(params.q, 'Rechercher une voiture, un moteur')}</div>
    <p class="meta" id="count"></p>
    <ol class="programme" id="prog"></ol>
  </div>${footer()}`;
  let list = draw();
  const prog = document.getElementById('prog');
  prog.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.track');
    const it = li && list.find((x) => x.id === li.dataset.id);
    if (it) player.playItem(it, list);
  });
  cleanup.push(
    player.on(() => {
      for (const li of prog.querySelectorAll('.track')) {
        const cur = player.current && player.current.id === li.dataset.id;
        li.classList.toggle('playing', !!cur);
        li.querySelector('[data-play]').innerHTML = cur && player.playing ? ICON.pause : ICON.play;
      }
    }),
  );
  main.querySelector('.filters').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    params.f = c.dataset.f;
    list = draw();
  });
  main.querySelector('.search').addEventListener('input', (e) => {
    params.q = e.target.value.trim();
    list = draw();
  });
  document.getElementById('all').onclick = () => list.length && player.playQueue(list);
  document.getElementById('shuf').onclick = () => list.length && player.playQueue(shuffle(list));
}

function viewVideos(params) {
  const all = visuals();
  const types = [
    ['', 'Tout'],
    ['youtube', 'Vidéos'],
    ['short', 'Shorts'],
    ['instagram', 'Reels'],
  ].filter(([t]) => !t || applyFilters(all, { t }).length);
  const draw = () => {
    const list = applyFilters(all, params);
    document.getElementById('grid').innerHTML = list.length
      ? list.map(cardHTML).join('')
      : `<p class="feed-empty">Aucune vidéo ne correspond.</p>`;
    for (const c of main.querySelectorAll('[data-f]')) c.setAttribute('aria-pressed', String((c.dataset.f || '') === (params.f || '')));
    for (const c of main.querySelectorAll('[data-t]')) c.setAttribute('aria-pressed', String((c.dataset.t || '') === (params.t || '')));
    document.getElementById('to-feed').href = `#/fil${params.f || params.t ? '?' + new URLSearchParams(Object.fromEntries(Object.entries({ f: params.f, t: params.t }).filter(([, v]) => v))) : ''}`;
    setQuery('videos', params);
  };
  main.innerHTML = `<div class="wrap section">
    <div class="section-head"><div><h2 class="title">Choisissez votre vidéo</h2><p class="lede">Chaque vidéo a sa propre page. Pour les enchaîner sans fin, ouvrez le fil.</p></div>
      <a class="btn btn-white" id="to-feed" href="#/fil">Parcourir en fil</a></div>
    <div class="filters">${types.map(([t, l]) => `<button class="chip" data-t="${t}">${l}</button>`).join('')}</div>
    <div class="filters">${chipsHTML(params.f, countBy(all))}${searchHTML(params.q, 'Rechercher une vidéo')}</div>
    <div class="grid" id="grid"></div>
  </div>${footer()}`;
  draw();
  if (params.focus) {
    delete params.focus;
    main.querySelector('.search').focus();
    setQuery('videos', params);
  }
  main.addEventListener(
    'click',
    (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      if ('f' in c.dataset) params.f = c.dataset.f;
      if ('t' in c.dataset) params.t = c.dataset.t;
      draw();
    },
    { signal: viewAbort.signal },
  );
  main.querySelector('.search').addEventListener('input', (e) => {
    params.q = e.target.value.trim();
    draw();
  });
}

function viewFeed(params) {
  const all = visuals();
  const list = applyFilters(all, params);
  const counts = countBy(all);
  const types = [
    ['', 'Tout'],
    ['youtube', 'Vidéos'],
    ['short', 'Shorts'],
    ['instagram', 'Reels'],
  ].filter(([t]) => !t || applyFilters(all, { t }).length);
  main.innerHTML = `
    <div class="feed-bar" role="toolbar" aria-label="Filtres du fil">
      ${types.map(([t, l]) => `<button class="chip" data-t="${t}" aria-pressed="${(params.t || '') === t}">${l}</button>`).join('')}
      <span class="sep"></span>
      ${chipsHTML(params.f, counts)}
    </div>
    <div class="feed" id="feed" tabindex="0" aria-label="Fil de vidéos, faites défiler">
      ${
        list.length
          ? list
              .map(
                (it, i) => `<section class="slide" data-i="${i}" aria-label="${esc(it.title)}">
          <div class="stage">${frameHTML(it)}</div>
          <div class="caption">
            <div>
              <span class="badge">${typeLabel(it)} · ${esc(famLabel(it.family))}</span>
              <h2><a href="#/s/${esc(it.id)}" style="color:inherit">${esc(it.title)}</a></h2>
              <div class="meta">${esc(it.car || '')}${it.car ? ' · ' : ''}${esc(it.engine)}</div>
              <div class="credit">${creditHTML(it)}</div>
            </div>
            <div class="feed-nav">
              <button class="ibtn" data-share aria-label="Partager">${ICON.share}</button>
              <button class="ibtn" data-prev aria-label="Précédente">${ICON.up}</button>
              <button class="ibtn" data-next aria-label="Suivante">${ICON.down}</button>
            </div>
          </div>
        </section>`,
              )
              .join('')
          : `<div class="feed-empty">Rien dans cette catégorie pour l’instant.</div>`
      }
    </div>`;

  const feed = document.getElementById('feed');
  const slides = [...feed.querySelectorAll('.slide')];
  let active = -1;
  let started = false;

  const mount = (i, autoplay) => {
    const it = list[i];
    const stage = slides[i].querySelector('.stage');
    stage.innerHTML = frameHTML(it, { mounted: true, autoplay });
    player.pause();
  };
  const unmount = (i) => {
    const stage = slides[i].querySelector('.stage');
    if (stage.querySelector('iframe')) stage.innerHTML = frameHTML(list[i]);
  };
  const activate = (i) => {
    if (i === active) return;
    if (active >= 0) unmount(active);
    active = i;
    if (started) mount(i, true);
    const it = list[i];
    history.replaceState(null, '', `#/fil?${new URLSearchParams(Object.fromEntries(Object.entries({ f: params.f, t: params.t, id: it.id }).filter(([, v]) => v)))}`);
  };
  const go = (d) => {
    const j = Math.min(slides.length - 1, Math.max(0, (active < 0 ? 0 : active) + d));
    slides[j]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) activate(+e.target.dataset.i);
    },
    { root: feed, threshold: 0.6 },
  );
  slides.forEach((s) => io.observe(s));
  cleanup.push(() => io.disconnect());

  feed.addEventListener('click', (e) => {
    const slide = e.target.closest('.slide');
    if (!slide) return;
    const i = +slide.dataset.i;
    if (e.target.closest('[data-mount]')) {
      started = true;
      active = i;
      mount(i, true);
    } else if (e.target.closest('[data-next]')) go(1);
    else if (e.target.closest('[data-prev]')) go(-1);
    else if (e.target.closest('[data-share]')) share(list[i]);
  });
  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) {
      e.preventDefault();
      go(1);
    } else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) {
      e.preventDefault();
      go(-1);
    }
  };
  document.addEventListener('keydown', onKey, { signal: viewAbort.signal });

  main.querySelector('.feed-bar').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const p = { f: params.f, t: params.t };
    if ('f' in c.dataset) p.f = c.dataset.f;
    if ('t' in c.dataset) p.t = c.dataset.t;
    location.hash = `#/fil?${new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)))}`;
  });

  const start = params.id ? list.findIndex((i) => i.id === params.id) : -1;
  if (start > 0) {
    started = true;
    requestAnimationFrame(() => slides[start].scrollIntoView({ block: 'start' }));
  }
}

function viewFamily(fam) {
  const v = visuals().filter((i) => i.family === fam);
  const s = sounds().filter((i) => i.family === fam);
  main.innerHTML = `<div class="wrap section">
    <p class="crumbs"><a href="#/">Accueil</a> / Architecture</p>
    <div class="section-head"><h2 class="title">${esc(famLabel(fam))}</h2>
      <div class="btn-row">${s.length ? `<button class="btn btn-white" id="all">${ICON.play} Écouter les ${s.length} sons</button>` : ''}${v.length ? `<a class="btn" href="#/fil?f=${esc(fam)}">Fil ${esc(famLabel(fam))}</a>` : ''}</div></div>
    ${v.length ? `<div class="grid">${v.map(cardHTML).join('')}</div>` : ''}
    ${s.length ? `<h2 class="title" style="margin:44px 0 16px">Enregistrements</h2><ol class="programme" id="prog">${s.map((it, i) => trackHTML(it, i + 1)).join('')}</ol>` : ''}
    ${!v.length && !s.length ? '<p class="feed-empty">Rien ici pour l’instant.</p>' : ''}
  </div>${footer()}`;
  if (s.length) {
    document.getElementById('all').onclick = () => player.playQueue(s);
    bindProgramme(document.getElementById('prog'), s);
  }
  document.title = `${famLabel(fam)} — VSound`;
}

function viewItem(id) {
  const it = DB.items.find((i) => i.id === id);
  if (!it) return viewNotFound();
  const sameType = it.type === 'audio' ? sounds() : visuals();
  const idx = sameType.indexOf(it);
  const prev = sameType[idx - 1];
  const next = sameType[idx + 1];
  const related = shuffle(DB.items.filter((i) => i.family === it.family && i.id !== it.id)).slice(0, 6);
  const media =
    it.type === 'audio'
      ? `<div class="audio-stage" id="astage"><canvas id="aviz"></canvas><button class="big-play" id="bigplay" aria-label="Écouter">${ICON.play.replace('<svg', '<svg class="i-play"')}${ICON.pause.replace('<svg', '<svg class="i-pause"')}</button></div>`
      : frameHTML(it, { mounted: true, autoplay: false });
  const section = it.type === 'audio' ? ['sons', 'Sons'] : ['videos', 'Vidéos'];
  main.innerHTML = `<div class="wrap item-page">
    <p class="crumbs"><a href="#/">Accueil</a> / <a href="#/${section[0]}">${section[1]}</a> / <a href="#/famille/${esc(it.family)}">${esc(famLabel(it.family))}</a></p>
    <div class="item-layout">
      <div class="item-media">${media}</div>
      <div class="item-info">
        <span class="badge">${typeLabel(it)}</span>
        <h1>${esc(it.title)}</h1>
        <dl class="facts">
          ${it.car ? `<dt>Voiture</dt><dd>${esc(it.car)}</dd>` : ''}
          <dt>Moteur</dt><dd>${esc(it.engine)}</dd>
          <dt>Architecture</dt><dd><a href="#/famille/${esc(it.family)}">${esc(famLabel(it.family))}</a></dd>
          ${it.duration ? `<dt>Durée</dt><dd>${fmtDur(it.duration)}</dd>` : ''}
        </dl>
        ${creditHTML(it, true)}
        <div class="btn-row">
          <button class="btn" id="share">${ICON.share} Partager</button>
          ${it.type !== 'audio' ? `<a class="btn" href="#/fil?id=${esc(it.id)}">Ouvrir dans le fil</a>` : ''}
        </div>
        <div class="btn-row" style="margin-top:10px">
          ${prev ? `<a class="btn" href="#/s/${esc(prev.id)}">← Précédent</a>` : ''}
          ${next ? `<a class="btn" href="#/s/${esc(next.id)}">Suivant →</a>` : ''}
        </div>
      </div>
    </div>
    ${related.length ? `<section class="related"><h2 class="title">Dans la même famille</h2><div class="grid">${related.map(cardHTML).join('')}</div></section>` : ''}
  </div>${footer()}`;
  document.getElementById('share').onclick = () => share(it);
  document.title = `${it.title} — VSound`;
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

function viewAbout() {
  const rows = DB.items
    .map(
      (it) =>
        `<tr><td><a href="#/s/${esc(it.id)}">${esc(it.title)}</a></td><td>${typeLabel(it)}</td><td>${esc(it.credit?.author || '')}</td><td>${it.credit?.url ? `<a href="${esc(it.credit.url)}" target="_blank" rel="noopener">${esc(it.credit.source)}</a>` : esc(it.credit?.source || '')}</td><td>${esc(it.credit?.license || 'Intégration officielle')}</td></tr>`,
    )
    .join('');
  main.innerHTML = `<div class="wrap section prose">
    <h2 class="title" style="margin-top:0;font-size:clamp(24px,4vw,40px)">Un conservatoire du son mécanique</h2>
    <p>VSound est consacré à une seule chose : le son des moteurs. Pas d’essais, pas de fiches techniques interminables. Seulement des montées en régime, des démarrages à froid, des passages à pleine charge, à écouter comme on écoute un orchestre.</p>
    <h2 class="title">D’où viennent les sons</h2>
    <ul>
      <li><b>Vidéos YouTube et Reels Instagram</b> : intégrés avec les lecteurs officiels des plateformes. Ils restent hébergés chez leurs auteurs, à qui reviennent les vues et tous les droits.</li>
      <li><b>Enregistrements audio</b> : des fichiers publiés sous licence libre, principalement la collection « engine and exhaust sound » de Wikimedia Commons (CC BY 3.0). L’auteur, la source et la licence de chaque piste sont indiqués partout où elle apparaît.</li>
    </ul>
    <p>Vous êtes l’auteur d’un contenu présent ici et souhaitez qu’il soit retiré ? Ouvrez une demande sur le dépôt GitHub du projet : il le sera sans discussion.</p>
    <h2 class="title">Ajouter un son</h2>
    <p>Tout le catalogue tient dans le fichier <code>data/catalogue.json</code>. Une entrée par contenu :</p>
    <pre>{ "id": "ma-voiture", "type": "instagram",
  "url": "https://www.instagram.com/reel/XXXXXXXXX/",
  "title": "…", "car": "…", "engine": "V12 6,5 L", "family": "V12",
  "credit": { "author": "@compte", "source": "Instagram",
              "url": "https://www.instagram.com/reel/XXXXXXXXX/" } }</pre>
    <p>Les types possibles sont <code>youtube</code> (avec <code>videoId</code>, et <code>vertical: true</code> pour un Short), <code>instagram</code> (avec <code>url</code>) et <code>audio</code> (avec <code>src</code> vers un MP3 et une <code>credit.license</code>).</p>
    <h2 class="title">Crédits complets</h2>
    <div class="credits-wrap"><table class="credits-table"><thead><tr><th>Pièce</th><th>Type</th><th>Auteur</th><th>Source</th><th>Licence</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>${footer()}`;
}

function viewNotFound() {
  main.innerHTML = `<div class="wrap section"><h2 class="title">Silence…</h2><p class="lede">Cette page n’existe pas ou a été retirée.</p><p><a class="btn" href="#/">Retour à l’accueil</a></p></div>`;
}

/* ---------------- routeur ---------------- */
let viewAbort = new AbortController();

function route() {
  for (const fn of cleanup) fn();
  cleanup = [];
  viewAbort.abort();
  viewAbort = new AbortController();

  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const page = parts[0] || 'home';

  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === page;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = 'VSound — la musique des moteurs';

  switch (page) {
    case 'home':
      viewHome();
      break;
    case 'fil':
      viewFeed(params);
      document.title = 'Le fil — VSound';
      break;
    case 'videos':
      viewVideos(params);
      document.title = 'Vidéos — VSound';
      break;
    case 'sons':
      viewSons(params);
      document.title = 'Sons — VSound';
      break;
    case 'famille':
      viewFamily(parts[1]);
      break;
    case 's':
      viewItem(parts[1]);
      break;
    case 'a-propos':
      viewAbout();
      document.title = 'À propos — VSound';
      break;
    default:
      viewNotFound();
  }
  if (page !== 'fil') window.scrollTo(0, 0);
}

async function boot() {
  try {
    const res = await fetch('data/catalogue.json', { cache: 'no-cache' });
    DB = prepare(await res.json());
  } catch (e) {
    main.innerHTML = `<div class="wrap section"><h2>Catalogue indisponible</h2><p class="lede">Impossible de charger data/catalogue.json.</p></div>`;
    console.error(e);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

boot();
