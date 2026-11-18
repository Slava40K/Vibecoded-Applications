// Macht Buchungstexte lesbar: entfernt Referenznummern, Rechtsformen, SEPA-Kürzel,
// Zahlungsdienst-Floskeln und repariert umbrochene Wörter.
import { KEYWORDS } from './categories.js';

const VIA = [
  [/pay\s?pal(\s*\(?\s*europe\s*\)?)?/i, 'PayPal'],
  [/klarna(\s+bank)?(\s+ab)?/i, 'Klarna'],
  [/amazon\s+payments(\s+europe)?/i, 'Amazon Payments'],
  [/apple\s+pay/i, 'Apple Pay'],
  [/google\s+pay/i, 'Google Pay'],
  [/sumup/i, 'SumUp'],
];

const LEGAL = /(^|[\s,])(gmbh\s*[.&+]?\s*co\.?\s*(kg(aa)?|ohg)|gmbh|mbh|ag|ab|a\s?\/\s?s|se|kg|kgaa|ohg|gbr|e\.\s?k\.?|e\.\s?v\.?|eg|ug|ltd\.?|inc\.?|llc|b\.\s?v\.?|n\.\s?v\.?|s\.\s?a\.\s?r\.\s?l\.?|sarl|s\.\s?a\.?|s\.\s?c\.\s?a\.?|et\s+cie\.?|&\s*co\.?|\+\s*co\.?|\.\s*co\.?\s*kg|co\.?\s*kg|limited|plc|europe|genossensc(haft)?)(?=[\s,.;:]|$)/gi;

const SEPA_KEYS = /\b(EREF|MREF|CRED|SVWZ|ABWA|ABWE|KREF|IBAN|BIC|Mandat(?:sref(?:erenz)?|sreferenz)?|Gl(?:ä|ae)ubiger-?ID|End-?to-?End-?Ref(?:erenz)?\.?|Kundenreferenz|Referenz|Ref\.|Kartennr\.?|Karten-?Nr\.?|Folgenr\.?|Folge-?Nr\.?|Verfalld(?:atum)?\.?|Terminal(?:-?ID)?|Beleg(?:nr\.?)?|Trace(?:-?Nr\.?)?|Kd-Nr\.?|Rg-Nr\.?|Vertragskonto|Zahlbeleg)\s*[:+.]?\s*\S*/gi;

const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g;
const DATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?(?=\s|$|[,;-])/g;
const ISO_DT = /\b\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?)?\b/g; // 2026-10-05T17:11, 2026-12
const TIME = /\b\d{1,2}[:.]\d{2}(?::\d{2})?\s?Uhr\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/gi;
const LONG_NUM = /\S*\d{5,}\S*/g; // Referenz- und Auftragsnummern
const CODE = /(?<=^|\s)(?=\S*\d)(?=\S*[./_])\S{5,}/g; // z. B. PP.1234.PP oder 123/456/78
const MIXED_ID = /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Z])[A-Za-z0-9-]{10,}\b/g; // z. B. 4ABC123DEF56G, 1a2b3c4d-5e6f…
const SHORT_ID = /\b(?=[A-Z0-9]*\d)[A-Z]{1,3}\d[A-Z0-9]{4,}\b/g; // z. B. AB123456, T0001234B…

const HEX_ID = /\b[0-9a-f]{16,}\b/gi; // Auftrags-IDs wie 0a1b2c3d4e5f6a7b…
const STOPWORDS = /(^|\s)(datum|wert:?|\(publ\),?|kundennr\.?|rechnungsnummer|ihr\s+ei\s?n\s?kauf\s+b\s?e\s?i|ei\s?n\s?kauf\s+b\s?e\s?i|zahlung an|kauf bei|sagt danke\.?|vielen dank|danke\.?|girocard|debitk\.?\s?\d*|visa debit|debit mastercard|ec-karte|kontaktlos|contactless|nfc|pos|online-?banking|abbuchung vom p\s?aypal-konto|siehe anlage nr\.?\s?\d*|ihre tarifrechnung|abrechnung)(?=\s|$|[,.;:/])/gi;
const PLAIN_NUM = /(?<=^|\s)(\d{3,}|\d{1,2}\.\d{1,2}|0)(?=\s|$)/g; // Filial-/Kassennummern, Datumsreste
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f\s]{4,5}-[0-9a-f]{12}\b/gi;
const STREET = /(?:[\p{L}-]+\s+)?[\p{L}-]*(stra(ss|ß)e|stray\s?e|str\.|weg|gasse|platz|allee|ring)\s*\d+\s?\w?(?=\s|$|[,;/])/giu;
const FIXES = [
  [/abbuchung vom\s+\S*\s?\S*-?konto/gi, ' '],
];

// Wörter, die der Auszug mitten im Wort umbricht ("Musterhan del", "Co rporation").
const SMALL_WORDS = new Set(['und', 'bei', 'von', 'vom', 'für', 'fuer', 'der', 'die', 'das', 'den', 'dem', 'des', 'mit', 'im', 'am', 'an', 'zu', 'zum', 'zur', 'auf', 'in', 'aus', 'nach', 'per', 'ab', 'bis', 'et', 'be', 'e', 'de', 'la', 'le', 'of', 'the', 'and', 'eigen', 'ihr', 'ihre']);
// Nur zusammenziehen, wenn der zweite Teil kein eigenes Wort sein kann:
// ein bis zwei Buchstaben ("Musterstad t") oder ein Anfang, mit dem kein deutsches Wort beginnt
// ("Co rporation", "Ei nkauf"). "Meier offene" bleibt getrennt.
const ONSETS = /^(bl|br|ch|dr|fl|fr|gl|gr|kl|kn|kr|pf|ph|pl|pr|ps|qu|sc|sk|sl|sm|sn|sp|st|sw|sz|th|tr|ts|tz|wr|zw)/;
const VOWEL = /[aeiouäöüy]/;
function looksLikeFragment(b) {
  const w = b.toLowerCase();
  if (SMALL_WORDS.has(w)) return false;
  if (w.length <= 2) return true;
  return !VOWEL.test(w[0]) && !VOWEL.test(w[1]) && !ONSETS.test(w);
}
function mergeBrokenWords(s) {
  return s.replace(/(?<![\p{L}\d])(\p{Lu}[\p{L}]+) (\p{Ll}[\p{L}]*)/gu, (m, a, b) =>
    looksLikeFragment(b) ? a + b : m);
}

const SPLIT_FIX = Object.values(KEYWORDS).flat()
  .filter((w) => w.replace(/\s/g, '').length >= 6 && !/\s/.test(w))
  .map((w) => new RegExp([...w].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s?'), 'gi'));

function repairSplits(s) {
  let t = s;
  for (const re of SPLIT_FIX) t = t.replace(re, (m) => m.replace(/\s/g, ''));
  return mergeBrokenWords(t);
}

function tidy(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s([,.;:])/g, '$1')
    .replace(/(^|\s)[-–/.,;:+*#()]+(?=\s|$)/g, ' ')
    .replace(/(?<=^|\s)\p{L}(?=\s|$)/gu, ' ') // einzelne Buchstaben ("R G")
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(,\s*)?\bihre?$/i, '') // "Spotify, Ihr" (Rest von "Ihr Einkauf bei")
    .replace(/[,;:/\-–+*.\s]+$/g, '')
    .replace(/^[,;:/\-–+*.\s]+/g, '')
    .trim();
}

// Wörter, die schon vorkamen, entfernen ("Muster AG Muster Erstattung")
function dedupeWords(s) {
  const seen = new Set();
  const out = [];
  for (const w of s.split(' ')) {
    const k = w.toLowerCase().replace(/[,.;:]+$/, '');
    if (k.length > 1 && seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return tidy(out.join(' '));
}

function strip(s, holder) {
  let t = ' ' + s + ' ';
  for (const [re, rep] of FIXES) t = t.replace(re, rep);
  if (holder) t = t.replace(holderRegex(holder), ' ');
  t = t.replace(UUID, ' ').replace(HEX_ID, ' ').replace(STREET, ' ').replace(SEPA_KEYS, ' ').replace(IBAN, ' ').replace(ISO_DT, ' ').replace(DATE, ' ').replace(TIME, ' ')
    .replace(LONG_NUM, ' ').replace(CODE, ' ').replace(MIXED_ID, ' ').replace(SHORT_ID, ' ')
    .replace(STOPWORDS, ' ').replace(PLAIN_NUM, ' ');
  t = t.replace(LEGAL, '$1');
  t = t.replace(LEGAL, '$1'); // zweimal, falls Formen aufeinander folgen ("S.a.r.l. et Cie S.C.A")
  return tidy(t);
}

// Name des Kontoinhabers (steht oft im Verwendungszweck von Daueraufträgen)
const holderCache = new Map();
function holderRegex(holder) {
  if (!holderCache.has(holder)) {
    const parts = holder.split(/\s+/).filter((p) => p.length > 1).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const fwd = parts.join('[\\s,]+');
    const rev = [...parts].reverse().join('[\\s,]+');
    holderCache.set(holder, new RegExp(`\\b(${fwd}|${rev})\\b`, 'gi'));
  }
  const re = holderCache.get(holder);
  re.lastIndex = 0;
  return re;
}

// Kartenzahlung im Format "HÄNDLER/Straße/Ort/DE 2026-10-05T17:11"
function parseCardText(text) {
  const m = text.match(/^(.*?)\/\s*([^/]*?)\s*\/\s*([A-Z]{2})(?=\s|$)/);
  if (!m) return null;
  const segs = m[1].split('/').map((x) => x.trim()).filter(Boolean);
  const merchant = segs[0] || '';
  const place = m[2].trim() || segs[segs.length - 1] || '';
  if (!merchant) return null;
  return {
    merchant: merchant.replace(/\s+\S*(stra(ss|ß)e|straye|str\.?)\s*\d+\w?$/i, '').replace(/\s+\S*\s?stra\S*\s+\S+\s+\d+$/i, ''),
    place: titleCase(place),
  };
}

// GROSSGESCHRIEBENES lesbar machen, kurze Marken (REWE, ARAL, AOK) bleiben
function titleCase(s) {
  return s.split(' ').map((w) => (w.length > 4 && w === w.toUpperCase() && /\p{L}{3}/u.test(w)
    ? w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (m, a, b) => (a === "'" ? m : a + b.toUpperCase()))
    : w)).join(' ');
}

/** Liefert { name, purpose, via } für die Anzeige. */
export function cleanTx(tx) {
  let title = repairSplits(tx.title || '');
  let detail = repairSplits(tx.detail || '');

  let via = '';
  for (const [re, label] of VIA) {
    if (re.test(title) || re.test(detail) || re.test(tx.type || '')) {
      via = label;
      title = title.replace(re, ' ');
      detail = detail.replace(re, ' ');
      break;
    }
  }

  const holder = tx.holder || '';

  if (/^GA-Verf|bargeldauszahlung|geldautomat/i.test(tx.type || '')) {
    return { name: 'Bargeld abgehoben', purpose: '', via: '' };
  }

  const card = parseCardText(`${title} ${detail}`.trim());
  if (card) {
    let merchant = card.merchant;
    // Ort aus dem Händlernamen kürzen: "ARAL Musterstadt Hauptstr." -> "ARAL"
    const at = card.place ? merchant.toLowerCase().indexOf(card.place.toLowerCase()) : -1;
    if (at > 0) merchant = merchant.slice(0, at);
    const name = dedupeWords(strip(merchant, holder)) || via || tx.type || 'Kartenzahlung';
    return { name: titleCase(name), purpose: card.place, via };
  }

  // "Ihr Einkauf bei Händler" -> Händler merken
  let shop = '';
  const m = `${title} ${detail}`.match(/ei\s?n\s?kauf\s+b\s?e\s?i\s+(.+)$/i);
  if (m) shop = strip(m[1], holder);
  detail = detail.replace(/(?:ihr\s+)?ei\s?n\s?kauf\s+b\s?e\s?i\s+.*$/i, ' ');

  let name = dedupeWords(strip(title, holder));
  let purpose = dedupeWords(strip(detail, holder));

  if (!name && shop) name = shop;
  else if (shop && shop.length > 3 && !name.toLowerCase().includes(shop.toLowerCase().slice(0, 5))) name = `${name} ${shop}`.trim();
  if (!name && purpose) { name = purpose; purpose = ''; }
  if (!name) name = via || tx.type || 'Buchung';

  // Verwendungszweck nur zeigen, wenn er etwas Neues sagt
  const nameLow = name.toLowerCase();
  const fresh = purpose.split(' ').filter((w) => w.length > 1 && !nameLow.includes(w.toLowerCase()));
  purpose = fresh.length ? fresh.join(' ') : '';

  return { name: titleCase(name), purpose, via };
}
