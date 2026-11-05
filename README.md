# VSound — la musique des moteurs

Une plateforme dédiée **uniquement** aux sons de moteurs, à écouter comme de la musique classique.

Le design reprend la maquette Figma « The VHub » (pages Home, Categories, Brands, Creators et l'écran rouge de sélection) ; ses visuels sont dans `assets/vhub/`.

- **Accueil** : héros en carrousel avec carte créateur, puis les marques et des rangées de contenus.
- **Catégories** : architecture (V12, V10, V8…), pays d'origine et format, en rangées à chevrons.
- **Marques** et **Créateurs** : chaque marque et chaque auteur a sa page.
- **Sons** : des enregistrements audio crédités, lus à la suite par un lecteur qui continue pendant la navigation (visualiseur, file d'attente, contrôles de l'écran verrouillé).
- **Le fil** : vidéos YouTube, Shorts et Reels Instagram à faire défiler verticalement, une par écran.
- Chaque contenu a sa page individuelle, partageable (`#/s/<id>`).
- **Sur téléphone** (moins de 640 px), une interface pensée pour le mobile prend le relais ([`css/mobile.css`](css/mobile.css)) : onglets en bas (Accueil, Explorer, Sons, Le fil), carrousel au doigt, mini-lecteur flottant qui s'ouvre en plein écran, fil vidéo en plein écran.
- **Comptes** ([`js/auth.js`](js/auth.js), Supabase auto-hébergé sur un NAS) : inscription par e-mail et mot de passe, jusqu'à cinq pilotes par compte avec leur propre photo, abonnements enregistrés par pilote et retrouvés sur tous les appareils. Les pages restent consultables sans compte.
- **Blind test** (`#/blindtest`) : 10 extraits de 10 secondes tirés des enregistrements audio, il faut deviner la marque entre deux propositions à la fin de chaque extrait. Score, récapitulatif et record gardé sur l'appareil.

Site 100 % statique (HTML, CSS, JavaScript sans dépendance), publié sur GitHub Pages.

## Lancer en local

```bash
python -m http.server 5173
```

Puis ouvrir <http://localhost:5173>. Un serveur est nécessaire : `file://` empêche le chargement du catalogue.

## Ajouter du contenu

Tout le catalogue tient dans [`data/catalogue.json`](data/catalogue.json), avec une entrée par contenu. `id` doit être unique et `family` doit être une des clés de `families`. Ajoutez `"brands": ["Ferrari"]` pour rattacher un contenu à une marque (le pays d'origine en découle), et `"thumb"` pour donner une vignette à un enregistrement audio.

```jsonc
// Vidéo YouTube (ajouter "vertical": true pour un Short)
{ "id": "lfa-v10", "type": "youtube", "videoId": "AWLFN0o2sl8",
  "title": "…", "car": "Lexus LFA", "engine": "V10 4,8 L", "family": "V10",
  "credit": { "author": "Nom de la chaîne", "source": "YouTube", "url": "https://www.youtube.com/watch?v=AWLFN0o2sl8" } }

// Reel Instagram
{ "id": "mon-reel", "type": "instagram", "url": "https://www.instagram.com/reel/XXXXXXXXXXX/",
  "title": "…", "car": "…", "engine": "…", "family": "V12",
  "credit": { "author": "@compte", "source": "Instagram", "url": "https://www.instagram.com/reel/XXXXXXXXXXX/" } }

// Enregistrement audio (MP3 hébergé ailleurs, ou déposé dans /audio)
{ "id": "ma-piste", "type": "audio", "src": "audio/ma-piste.mp3", "duration": 92,
  "title": "…", "engine": "…", "family": "V8",
  "credit": { "author": "…", "source": "…", "url": "…", "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/" } }
```

Un MP3 hébergé sur un autre domaine doit autoriser le CORS (`Access-Control-Allow-Origin`), sinon il ne pourra pas être lu par le lecteur et son visualiseur.

## Sources et licences

- **Audio** : collection « engine and exhaust sound » de [Wikimedia Commons](https://commons.wikimedia.org/), sous licence CC BY 3.0. L'auteur, la source et la licence sont affichés sur chaque piste et dans la page « À propos ».
- **Vidéos** : intégrées via les lecteurs officiels de YouTube (mode confidentialité renforcée `youtube-nocookie.com`) et d'Instagram. Elles restent hébergées par leurs auteurs.

Un auteur souhaite le retrait d'un contenu ? Ouvrez une *issue* : il sera retiré.

## Contrôle qualité des sons

Tout ce qui entre dans le catalogue n'est pas forcément du son moteur : certaines vidéos sont des essais commentés, des podcasts ou des montages en musique. [`tools/qc_audio.py`](tools/qc_audio.py) écoute chaque son et chaque vidéo avec YAMNet, le classifieur de sons de Google, et classe chaque demi-seconde en parole, musique, silence ou moteur. Il écrit le résultat dans le champ `qc` de chaque contenu de `data/catalogue.json` :

- `verdict` vaut `moteur`, `mixte`, `parole` ou `musique`. Les contenus `parole` et `musique` sont écartés du site. Pour en garder un quand même, ajoute `"qcOk": true` sur ce contenu.
- `clips` donne les débuts des passages de 10 secondes sans voix ni musique. Le blind test ne joue que ces passages.

Après chaque import, lance cette commande, qui n'analyse que les nouveaux contenus :

```
pip install -r tools/requirements-qc.txt   # Python 3.10 à 3.12
python tools/qc_audio.py
```

Pour ré-analyser tout le catalogue, ajoute `--all`. Pour afficher le bilan sans rien relancer, utilise `--report`.

### Contrôle qualité à la main (`#/qc`)

Les administrateurs ont accès à une page de contrôle, depuis l'écran du blind test ou celui des pilotes. Elle liste tous les sons, y compris ceux que le script a écartés. Pour chacun, tu peux :

- écouter le son, avec sa forme d'onde et les passages sans voix repérés par le script (en vert) ;
- recadrer l'extrait du blind test, entre 3 et 30 secondes, en tirant les bords ou en déplaçant la zone rouge ;
- le valider avec son recadrage, ou l'écarter du blind test. Les raccourcis sont `Espace`, `V`, `X` et `N`.

Les décisions sont enregistrées sur le Supabase du NAS, dans la table `bt_clips`. Le blind test les applique tout de suite. Un son non traité garde le passage repéré par le script. Pour ajouter un administrateur, insère son identifiant dans la table `admins`.
