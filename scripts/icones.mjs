import { readFile, writeFile } from "node:fs/promises";

import sharp from "sharp";

/**
 * Fabrique les icônes d'application à partir d'un seul fichier source.
 *
 *   npm run icones
 *
 * ⚠️ **Trois fichiers, une seule vérité.** Next sert `favicon.ico`, `icon.png`
 * et `apple-icon.png` depuis `src/app/` par convention, et rien ne les relie
 * entre eux : remplacer l'un à la main et oublier les deux autres donne un
 * onglet et un écran d'accueil qui ne portent pas la même marque — sans qu'une
 * erreur n'apparaisse nulle part. Ce script les dérive tous les trois de
 * `public/images/marque-enievent.png`, qui devient la source de référence.
 *
 * Trois décisions qui ne sautent pas aux yeux :
 *
 * 1. **Le fond reste blanc et opaque.** Les intervalles entre les volutes du
 *    logo *sont* blancs : les rendre transparents percerait la marque de
 *    trous. Et une icône d'accueil iOS transparente est composée sur du noir.
 * 2. **Le dessin est recadré.** Dans le fichier d'origine il n'occupe que 56 %
 *    de la largeur ; conservé tel quel, il serait illisible à 16 px. On le
 *    cadre sur son contenu, avec une marge d'environ 8 %.
 * 3. **Aucun arrondi n'est appliqué.** iOS découpe lui-même l'icône d'accueil ;
 *    un arrondi ajouté ici se verrait découpé une seconde fois.
 *
 * Le `.ico` est assemblé à la main : `sharp` n'écrit pas ce format. Un ICO est
 * un en-tête, un répertoire, puis les images bout à bout — ici trois PNG, ce
 * que tous les navigateurs actuels lisent.
 */

const SOURCE = "public/images/marque-enievent.png";

/**
 * Marge autour du dessin, en proportion de son côté.
 *
 * 4 % et non 8 % : les navigateurs ajoutent déjà leur propre espacement autour
 * d un favicon, et le dessin comporte des traits pâles et fins qui s effacent
 * vite. Comparé à 16 px — la taille où il se joue — avant de trancher.
 */
const MARGE = 0.04;

/** Les tailles empilées dans le `.ico`, comme dans celui qu'on remplace. */
const TAILLES_ICO = [16, 32, 48];

/** Cadre utile : tout ce qui n'est pas du blanc de fond. */
async function cadreUtile(chemin) {
  const { data, info } = await sharp(chemin)
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  if (x1 < x0 || y1 < y0) throw new Error(`${chemin} est entièrement blanc.`);

  return { x0, y0, largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1, width, height };
}

/**
 * Le carré à découper : centré sur le dessin, assez grand pour le contenir
 * entier plus sa marge, et borné par l'image.
 */
function carre(cadre) {
  const cx = cadre.x0 + cadre.largeur / 2;
  const cy = cadre.y0 + cadre.hauteur / 2;
  const cote = Math.round(Math.max(cadre.largeur, cadre.hauteur) * (1 + 2 * MARGE));

  const limite = Math.min(cote, cadre.width, cadre.height);

  return {
    left: Math.max(0, Math.min(Math.round(cx - limite / 2), cadre.width - limite)),
    top: Math.max(0, Math.min(Math.round(cy - limite / 2), cadre.height - limite)),
    width: limite,
    height: limite,
  };
}

/**
 * Une icône carrée, fond blanc opaque, au format PNG.
 *
 * `palette: true` allège d'un tiers sans dégât visible — mesuré sur l'icône de
 * 512 px : 232 Ko en couleurs vraies contre 150 Ko en palette, pour un écart
 * moyen de 0,14 sur 255.
 *
 * ⚠️ **150 Ko reste lourd pour un logo en aplats, et la cause n'est pas le
 * réglage : c'est l'origine.** La marque a été fournie en JPEG, dont le bruit
 * de compression empêche le PNG de regrouper les aplats. Un filtre médian
 * ramènerait le fichier à 98 Ko (médiane 3) ou 73 Ko (médiane 5) — essayé,
 * puis **écarté** : arrondir les angles du logo pour gagner 50 Ko revient à
 * retoucher un dessin qu'on ne nous a pas demandé de retoucher. Le jour où la
 * marque arrivera en vectoriel, le fichier tombera de lui-même sous les 30 Ko.
 */
async function rendre(chemin, decoupe, taille, { rgba = false } = {}) {
  const image = sharp(chemin)
    .extract(decoupe)
    .resize(taille, taille, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: "#ffffff" });

  // ⚠️ **Les PNG empilés dans un `.ico` doivent être en RGBA**, et rien ne le
  // dit avant l'exécution. Next lit le conteneur pour écrire ses balises
  // `<link rel="icon">` ; avec des images indexées en palette, son décodeur
  // refuse — « The PNG is not in RGBA format! » — et **aucune balise n'est
  // émise**. Le fichier continue pourtant d'être servi en 200 : un contrôle
  // qui se contente du code de retour conclut que tout va bien, et l'onglet
  // reste vide. Constaté le 15 octobre 2026.
  if (rgba) {
    return image.ensureAlpha().png({ compressionLevel: 9, palette: false }).toBuffer();
  }

  return image.png({ compressionLevel: 9, palette: true }).toBuffer();
}

/**
 * Assemble des PNG dans un conteneur ICO.
 *
 * En-tête : 2 octets réservés, 2 octets de type (1 = icône), 2 octets de
 * nombre d'images. Puis une entrée de 16 octets par image, puis les images.
 * ⚠️ Une dimension de 256 s'écrit `0` — l'octet ne va pas plus loin ; aucune
 * des tailles employées ici n'y touche, mais la règle vaut d'être notée.
 */
function assemblerIco(images) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(images.length, 4);

  const repertoire = Buffer.alloc(16 * images.length);
  let position = 6 + repertoire.length;

  images.forEach(({ taille, png }, index) => {
    const o = index * 16;
    repertoire[o] = taille >= 256 ? 0 : taille;
    repertoire[o + 1] = taille >= 256 ? 0 : taille;
    repertoire[o + 2] = 0; // palette : aucune
    repertoire[o + 3] = 0; // réservé
    repertoire.writeUInt16LE(1, o + 4); // plans
    repertoire.writeUInt16LE(32, o + 6); // bits par pixel
    repertoire.writeUInt32LE(png.length, o + 8);
    repertoire.writeUInt32LE(position, o + 12);
    position += png.length;
  });

  return Buffer.concat([entete, repertoire, ...images.map((i) => i.png)]);
}

const cadre = await cadreUtile(SOURCE);
const decoupe = carre(cadre);

console.log(`Source   ${SOURCE} — ${cadre.width}×${cadre.height}`);
console.log(`Dessin   ${cadre.largeur}×${cadre.hauteur} à (${cadre.x0}, ${cadre.y0})`);
console.log(`Découpe  ${decoupe.width}×${decoupe.height} à (${decoupe.left}, ${decoupe.top})`);
console.log("");

/**
 * Les fichiers à écrire.
 *
 * ⚠️ **Les quatre derniers vivent dans `public/`, et ce n'est pas un doublon.**
 * Next déclare bien `<link rel="apple-touch-icon" href="/apple-icon.png">`,
 * mais iOS et la plupart des moissonneurs d'icônes — ceux qui alimentent les
 * suggestions de recherche — **ne lisent pas le HTML** : ils tapent directement
 * les chemins conventionnels à la racine. Mesuré sur la production le
 * 15 octobre 2026, ces quatre adresses rendaient un 404 en HTML :
 *
 *     /apple-touch-icon.png               404
 *     /apple-touch-icon-precomposed.png   404
 *
 * D'où un iPhone qui affichait la bonne marque une fois le site ouvert — le
 * HTML, lui, est correct — et une autre dans la liste des suggestions.
 *
 * `precomposed` vise les iOS anciens, qui le demandent **en premier** ; il est
 * conservé pour cette raison, pas par nostalgie.
 */
const sorties = [
  ["src/app/icon.png", 512],
  ["src/app/apple-icon.png", 180],
  ["public/apple-touch-icon.png", 180],
  ["public/apple-touch-icon-precomposed.png", 180],
  // Pour le manifeste. Le 512 n'est pas repris ici : Next sert déjà
  // `src/app/icon.png` à l'adresse `/icon.png`, et le dupliquer coûterait
  // 150 Ko pour rien.
  ["public/icon-192.png", 192],
];

for (const [chemin, taille] of sorties) {
  const png = await rendre(SOURCE, decoupe, taille);
  await writeFile(chemin, png);
  console.log(`  ${chemin.padEnd(40)} ${taille}×${taille}  ${png.length} octets`);
}

const empilees = [];
for (const taille of TAILLES_ICO) {
  empilees.push({ taille, png: await rendre(SOURCE, decoupe, taille, { rgba: true }) });
}

const ico = assemblerIco(empilees);
await writeFile("src/app/favicon.ico", ico);
console.log(
  `  ${"src/app/favicon.ico".padEnd(40)} ${TAILLES_ICO.join(", ")}  ${ico.length} octets`,
);

// Relecture : un conteneur ICO mal assemblé ne lève aucune erreur à l'écriture,
// il donne un onglet vide. On le rouvre pour vérifier qu'il se lit.
const relu = await readFile("src/app/favicon.ico");
const nombre = relu.readUInt16LE(4);
if (nombre !== TAILLES_ICO.length) throw new Error(`ICO illisible : ${nombre} image(s)`);

console.log(`\nLes ${sorties.length + 1} icônes sont à jour.`);
