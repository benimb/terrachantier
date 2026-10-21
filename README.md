# TerraSuite en ligne : TerraChantier et TerraContacts

Applications de la suite TerraSuite installables sur téléphone, tablette et PC (PWA), qui partagent une même base et une même synchronisation.

- **TerraChantier** (`index.html`) : comptes-rendus de visite, OPR et levée des réserves, photos prises sur le téléphone. Chaque photo porte un texte, une localisation (pièce ou repère, niveau du plan), un ou plusieurs destinataires et un émetteur (par défaut l'architecte du chantier), et se place sur les plans de niveaux (PDF).
- **TerraContacts** (`contacts.html`) : carnet de contacts (maîtres d'ouvrage, AMO, BET, bureaux de contrôle, CSPS, OPC, entreprises, concessionnaires…) et fiche de l'agence. Les intervenants des chantiers et l'attribution des lots s'y puisent. Export Excel et format d'échange `terrasuite-contacts` (JSON) pour les autres applications.

## Organisation pour plusieurs agences
- Aucun cabinet n'est inscrit dans le code : chaque agence renseigne sa fiche (nom, coordonnées, logo, architectes) dans TerraContacts, « Mon agence ».
- Chaque agence utilise son propre projet Supabase (adresse et clé saisies dans les Réglages, script SQL fourni dans l'application) : ses données restent séparées de celles des autres.
- Données sur l'appareil (IndexedDB), synchronisées entre les appareils de l'agence quand le réseau est là.

## Fichiers
`common.js` outils communs · `db.js` base locale · `sync.js` synchronisation · `carnet.js` carnet de contacts · `app.js` TerraChantier · `contacts-app.js` TerraContacts · `plan.js` plans et images · `export.js` PDF et Excel · `style.css` · `sw.js` hors réseau.

Aucune donnée de chantier n'est stockée dans ce dépôt.

Adresse : https://benimb.github.io/terrachantier/ (TerraContacts : https://benimb.github.io/terrachantier/contacts.html)

## Installer sur une tablette ou un PC sous Linux
1. Ouvrir https://benimb.github.io/terrachantier/ dans **Chromium**, **Google Chrome**, **Microsoft Edge** ou **Brave** (Firefox n'installe pas les applications web sous Linux).
2. Bouton « Installer » de l'accueil de TerraChantier, ou menu du navigateur › « Installer TerraChantier » (Chrome : « Caster, enregistrer et partager › Installer la page en tant qu'application »).
3. TerraChantier apparaît dans le menu des applications, s'ouvre en plein écran et fonctionne sans réseau.
4. Première photo : autoriser l'accès à la caméra. La prise de vue est intégrée à l'application (caméra arrière par défaut, bouton « Changer de caméra »).
