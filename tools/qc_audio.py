"""Contrôle qualité des sons de VSound : moteur, parole ou musique ?

Chaque son (MP3) et chaque vidéo YouTube du catalogue est écouté par YAMNet,
un classifieur de sons de Google entraîné sur AudioSet (521 catégories).
Toutes les ~0,5 s, on relève trois scores : moteur, parole, musique.

Résultat écrit dans data/catalogue.json, champ « qc » de chaque contenu :
  engine / speech / music : part du temps où chaque catégorie domine (0 à 1)
  verdict : "moteur", "mixte", "parole" ou "musique"
  clips   : débuts (en secondes) de passages de 10 s où l'on n'entend que le moteur,
            utilisés par le blind test

Usage (Python 3.10 à 3.12) :
  pip install -r tools/requirements-qc.txt
  python tools/qc_audio.py            # analyse seulement les contenus sans « qc » (après un import)
  python tools/qc_audio.py --all      # ré-analyse tout
  python tools/qc_audio.py --report   # affiche le bilan sans rien analyser
"""

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / 'data' / 'catalogue.json'
SR = 16000
HOP = 0.48  # pas de YAMNet, en secondes
CLIP = 10  # durée d'un extrait du blind test
MAX_SECONDS = 600  # au-delà, on n'écoute pas (podcasts, longues vidéos)
UA = 'VSound-qc/1.0 (https://kilianbarbier.github.io/VSound/)'

# Le moteur n'est qu'indicatif : un rotatif à haut régime est souvent pris pour une alarme
# ou un insecte. Le tri repose donc sur ce qu'on ne veut PAS entendre : parole, musique, silence.
ENGINE_NAMES = {'Vehicle', 'Motor vehicle (road)', 'Car', 'Car passing by', 'Race car, auto racing', 'Motorcycle', 'Engine',
                'Light engine (high frequency)', 'Medium engine (mid frequency)', 'Heavy engine (low frequency)', 'Engine knocking',
                'Engine starting', 'Idling', 'Accelerating, revving, vroom', 'Skidding', 'Tire squeal', 'Traffic noise, roadway noise'}
SPEECH_KEYS = ('speech', 'speaking', 'conversation', 'narration', 'babble')
MUSIC_KEYS = ('music', 'musical instrument', 'singing', 'song')


def load_model():
    import tensorflow_hub as hub

    model = hub.load('https://tfhub.dev/google/yamnet/1')
    names = [r['display_name'] for r in csv.DictReader(open(model.class_map_path().numpy().decode(), encoding='utf-8'))]
    low = [n.lower() for n in names]
    pick = lambda keys, excl=(): [i for i, n in enumerate(low) if any(k in n for k in keys) and not any(x in n for x in excl)]
    eng = [i for i, n in enumerate(names) if n in ENGINE_NAMES]
    return model, eng, pick(SPEECH_KEYS), pick(MUSIC_KEYS), names.index('Silence')


def fetch(item, tmp):
    """Télécharge l'audio d'un contenu et renvoie le chemin du fichier."""
    if item['type'] == 'audio':
        out = Path(tmp) / 'a'
        req = urllib.request.Request(item['src'], headers={'User-Agent': UA})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=60) as r, open(out, 'wb') as f:
                    shutil.copyfileobj(r, f)
                time.sleep(4)  # Wikimedia limite le nombre de téléchargements
                return out
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == 5:
                    raise
                wait = int(e.headers.get('Retry-After') or 0) or 30 * (attempt + 1)
                print(f'  Wikimedia demande d’attendre {wait} s', flush=True)
                time.sleep(wait)
    if item['type'] == 'youtube':
        url = f"https://www.youtube.com/watch?v={item['videoId']}"
        subprocess.run(
            [sys.executable, '-m', 'yt_dlp', '-q', '--no-warnings', '-f', 'bestaudio/best', '--download-sections', f'*0-{MAX_SECONDS}',
             '-o', str(Path(tmp) / 'y.%(ext)s'), url],
            check=True,
        )
        return next(Path(tmp).glob('y.*'))
    raise ValueError(f"type inconnu : {item['type']}")


def decode(path):
    import numpy as np

    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-t', str(MAX_SECONDS), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def analyse(wave, model, eng_i, sp_i, mu_i, sil_i):
    import numpy as np

    scores, _, _ = model(wave)
    s = scores.numpy()
    eng = s[:, eng_i].max(axis=1)
    sp = s[:, sp_i].max(axis=1)
    mu = s[:, mu_i].max(axis=1)
    sil = s[:, sil_i]
    n = len(s)
    is_sp = sp > 0.25
    is_mu = (mu > 0.35) & ~is_sp
    is_sil = (sil > 0.5) & ~is_sp & ~is_mu
    is_eng = (eng > 0.2) & ~is_sp & ~is_mu
    share = lambda m: round(float(m.sum()) / max(1, n), 3)
    res = {'engine': share(is_eng), 'speech': share(is_sp), 'music': share(is_mu), 'silence': share(is_sil)}

    # passages de 10 s « propres » : pas la moindre parole ni musique, presque pas de silence
    w = max(1, round(CLIP / HOP))
    clips, k = [], 0
    while k + w <= n:
        seg = slice(k, k + w)
        if sp[seg].max() < 0.15 and mu[seg].max() < 0.25 and is_sil[seg].mean() < 0.2:
            clips.append(round(k * HOP, 1))
            k += w  # extraits sans chevauchement
        else:
            k += 1
    res['clips'] = clips[:12]

    if res['speech'] >= 0.3:
        res['verdict'] = 'parole'
    elif res['music'] >= 0.3:
        res['verdict'] = 'musique'
    elif res['speech'] < 0.08 and res['music'] < 0.1 and res['silence'] < 0.3:
        res['verdict'] = 'moteur'
    else:
        res['verdict'] = 'mixte'
    res['seconds'] = round(len(wave) / SR)
    return res


def report(items):
    rows = [i for i in items if i.get('qc')]
    print(f"\n{len(rows)} contenus analysés sur {len(items)}")
    for v in ('moteur', 'mixte', 'musique', 'parole', 'erreur'):
        sel = [i for i in rows if i['qc'].get('verdict') == v]
        if not sel:
            continue
        print(f"\n== {v} ({len(sel)})")
        for i in sorted(sel, key=lambda x: x['qc'].get('engine', 0)):
            q = i['qc']
            if v == 'erreur':
                print(f"  {i['id']:<55} {q.get('error', '')[:60]}")
            else:
                print(f"  {i['id']:<55} parole {q['speech']:>4.0%}  musique {q['music']:>4.0%}  silence {q.get('silence', 0):>4.0%}  moteur reconnu {q['engine']:>4.0%}  extraits {len(q['clips'])}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true', help='ré-analyser aussi les contenus déjà contrôlés')
    ap.add_argument('--report', action='store_true', help='afficher le bilan seulement')
    ap.add_argument('--only', help='identifiant d’un seul contenu')
    a = ap.parse_args()

    cat = json.loads(CATALOGUE.read_text(encoding='utf-8'))
    items = cat['items']
    if a.report:
        return report(items)
    todo = [i for i in items if (a.all or not i.get('qc') or i['qc'].get('verdict') == 'erreur') and (not a.only or i['id'] == a.only)]
    if not todo:
        print('Rien à analyser.')
        return report(items)
    model, eng_i, sp_i, mu_i, sil_i = load_model()
    for n, it in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {it['id']}", flush=True)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                it['qc'] = analyse(decode(fetch(it, tmp)), model, eng_i, sp_i, mu_i, sil_i)
        except Exception as e:  # le contenu reste marqué, on le retentera au prochain passage
            it['qc'] = {'verdict': 'erreur', 'error': str(e)[:200]}
        # sauvegarde au fil de l'eau
        CATALOGUE.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report(items)


if __name__ == '__main__':
    main()
