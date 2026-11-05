# VSound — la musique des moteurs

Une plateforme dédiée **uniquement** aux sons de moteurs, à écouter comme de la musique classique.

- **Le fil** : vidéos YouTube, Shorts et Reels Instagram à faire défiler verticalement, une par écran.
- **Vidéos** : une galerie filtrable, avec une page individuelle et partageable pour chaque contenu.
- **Sons** : des enregistrements audio crédités, lus à la suite par un lecteur qui continue pendant la navigation (visualiseur, file d'attente, contrôles de l'écran verrouillé).
- **Architectures** : V12, V10, V8, V6, à plat, en ligne, rotatif, hors norme.

Site 100 % statique (HTML, CSS, JavaScript sans dépendance), publié sur GitHub Pages.

## Lancer en local

```bash
python -m http.server 5173
```

Puis ouvrir <http://localhost:5173>. Un serveur est nécessaire : `file://` empêche le chargement du catalogue.

## Ajouter du contenu

Tout le catalogue tient dans [`data/catalogue.json`](data/catalogue.json), avec une entrée par contenu. `id` doit être unique et `family` doit être une des clés de `families`.

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
