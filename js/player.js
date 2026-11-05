// Lecteur audio persistant : file d'attente, contrôles, visualiseur, Media Session.

const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.queue = [];
    this.index = -1;
    this.listeners = new Set();
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.vizTargets = new Set();
    this.el = $('player');

    try {
      const v = parseFloat(localStorage.getItem('vsound.volume'));
      if (v >= 0 && v <= 1) this.audio.volume = v;
    } catch {}
    $('pl-vol').value = this.audio.volume;

    $('pl-play').onclick = () => this.toggle();
    $('pl-prev').onclick = () => this.prev();
    $('pl-next').onclick = () => this.next();
    $('pl-close').onclick = () => this.close();
    $('pl-vol').oninput = (e) => {
      this.audio.volume = +e.target.value;
      try { localStorage.setItem('vsound.volume', e.target.value); } catch {}
    };
    const seek = $('pl-seek');
    let seeking = false;
    seek.oninput = () => { seeking = true; };
    seek.onchange = () => {
      if (isFinite(this.audio.duration)) this.audio.currentTime = (seek.value / 1000) * this.audio.duration;
      seeking = false;
    };
    this.audio.ontimeupdate = () => {
      const d = this.audio.duration;
      if (!seeking && isFinite(d) && d > 0) seek.value = (this.audio.currentTime / d) * 1000;
      $('pl-time').textContent = `${fmt(this.audio.currentTime)} / ${fmt(d)}`;
    };
    this.audio.onplay = () => this.emit();
    this.audio.onpause = () => this.emit();
    this.audio.onended = () => (this.index < this.queue.length - 1 ? this.next() : this.emit());
    this.audio.onerror = () => {
      this.emit({ error: true });
      if (this.index < this.queue.length - 1) setTimeout(() => this.next(), 800);
    };

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => this.audio.play());
      ms.setActionHandler('pause', () => this.audio.pause());
      ms.setActionHandler('previoustrack', () => this.prev());
      ms.setActionHandler('nexttrack', () => this.next());
    }
    this.loop = this.loop.bind(this);
  }

  get current() {
    return this.queue[this.index] || null;
  }

  get playing() {
    return !this.audio.paused && !this.audio.ended;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(extra = {}) {
    this.el.classList.toggle('playing', this.playing);
    $('pl-play').setAttribute('aria-label', this.playing ? 'Pause' : 'Lecture');
    for (const fn of this.listeners) fn({ item: this.current, playing: this.playing, ...extra });
  }

  ensureGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      src.connect(this.analyser).connect(this.ctx.destination);
      this.addViz($('pl-viz'), 'bars');
      requestAnimationFrame(this.loop);
    } catch (e) {
      console.warn('Visualiseur indisponible', e);
    }
  }

  /** Lance une liste de pistes à partir de `start`. */
  playQueue(items, start = 0) {
    this.queue = items.slice();
    this.load(start, true);
  }

  playItem(item, context) {
    const list = context && context.length ? context : [item];
    const i = Math.max(0, list.findIndex((x) => x.id === item.id));
    if (this.current && this.current.id === item.id) return this.toggle();
    this.playQueue(list, i);
  }

  load(i, autoplay) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    const it = this.current;
    this.ensureGraph();
    this.audio.src = it.src;
    this.el.hidden = false;
    document.body.classList.add('has-player');
    $('pl-title').textContent = it.title;
    $('pl-title').href = `#/s/${it.id}`;
    $('pl-sub').textContent = `${it.engine} · ${it.credit.author} (${it.credit.license || it.credit.source})`;
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.engine, album: 'VSound' });
    }
    if (autoplay) this.audio.play().catch(() => this.emit());
    this.emit();
  }

  toggle() {
    if (!this.current) return;
    this.ensureGraph();
    if (this.playing) this.audio.pause();
    else this.audio.play().catch(() => {});
  }

  pause() {
    if (this.playing) this.audio.pause();
  }

  next() {
    if (this.index < this.queue.length - 1) this.load(this.index + 1, true);
  }

  prev() {
    if (this.audio.currentTime > 3 || this.index === 0) this.audio.currentTime = 0;
    else this.load(this.index - 1, true);
  }

  close() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.queue = [];
    this.index = -1;
    this.el.hidden = true;
    document.body.classList.remove('has-player');
    this.emit();
  }

  /** Enregistre un canvas à animer ; renvoie une fonction de désinscription. */
  addViz(canvas, style = 'arc') {
    const t = { canvas, style };
    this.vizTargets.add(t);
    return () => this.vizTargets.delete(t);
  }

  loop() {
    requestAnimationFrame(this.loop);
    if (!this.analyser) return;
    const active = this.playing;
    if (active) this.analyser.getByteFrequencyData(this.data);
    else this.data.fill(0);
    for (const t of this.vizTargets) {
      if (!t.canvas.isConnected) {
        this.vizTargets.delete(t);
        continue;
      }
      draw(t, this.data);
    }
  }
}

function draw({ canvas, style }, data) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // les moteurs vivent surtout dans le bas du spectre : échelle logarithmique
  const n = style === 'bars' ? 28 : 72;
  const maxBin = data.length * 0.6;
  const vals = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(Math.pow(maxBin, i / n));
    const b = Math.max(a + 1, Math.floor(Math.pow(maxBin, (i + 1) / n)));
    let s = 0;
    for (let k = a; k < b; k++) s += data[k];
    vals[i] = s / (b - a) / 255;
  }
  if (style === 'bars') {
    const bw = w / n;
    g.fillStyle = '#d4af6a';
    for (let i = 0; i < n; i++) {
      const bh = Math.max(1.5, vals[i] * h);
      g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    return;
  }
  // style « salle de concert » : ondes symétriques
  const mid = h * 0.5;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(212,175,106,0)');
  grad.addColorStop(0.5, 'rgba(240,211,154,0.9)');
  grad.addColorStop(1, 'rgba(212,175,106,0)');
  g.fillStyle = grad;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, vals[i] * h * 0.42);
    g.fillRect(i * bw + bw * 0.2, mid - bh, bw * 0.6, bh * 2);
  }
}
