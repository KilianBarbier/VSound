// Lecteur YouTube piloté par l'API IFrame, pour le blind test et le contrôle qualité.
// Il expose la même interface qu'un élément <audio> : currentTime, paused, play(), pause().

let apiReady;
function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiReady;
}

export async function createYT(host) {
  const YT = await loadApi();
  const el = document.createElement('div');
  host.appendChild(el);
  let state = -1;
  let ready;
  const whenReady = new Promise((r) => (ready = r));
  const listeners = new Set();
  const p = new YT.Player(el, {
    host: 'https://www.youtube-nocookie.com',
    width: '100%',
    height: '100%',
    playerVars: { controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0, origin: location.origin },
    events: {
      onReady: () => ready(),
      onStateChange: (e) => {
        state = e.data;
        listeners.forEach((f) => f(state));
      },
    },
  });
  await whenReady;
  let current = null;
  return {
    get currentTime() {
      return p.getCurrentTime?.() || 0;
    },
    set currentTime(t) {
      p.seekTo(t, true);
    },
    get duration() {
      return p.getDuration?.() || 0;
    },
    get paused() {
      return state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING;
    },
    get playing() {
      return state === YT.PlayerState.PLAYING;
    },
    get videoId() {
      return current;
    },
    // charge une vidéo à partir d'un instant ; renvoie une promesse résolue quand elle joue vraiment
    load(id, from = 0, { muted = false } = {}) {
      current = id;
      if (muted) p.mute();
      else p.unMute();
      p.loadVideoById({ videoId: id, startSeconds: from });
    },
    cue(id, from = 0) {
      current = id;
      p.cueVideoById({ videoId: id, startSeconds: from });
    },
    play() {
      p.playVideo();
      return Promise.resolve();
    },
    pause() {
      p.pauseVideo();
    },
    mute(on) {
      on ? p.mute() : p.unMute();
    },
    volume(v) {
      p.setVolume(Math.round(v * 100));
    },
    on(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    destroy() {
      listeners.clear();
      try {
        p.destroy();
      } catch {}
    },
  };
}
