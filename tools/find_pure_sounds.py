"""Cherche sur YouTube des vidéos de son moteur pur et les ajoute au catalogue.

Pour chaque voiture de tools/cars.json :
  1. recherche YouTube avec des formules du type « pure sound », « engine sound only », « no music » ;
  2. garde les titres qui citent bien le modèle et annoncent du son pur, sans jeu vidéo, essai,
     podcast, réaction, etc. ; durée entre 40 s et 15 min ; intégration autorisée ;
  3. écoute la vidéo avec le contrôle qualité (tools/qc_audio.py) et n'accepte que le son pur :
     moins de 5 % de voix, moins de 5 % de musique, au moins deux passages propres de 10 s ;
  4. ajoute au plus PER_CAR vidéos par voiture dans data/catalogue.json.

Usage :
  python tools/find_pure_sounds.py               # toutes les voitures
  python tools/find_pure_sounds.py --car "F40"   # une voiture (filtre sur le nom)
  python tools/find_pure_sounds.py --dry-run     # montre les candidats sans rien écouter
"""

import argparse
import json
import re
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qc_audio as qc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CARS = ROOT / 'tools' / 'cars.json'
PER_CAR = 2
TRIES_PER_CAR = 6
QUERIES = ['{q} pure engine sound', '{q} exhaust sound only no music', '{q} pure sound']
PURE = ('pure sound', 'pure engine', 'pure exhaust', 'sound only', 'only sound', 'no music', 'raw sound', 'just sound',
        'engine sound', 'exhaust sound', 'sound check', 'soundcheck', 'sounds', 'sound', 'son pur', 'bruit moteur', 'revs', 'revving',
        'flyby', 'fly by', 'launch', 'accelerat', 'cold start', 'onboard')
BANNED = ('review', 'podcast', 'vlog', 'reaction', 'react', 'test drive', 'gta', 'forza', 'assetto', 'gran turismo 7', 'gt7', 'need for speed',
          'nfs', 'beamng', 'simulator', 'game', 'gameplay', 'lego', 'rc car', 'toy car', 'hot wheels', 'ringtone', 'remix', 'meme', 'how to', 'explained',
          'buying', 'buyer', 'cost', 'price', 'interview', 'unboxing', 'tutorial', 'diy', 'install', 'crash', 'fail', 'drift compilation',
          'top 10', 'top 5', 'tiktok', 'edit', 'phonk', 'music video', 'song', 'ai ', 'animation', 'cartoon', 'f1 2', 'iracing',
          'motorcycle', 'motorbike', 'bike', 'truck', 'tractor', 'boat', 'plane', 'jet')


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if not unicodedata.combining(c))


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', norm(s)).strip('-')


def ydl(opts):
    import yt_dlp

    return yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True, **opts})


def search(q, n=12):
    with ydl({'extract_flat': 'in_playlist'}) as y:
        res = y.extract_info(f'ytsearch{n}:{q}', download=False)
    return [e for e in res.get('entries') or [] if e and e.get('id')]


def title_ok(car, title):
    t = norm(title)
    return any(norm(m) in t for m in car['match']) and any(p in t for p in PURE) and not any(b in t for b in BANNED)


def details(vid):
    with ydl({}) as y:
        return y.extract_info(f'https://www.youtube.com/watch?v={vid}', download=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--car', help='ne traiter que les voitures dont le nom contient ce texte')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    cars = json.loads(CARS.read_text(encoding='utf-8'))
    if a.car:
        cars = [c for c in cars if norm(a.car) in norm(c['car'])]
    cat = json.loads(qc.CATALOGUE.read_text(encoding='utf-8'))
    known = {i.get('videoId') for i in cat['items']}
    ids = {i['id'] for i in cat['items']}
    model = None if a.dry_run else qc.load_model()
    added = []

    for car in cars:
        have = sum(1 for i in cat['items'] if i.get('car') == car['car'] and i['type'] == 'youtube' and i.get('qc', {}).get('verdict') == 'moteur')
        if have >= PER_CAR:
            continue
        cands, seen = [], set()
        for pat in QUERIES:
            try:
                for e in search(pat.format(q=car['query'])):
                    if e['id'] in seen or e['id'] in known:
                        continue
                    seen.add(e['id'])
                    d = e.get('duration') or 0
                    if title_ok(car, e.get('title', '')) and 40 <= d <= 900:
                        cands.append(e)
            except Exception as err:
                print(f'  recherche impossible ({err})', flush=True)
            time.sleep(1)
        print(f"\n{car['car']} : {len(cands)} candidats", flush=True)
        tries = 0
        for e in cands:
            if have >= PER_CAR or tries >= TRIES_PER_CAR:
                break
            print(f"  - {e['id']}  {e.get('title', '')[:80]}", flush=True)
            if a.dry_run:
                continue
            tries += 1
            try:
                info = details(e['id'])
                if info.get('playable_in_embed') is False or info.get('is_live') or info.get('age_limit', 0) >= 18:
                    print('    écarté : intégration interdite ou vidéo restreinte')
                    continue
                with tempfile.TemporaryDirectory() as tmp:
                    res = qc.analyse(qc.decode(qc.fetch({'type': 'youtube', 'videoId': e['id']}, tmp)), *model)
            except Exception as err:
                print(f'    erreur : {str(err)[:120]}')
                continue
            ok = res['verdict'] == 'moteur' and res['speech'] < 0.05 and res['music'] < 0.05 and len(res['clips']) >= 2
            print(f"    voix {res['speech']:.0%}  musique {res['music']:.0%}  silence {res['silence']:.0%}  extraits {len(res['clips'])}  -> {'GARDÉ' if ok else 'refusé'}", flush=True)
            if not ok:
                continue
            w, h = info.get('width') or 16, info.get('height') or 9
            base = slug(f"{car['car']} son pur")
            iid = base if base not in ids else f"{base}-{e['id'][:6].lower()}"
            ids.add(iid)
            known.add(e['id'])
            item = {
                'id': iid,
                'type': 'youtube',
                'videoId': e['id'],
                'vertical': h > w,
                'title': f"{car['car']} — son pur",
                'car': car['car'],
                'engine': car['engine'],
                'family': car['family'],
                'brands': [car['brand']],
                'duration': int(info.get('duration') or 0),
                'credit': {'author': info.get('channel') or info.get('uploader') or 'YouTube', 'source': 'YouTube', 'url': f"https://www.youtube.com/watch?v={e['id']}"},
                'qc': res,
                'found': 'auto',
            }
            cat['items'].append(item)
            added.append(item)
            have += 1
            qc.CATALOGUE.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            time.sleep(2)

    print(f'\n{len(added)} vidéos ajoutées.')
    for i in added:
        print(f"  {i['title']:<55} {i['credit']['author']}  https://youtu.be/{i['videoId']}")


if __name__ == '__main__':
    main()
