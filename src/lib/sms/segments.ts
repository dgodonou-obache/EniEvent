/**
 * Longueur facturée d'un SMS.
 *
 * Un SMS n'est pas facturé au caractère mais au **segment**, et le nombre de
 * caractères par segment dépend de l'alphabet employé :
 *
 * - **GSM 03.38** (7 bits) : 160 caractères, ou 153 par segment dès qu'il y en
 *   a plusieurs — l'en-tête de raboutage consomme la place de 7 caractères.
 * - **UCS-2** (16 bits) : 70 caractères, ou 67 par segment.
 *
 * Le piège est franco-béninois. L'alphabet GSM contient `é`, `è`, `à`, `ù`,
 * `ç` — mais **ni l'apostrophe typographique `’`, ni les guillemets `«  »`,
 * ni les points de suspension `…`**, qui sont précisément ce que produisent un
 * traitement de texte et la plupart de nos libellés d'interface. Un seul de ces
 * caractères fait basculer tout le message en UCS-2 : la capacité tombe de 160
 * à 70, et un message de 150 caractères passe de 1 à 3 segments — donc coûte
 * trois fois plus cher.
 *
 * D'où ce module : pur, sans réseau, testable, et utilisé pour refuser à
 * l'écriture un libellé qui coûterait inutilement.
 */

/**
 * Alphabet GSM 03.38 de base. Chaque caractère vaut un septet.
 * L'ordre n'a pas d'importance ici, seule l'appartenance compte.
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

/**
 * Caractères accessibles par échappement : ils valent **deux** septets.
 * Le `€` en fait partie — une somme en euros coûte donc deux places.
 */
const GSM_EXTENDED = "^{}\\[~]|€";

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

export type SmsEncoding = "gsm-7" | "ucs-2";

export interface SmsLength {
  encoding: SmsEncoding;
  /** Unités facturées : septets en GSM-7, unités UTF-16 en UCS-2. */
  units: number;
  segments: number;
  /** Caractères encore disponibles dans le dernier segment. */
  remaining: number;
  /** Caractères qui, à eux seuls, imposent l'UCS-2. Vide si le message tient en GSM-7. */
  offenders: string[];
}

/** Limites, en unités. Le raboutage réduit la capacité de chaque segment. */
const LIMITS = {
  "gsm-7": { single: 160, multi: 153 },
  "ucs-2": { single: 70, multi: 67 },
} as const;

export function measureSms(body: string): SmsLength {
  const offenders: string[] = [];
  let septets = 0;

  for (const char of body) {
    if (BASIC.has(char)) {
      septets += 1;
    } else if (EXTENDED.has(char)) {
      septets += 2;
    } else if (!offenders.includes(char)) {
      offenders.push(char);
    }
  }

  if (offenders.length > 0) {
    // UCS-2 compte en unités UTF-16 : un emoji hors du plan de base en vaut deux.
    const units = body.length;
    return { encoding: "ucs-2", units, offenders, ...split(units, LIMITS["ucs-2"]) };
  }

  return { encoding: "gsm-7", units: septets, offenders, ...split(septets, LIMITS["gsm-7"]) };
}

function split(units: number, limit: { single: number; multi: number }) {
  if (units <= limit.single) {
    return { segments: units === 0 ? 0 : 1, remaining: limit.single - units };
  }

  const segments = Math.ceil(units / limit.multi);
  return { segments, remaining: segments * limit.multi - units };
}

/**
 * Remplace les caractères typographiques par leur équivalent GSM.
 *
 * Écrire « l'apostrophe droite » dans un libellé d'interface serait une
 * régression typographique ; l'appliquer au moment de l'envoi ne coûte rien et
 * divise la facture par trois. On ne touche donc pas à la copie affichée à
 * l'écran, seulement au texte qui part par la passerelle.
 */
const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/[’‘‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  // Les guillemets français encadrent leur contenu d'une espace insécable.
  // La convertir en espace ordinaire donnerait « " Salle Étoile " » : on
  // l'absorbe donc avec le guillemet, avant la règle générale sur les espaces.
  [/«[\s  ]*/g, '"'],
  [/[\s  ]*»/g, '"'],
  [/…/g, "..."],
  [/[–—‑‒]/g, "-"],
  [/ | | /g, " "], // espaces insécables, dont la fine avant « : »
  [/œ/g, "oe"],
  [/Œ/g, "OE"],
  // L'alphabet GSM contient « Ç » mais **pas** « ç » minuscule. Sans cette
  // ligne, « reçu », « français » ou « ça » suffisent à faire passer tout le
  // message en UCS-2 — le piège le plus discret de la liste, puisque les
  // autres accents français, eux, passent sans frais.
  [/ç/g, "c"],
];

export function toGsmSafe(body: string): string {
  let out = body;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  // Dernier filet, et le plus utile : **tout** caractère absent de l'alphabet
  // GSM est décomposé puis dépouillé de ses signes diacritiques.
  //
  // L'alphabet GSM est arbitraire au point d'en être piégeux : il contient `ò`
  // mais pas `ô`, `ö` mais pas `ê`, `à` mais pas `â`. Aucune règle ne permet de
  // deviner lesquels passent — « bientôt » a coûté trois segments au lieu d'un
  // avant que cette ligne n'existe. Une liste tenue à la main aurait vieilli au
  // premier libellé nouveau ; ceci vaut pour tous.
  //
  // Les accents qui appartiennent bien à l'alphabet (`é`, `è`, `à`, `ù`) ne
  // sont pas touchés : la condition les laisse passer intacts.
  return [...out]
    .map((char) => {
      if (BASIC.has(char) || EXTENDED.has(char)) return char;
      const nu = char.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      return BASIC.has(nu) || EXTENDED.has(nu) ? nu : char;
    })
    .join("");
}
