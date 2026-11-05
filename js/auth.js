// Comptes VSound (Supabase) : un compte = une adresse e-mail, avec jusqu'à cinq pilotes.
// Les marques et créateurs suivis sont enregistrés par pilote, sur le serveur.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

// Supabase auto-hébergé sur le NAS, publié par Tailscale Funnel sous /vsound.
// En local, un tunnel SSH peut le remplacer : localStorage['vsound.dev_sb_url'] = 'http://localhost:3790'
const NAS_URL = 'https://zimaos.tail1780a7.ts.net:10000/vsound';
const devUrl = () => {
  try { return location.hostname === 'localhost' ? localStorage.getItem('vsound.dev_sb_url') : null; } catch { return null; }
};
const SB_URL = devUrl() || NAS_URL;
// clé publique « anon » : elle ne donne accès qu'à ce que les règles d'accès autorisent
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzOTA3NjAwLCJleHAiOjIxMDkyNjc2MDB9.ljVN173lc75lH-oj41VSAYyhLRO2hUiiJQvS02Cw-Jw';
export const sb = createClient(SB_URL, KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export const MAX_PILOTS = 5;
const PILOT_KEY = 'vsound.pilot';

const state = { user: null, pilots: [], follows: new Set(), recovery: false };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
export const onChange = (f) => listeners.add(f);

export const user = () => state.user;
export const pilots = () => state.pilots;
export const isRecovery = () => state.recovery;
export const following = () => state.follows;
export function currentPilot() {
  let id;
  try { id = localStorage.getItem(PILOT_KEY); } catch {}
  return state.pilots.find((p) => p.id === id) || null;
}

async function loadPilots() {
  if (!state.user) { state.pilots = []; return; }
  const { data, error } = await sb.from('pilots').select('id,name,photo,created_at').order('created_at');
  if (error) throw error;
  state.pilots = data;
}
async function loadFollows() {
  const p = currentPilot();
  state.follows = new Set();
  if (!p) return;
  const { data, error } = await sb.from('follows').select('name').eq('pilot_id', p.id);
  if (!error) state.follows = new Set(data.map((r) => r.name));
}

export async function init() {
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  try { await loadPilots(); await loadFollows(); } catch (e) { console.error(e); }
  sb.auth.onAuthStateChange((event, session) => {
    const before = state.user?.id;
    state.user = session?.user || null;
    if (event === 'PASSWORD_RECOVERY') { state.recovery = true; location.hash = '#/nouveau-mot-de-passe'; }
    if (state.user?.id !== before) {
      // hors du rappel : Supabase déconseille d'attendre ses propres requêtes ici
      setTimeout(async () => {
        try { await loadPilots(); await loadFollows(); } catch (e) { console.error(e); }
        emit();
      });
    }
  });
}

/* ---------- compte ---------- */
const redirect = () => location.origin + location.pathname;
const FR = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'Email not confirmed': 'Confirme d’abord ton adresse : ouvre le lien reçu par e-mail.',
  'User already registered': 'Un compte existe déjà avec cette adresse.',
  'Password should be at least 6 characters.': 'Le mot de passe doit faire au moins 6 caractères.',
};
export const frError = (e) => {
  const m = e?.message || String(e);
  if (FR[m]) return FR[m];
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (/Unable to validate email|invalid format|email address .* is invalid/i.test(m)) return 'Adresse e-mail invalide.';
  if (/Password should|weak password/i.test(m)) return 'Mot de passe trop faible : au moins 6 caractères.';
  if (/Cinq pilotes/.test(m)) return 'Cinq pilotes maximum par compte.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Pas de connexion au serveur. Vérifie ton réseau.';
  return m;
};

export async function signUp(name, email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirect() } });
  if (error) throw error;
  // Adresse déjà utilisée : Supabase renvoie un utilisateur sans identité, sans erreur
  if (data.user && !data.user.identities?.length) throw new Error('User already registered');
  return { confirm: !data.session };
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await settle();
}
export async function signOut() {
  await sb.auth.signOut();
  try { localStorage.removeItem(PILOT_KEY); } catch {}
  state.user = null; state.pilots = []; state.follows = new Set();
  emit();
}
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (error) throw error;
}
export async function setPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
  state.recovery = false;
}
// après une connexion, on attend que les pilotes soient chargés
async function settle() {
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  await loadPilots();
  await loadFollows();
}

/* ---------- pilotes ---------- */
export async function choosePilot(id) {
  try { localStorage.setItem(PILOT_KEY, id); } catch {}
  await loadFollows();
  emit();
}
export async function addPilot(name) {
  const { data, error } = await sb.from('pilots').insert({ name }).select('id,name,photo,created_at').single();
  if (error) throw error;
  state.pilots.push(data);
  return data;
}
export async function editPilot(id, fields) {
  const { error } = await sb.from('pilots').update(fields).eq('id', id);
  if (error) throw error;
  Object.assign(state.pilots.find((p) => p.id === id), fields);
  emit();
}

/* ---------- photos de profil ---------- */
export const photoUrl = (p) => (p?.photo ? sb.storage.from('avatars').getPublicUrl(p.photo).data.publicUrl : null);

// recadre au carré et réduit à 400 px avant l'envoi
async function squareJpeg(file) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(400, side);
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Image illisible'))), 'image/jpeg', 0.86));
}
export async function setPhoto(pilot, file) {
  const blob = await squareJpeg(file);
  const path = `${state.user.id}/${pilot.id}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  const old = pilot.photo;
  await editPilot(pilot.id, { photo: path });
  if (old) sb.storage.from('avatars').remove([old]);
}
export async function clearPhoto(pilot) {
  const old = pilot.photo;
  await editPilot(pilot.id, { photo: null });
  if (old) sb.storage.from('avatars').remove([old]);
}
export async function removePilot(id) {
  const old = state.pilots.find((p) => p.id === id)?.photo;
  const { error } = await sb.from('pilots').delete().eq('id', id);
  if (error) throw error;
  if (old) sb.storage.from('avatars').remove([old]);
  state.pilots = state.pilots.filter((p) => p.id !== id);
  if (currentPilot() === null) { try { localStorage.removeItem(PILOT_KEY); } catch {} state.follows = new Set(); }
  emit();
}

/* ---------- abonnements ---------- */
export async function toggleFollow(name) {
  const p = currentPilot();
  if (!p) throw new Error('Choisis d’abord un pilote.');
  const on = !state.follows.has(name);
  on ? state.follows.add(name) : state.follows.delete(name);
  const { error } = on
    ? await sb.from('follows').insert({ pilot_id: p.id, name })
    : await sb.from('follows').delete().eq('pilot_id', p.id).eq('name', name);
  if (error && error.code !== '23505') {
    on ? state.follows.delete(name) : state.follows.add(name);
    throw error;
  }
  return on;
}
