"""Copie les vidéos YouTube du blind test sur le NAS, pour le contrôle qualité sans publicité.

Pour chaque vidéo YouTube candidate au blind test (passages propres trouvés par tools/qc_audio.py) :
  1. télécharge une version légère (360p max, MP4 avec le son) avec yt-dlp ;
  2. l'envoie dans le bucket privé « qc-media » du Supabase du NAS, sous <videoId>.mp4.

Ces copies ne sont lisibles que par les administrateurs, dans l'outil #/qc ; le site public et le
blind test continuent d'utiliser le lecteur YouTube. Elles ne sont pas incluses dans les sauvegardes.

Usage (la clé de service du NAS n'est jamais écrite dans le dépôt) :
  SB_SERVICE_KEY=... python tools/qc_media.py            # vidéos manquantes seulement
  SB_SERVICE_KEY=... python tools/qc_media.py --only ID  # une vidéo (videoId)
"""

import argparse
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / 'data' / 'catalogue.json'
SB_URL = os.environ.get('SB_URL', 'https://zimaos.tail1780a7.ts.net:10000/vsound')
BUCKET = 'qc-media'
FORMAT = '18/bv*[height<=360][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]'


def api(method, path, key, data=None, ctype='application/json'):
    req = urllib.request.Request(f'{SB_URL}/storage/v1/{path}', data=data, method=method,
                                 headers={'Authorization': f'Bearer {key}', 'apikey': key, 'Content-Type': ctype, 'x-upsert': 'true'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read() or b'null')


def existing(key):
    names, offset = set(), 0
    while True:
        page = api('POST', f'object/list/{BUCKET}', key, json.dumps({'prefix': '', 'limit': 1000, 'offset': offset}).encode())
        names |= {o['name'] for o in page}
        if len(page) < 1000:
            return names
        offset += 1000


def download(vid, tmp):
    import yt_dlp

    out = Path(tmp) / f'{vid}.mp4'
    opts = {'quiet': True, 'no_warnings': True, 'noprogress': True, 'format': FORMAT, 'merge_output_format': 'mp4', 'outtmpl': str(out)}
    with yt_dlp.YoutubeDL(opts) as y:
        y.download([f'https://www.youtube.com/watch?v={vid}'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='videoId à (re)copier')
    a = ap.parse_args()
    key = os.environ.get('SB_SERVICE_KEY')
    if not key:
        sys.exit('SB_SERVICE_KEY manquant (clé de service du Supabase du NAS)')

    items = json.loads(CATALOGUE.read_text(encoding='utf-8'))['items']
    vids = sorted({i['videoId'] for i in items if i['type'] == 'youtube' and i.get('qc', {}).get('clips')})
    have = set() if a.only else existing(key)
    todo = [v for v in vids if (v == a.only if a.only else f'{v}.mp4' not in have)]
    print(f'{len(vids)} vidéos candidates, {len(todo)} à copier', flush=True)
    total = 0
    for n, vid in enumerate(todo, 1):
        try:
            with tempfile.TemporaryDirectory() as tmp:
                f = download(vid, tmp)
                body = f.read_bytes()
                api('POST', f'object/{BUCKET}/{vid}.mp4', key, body, 'video/mp4')
            total += len(body)
            print(f'  [{n}/{len(todo)}] {vid}  {len(body) / 1e6:.1f} Mo', flush=True)
        except Exception as err:
            print(f'  [{n}/{len(todo)}] {vid}  ERREUR {str(err)[:150]}', flush=True)
    print(f'Terminé : {total / 1e6:.0f} Mo envoyés.')


if __name__ == '__main__':
    main()
