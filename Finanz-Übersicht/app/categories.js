// Kategorien-Struktur (entspricht fixKosten / variableKosten / sparRate / einnahmen)
export const GROUPS = [
  {
    id: 'einnahmen', name: 'Einnahmen', direction: 'in', color: 'var(--c-in)',
    cats: ['Gehalt', 'Leistungen / Agentur für Arbeit', 'Bargeldeinzahlung', 'Sonstige Einnahmen'],
  },
  {
    id: 'fixKosten', name: 'Fixkosten', direction: 'out', color: 'var(--c-fix)',
    cats: ['Miete & Wohnen', 'Strom & Energie', 'Telekommunikation', 'Versicherungen & Beiträge',
      'Abos & Streaming', 'Behörden & Gebühren', 'Jahreszahlungen'],
  },
  {
    id: 'variableKosten', name: 'Variable Kosten', direction: 'out', color: 'var(--c-var)',
    cats: ['Supermarkt & Lebensmittel', 'Drogerie & Körperpflege', 'Tanken & Kraftstoff', 'Gastronomie & Delivery',
      'Gaming', 'Hobby & Freizeit', 'Online-Shopping & Dienste', 'Gesundheit & Apotheke',
      'Reparatur & Wartung KFZ', 'Bargeld', 'Sonstiges'],
  },
  {
    id: 'sparRate', name: 'Sparrate', direction: 'out', color: 'var(--c-save)',
    cats: ['Depot & ETF-Sparplan', 'Sonstige Investments'],
  },
];

export const IGNORE = '__ignore';
export const ALL_CATS = new Set([...GROUPS.flatMap((g) => g.cats), IGNORE]);

// Kategorien, deren Betrag meist nur einmal im Jahr anfällt: Anzeige "≈ … pro Monat"
export const ANNUAL = new Set(['Jahreszahlungen']);

export const groupOf = (cat) => GROUPS.find((g) => g.cats.includes(cat)) || null;

// Text normalisieren: klein, Umlaute ausgeschrieben, Leerraum vereinheitlicht
export function normalize(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Deine Stichwörter. Sie werden VOR den allgemeinen Regeln geprüft und haben
// damit Vorrang. Groß-/Kleinschreibung und Umlaute (ü/ue) sind egal; Leerzeichen,
// Bindestriche und Punkte im Stichwort dürfen im Auszug auch fehlen oder anders sein
// ("dm-drogerie" passt auf "DM-Drogerie", "DM Drogerie" und "DMDROGERIE").
// Ergänzen: einfach weitere Wörter in die Liste der Kategorie schreiben, z. B. den
// Namen deines Vermieters unter 'Miete & Wohnen' oder deinen Arbeitgeber unter 'Gehalt'.
// Die Einträge unten sind neutrale Beispiele.
// ---------------------------------------------------------------------------
export const KEYWORDS = {
  // Fixkosten
  'Miete & Wohnen': ['Miete', 'Hausverwaltung'],
  'Strom & Energie': ['Stadtwerke', 'Abschlag Strom'],
  'Telekommunikation': ['Mobilfunk', 'Festnetz'],
  'Versicherungen & Beiträge': ['Haftpflicht', 'Hausrat'],
  'Abos & Streaming': ['Netflix', 'Spotify'],
  'Behörden & Gebühren': ['Kontoführung', 'Rundfunkbeitrag'],
  'Jahreszahlungen': ['Kfz-Steuer', 'Kraftfahrzeugsteuer', 'Jahresbeitrag', 'Jahresgebühr', 'Jahresabo',
    'Jahresrechnung', 'Jahresabrechnung', 'Nachzahlung', 'jährlich'],
  // Variable Kosten
  'Supermarkt & Lebensmittel': ['Supermarkt', 'Wochenmarkt'],
  'Drogerie & Körperpflege': ['Friseur', 'Frisör'],
  'Tanken & Kraftstoff': ['Tankstelle'],
  'Gastronomie & Delivery': ['Restaurant', 'Lieferdienst'],
  'Gaming': ['Steam', 'PlayStation Store'],
  'Hobby & Freizeit': ['Kino', 'Fitnessstudio'],
  'Online-Shopping & Dienste': ['Onlineshop'],
  'Gesundheit & Apotheke': ['Apotheke', 'Arztpraxis'],
  'Reparatur & Wartung KFZ': ['Werkstatt', 'Inspektion'],
  'Bargeld': [],
  'Sonstiges': ['Geschenk'],
  // Sparrate
  'Depot & ETF-Sparplan': ['Sparplan', 'MSCI World', 'ETF'],
  'Sonstige Investments': ['Tagesgeld', 'Bausparvertrag'],
  // Einnahmen (gelten nur für Gutschriften)
  'Gehalt': ['Lohn', 'Gehalt'],
  'Leistungen / Agentur für Arbeit': ['Bundesagentur für Arbeit', 'Kindergeld'],
  'Bargeldeinzahlung': [],
  'Sonstige Einnahmen': ['Auslagenerstattung'],
};

// Stichwörter dieser Kategorien werden zuerst geprüft. So landet z. B.
// "Muster AG Auslagenerstattung" unter Sonstige Einnahmen, obwohl "Muster AG" sonst Gehalt wäre,
// und eine "Jahresabrechnung" des Stromanbieters unter Jahreszahlungen statt Strom.
const CHECK_FIRST = ['Sonstige Einnahmen', 'Jahreszahlungen'];

// Umbuchungen zwischen eigenen Konten zählen weder als Einnahme noch als Ausgabe.
// (Überweisungen auf Depot/Sparkonto bleiben Sparrate.)
const OWN_TRANSFER = /(umbuchung|kontouebertrag|uebertrag (auf|von)|eigenes? konto|eigene konten|zwischen eigenen)/;

function keywordRegex(word) {
  const n = normalize(word);
  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Lange Wörter dürfen im Auszug umbrochen sein ("Musterhan del")
  const body = n.split(/[\s\-./,]+/).filter(Boolean)
    .map((part) => (part.length >= 6 ? [...part].map(esc).join('\\s?') : esc(part)))
    .join('[\\s\\-./,]*');
  // Kurze Kürzel (O2, AOK, DM) nur als ganzes Wort, sonst nur am Wortanfang
  const end = n.replace(/[^a-z0-9]/g, '').length <= 4 ? '(?![a-z0-9])' : '';
  return new RegExp(`(?<![a-z0-9])${body}${end}`);
}

const KEYWORD_RULES = { in: [], out: [] };
for (const g of GROUPS) {
  const cats = [...g.cats].sort((a, b) => CHECK_FIRST.includes(b) - CHECK_FIRST.includes(a));
  for (const cat of cats) {
    for (const word of KEYWORDS[cat] || []) KEYWORD_RULES[g.direction].push([cat, keywordRegex(word)]);
  }
}

// Allgemeine Regeln. Reihenfolge ist wichtig: erste passende Regel gewinnt.
const IN_RULES = [
  ['Gehalt', /\b(gehalt|lohn|bezuege|verguetung|lohn\/gehalt|entgeltabrechnung|salary|payroll)\b/],
  ['Leistungen / Agentur für Arbeit', /(bundesagentur|agentur fuer arbeit|jobcenter|familienkasse|kindergeld|elterngeld|bafoeg|wohngeld|krankengeld|rentenversicherung|buergergeld|arbeitslosengeld|unterhaltsvorschuss)/],
  ['Bargeldeinzahlung', /(bareinzahlung|bargeldeinzahlung|einzahlung bar|bar-einzahlung|cash deposit|einzahlungsautomat|einzahlung geldautomat)/],
];

const OUT_RULES = [
  ['Bargeld', /(bargeldauszahlung|ga-verfuegung|geldautomat|auszahlung gaa|\bgaa\b|bargeld|cash withdrawal|atm\b)/],
  ['Jahreszahlungen', /(kfz-steuer|kraftfahrzeugsteuer|jahresbeitrag|jahresgebuehr|jahresabo|jahresrechnung|jahresabrechnung|nachzahlung|jaehrlich)/],
  ['Depot & ETF-Sparplan', /(trade republic|traderepublic|scalable|wertpapier|\bdepot|sparplan|\betf\b|flatex|smartbroker|justtrade|baader bank|onvista|consorsbank|finanzen\.net zero)/],
  ['Sonstige Investments', /(tagesgeld|festgeld|sparkonto|sparbuch|bauspar|wuestenrot|schwaebisch hall|\blbs\b|vermoegenswirksam|\bvl\b|bitpanda|coinbase|binance|kraken|\bbison\b|riester|ruerup|sparrate|\bsparen\b)/],
  ['Behörden & Gebühren', /(rundfunk|beitragsservice|ard zdf|finanzamt|stadtkasse|gemeindekasse|kreiskasse|bundeskasse|landeskasse|gerichtskasse|kfz-steuer|kraftfahrzeugsteuer|hauptzollamt|zulassungsstelle|buergeramt|bussgeld|verwarngeld|ordnungsamt|kontofuehrung|kontoentgelt|\bentgelt|gebuehr|rechnungsabschluss|\babschluss\b|sollzins|dispozins|landratsamt|grundsteuer|hundesteuer|abfall|muellabfuhr)/],
  ['Versicherungen & Beiträge', /(versicherung|versich\.|allianz|\bhuk\b|huk-coburg|\bergo\b|\baxa\b|debeka|generali|\bdevk\b|signal iduna|\br\+v\b|gothaer|zurich|\blvm\b|provinzial|\bwgv\b|cosmosdirekt|hanse ?merkur|\baok\b|techniker krankenkasse|\btk\b|barmer|\bdak\b|\bikk\b|krankenkasse|haftpflicht|\badac\b|mitgliedsbeitrag|beitrag|gewerkschaft|\bverdi\b|ig metall|\bverein\b|mcfit|fitx|clever fit|john reed|urban sports|fitness|\bgym\b)/],
  ['Tanken & Kraftstoff', /(\baral\b|\bshell\b|\besso\b|\bjet\b|totalenergies|\btotal\b|\bavia\b|star tankstelle|\bagip\b|\beni\b|\bomv\b|\bhem\b|tankstelle|westfalen|\borlen\b|raiffeisen tank|ladesaeule|ladestation|ionity|enbw mobility|supercharger|tankcenter)/],
  ['Miete & Wohnen', /(\bmiete\b|kaltmiete|warmmiete|nebenkosten|hausgeld|hausverwaltung|wohnungsbau|wohnungsgenossenschaft|wohnbau|vonovia|deutsche wohnen|leg wohnen|gewobag|degewo|\bsaga\b|\bwbg\b|vermieter|wohnung|immobilien)/],
  ['Strom & Energie', /(stadtwerke|strom|\bgas\b|erdgas|energie|e\.on|\beon\b|vattenfall|enbw|\brwe\b|eprimo|tibber|yello|lichtblick|octopus|naturstrom|fernwaerme|heizoel|polarstern|ostrom|mainova|\bswm\b|entega|innogy)/],
  ['Telekommunikation', /(telekom|vodafone|\bo2\b|telefonica|1&1|1und1|1 & 1|congstar|freenet|mobilcom|aldi talk|fraenk|\bpyur\b|unitymedia|simyo|drillisch|winsim|klarmobil|blau\.de|netcologne|m-net|ewe tel|deutsche glasfaser|otelo|lebara|lycamobile|kabel deutschland|mobilfunk|\bdsl\b)/],
  ['Abos & Streaming', /(netflix|spotify|disney|prime video|amazon prime|primevideo|\bdazn\b|\bsky\b|wow tv|apple\.com\/bill|apple services|itunes|youtube|google storage|google one|audible|\bjoyn\b|rtl\+|paramount|chatgpt|openai|adobe|microsoft 365|office 365|patreon|crunchyroll|deezer|\btidal\b|kindle unlimited|icloud|dropbox|\babo\b|abonnement|zeitung|spiegel|zeit online)/],
  ['Gesundheit & Apotheke', /(apotheke|\barzt|aerzt|zahnarzt|praxis|klinik|krankenhaus|\boptik|fielmann|docmorris|shop-apotheke|physio|\blabor\b|medizin|heilpraktiker|psycho|orthopaed|hoergeraet)/],
  ['Gastronomie & Delivery', /(lieferando|\bwolt\b|uber ?\*? ?eats|deliveroo|mcdonald|burger king|\bkfc\b|subway|starbucks|restaurant|pizzeria|pizza|trattoria|ristorante|\bcafe\b|kaffee|bistro|imbiss|doener|kebap|kebab|sushi|vapiano|osteria|dean ?& ?david|backwerk|\bkamps\b|nordsee|five guys|domino|kneipe|brauhaus|biergarten|gaststaette|\bmensa\b|kantine|coffee)/],
  ['Drogerie & Körperpflege', /(\bdm\b|dm-drogerie|dm drogerie|rossmann|mueller drogerie|drogerie mueller|budni|drogerie|douglas|flaconi|parfuemerie|parfumerie|friseur|frisoer|haarstudio|haarschnitt|barber|coiffeur|kosmetik|nagelstudio)/],
  ['Supermarkt & Lebensmittel', /(\brewe\b|edeka|\baldi\b|\blidl\b|\bnetto\b|\bpenny\b|kaufland|\breal\b|\bnorma\b|\btegut\b|\bglobus\b|famila|marktkauf|\bhit\b|nahkauf|denns|alnatura|bio company|picnic|\bflink\b|getir|knuspr|supermarkt|lebensmittel|baeckerei|baecker|backhaus|backstube|metzgerei|fleischerei|wochenmarkt|asia ?markt)/],
  ['Gaming', /(\bsteam|valve|playstation|sony interactive|\bpsn\b|\bxbox|nintendo|epic games|blizzard|battle\.net|riot games|electronic arts|ubisoft|twitch|instant gaming|\bg2a\b|mmoga|gog\.com|humble bundle)/],
  ['Hobby & Freizeit', /(sammelkarten|cardmarket|trading card|pokemon|yu-?gi-?oh|magic the gathering|games workshop|modellbau|bastel|eventim|ticketmaster|reservix|cinemaxx|cineplex|kinopolis|\buci\b|\bkino|theater|konzert|museum|freizeitpark|bowling|escape room|schwimmbad|therme)/],
  ['Reparatur & Wartung KFZ', /(werkstatt|\batu\b|a\.t\.u|autohaus|\bkfz|reifen|\btuev\b|dekra|\bgtue\b|pitstop|euromaster|vergoelst|carglass|autowaesche|waschstrasse|waschpark|mr\.? ?wash|autoteile|kfzteile|autodoc|abschleppdienst|lackiererei)/],
  ['Online-Shopping & Dienste', /(amazon|amzn|\bebay\b|zalando|\botto\b|paypal|klarna|\btemu\b|shein|aliexpress|about you|media ?markt|saturn|\bikea\b|h&m|zara|decathlon|thalia|apple store|galaxus|notebooksbilliger|alternate|cyberport|\betsy\b|vinted|kleinanzeigen)/],
];

function firstMatch(t, ...lists) {
  for (const list of lists) for (const [cat, re] of list) if (re.test(t)) return cat;
  return null;
}
const matchOut = (t) => firstMatch(t, KEYWORD_RULES.out, OUT_RULES);
const matchIn = (t) => firstMatch(t, KEYWORD_RULES.in, IN_RULES);

function isOwnTransfer(t, title, holder) {
  if (OWN_TRANSFER.test(t)) return true;
  if (!holder) return false;
  const h = normalize(holder).split(' ').filter(Boolean);
  if (h.length < 2) return false;
  const ti = normalize(title).replace(/[,]/g, '');
  // Gegenpartei ist der Kontoinhaber selbst ("Max Mustermann" oder "Mustermann Max")
  return ti.startsWith(h.join(' ')) || ti.startsWith([...h].reverse().join(' '));
}

/**
 * Ordnet eine Buchung einer Kategorie zu.
 * - Abbuchungen: Stichwörter, dann allgemeine Regeln.
 * - Gutschriften: erst Einnahme-Regeln. Passt keine, aber ein Händler (z. B. ein Onlineshop),
 *   ist es eine Erstattung und mindert die Ausgabenkategorie dieses Händlers.
 * - Umbuchungen zwischen eigenen Konten: nicht werten.
 */
export function autoCategory(text, amount, { title = '', holder = '' } = {}) {
  const t = normalize(text);
  if (amount < 0) {
    const cat = matchOut(t);
    if (cat && groupOf(cat)?.id === 'sparRate') return cat;
    if (isOwnTransfer(t, title, holder)) return IGNORE;
    return cat || 'Sonstiges';
  }
  const income = matchIn(t);
  if (income) return income;
  if (isOwnTransfer(t, title, holder)) return IGNORE;
  const refund = matchOut(t);
  if (refund && groupOf(refund)?.id !== 'sparRate' && refund !== 'Bargeld' && refund !== 'Sonstiges') return refund;
  return 'Sonstige Einnahmen';
}

// Schlüssel für gemerkte Zuordnungen: Gegenpartei ohne Buchungsart, Zahlen und Satzzeichen
const TYPE_WORDS = /\b(sepa|basislastschrift|lastschrift|folgelastschrift|erstlastschrift|kartenzahlung|kartenzahl|girocard|debitk\.?|visa|mastercard|ueberweisung|echtzeitueberweisung|dauerauftrag|gutschrift|einzug|zahlung|zahlungseingang|zahlungsausgang|rueckbuchung|wert|buchung|kartentransaktion|lastschrift einzug|onl\.?|online|ec|pos)\b/g;
export function merchantKey(title) {
  return normalize(title)
    .replace(/\b[0-9a-f]{16,}\b/g, ' ')
    .replace(TYPE_WORDS, ' ')
    .replace(/[^a-z& ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ');
}
