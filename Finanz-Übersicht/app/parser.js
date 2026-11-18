// Liest Buchungen aus dem Text eines Kontoauszug-PDFs.
// Funktioniert layoutbasiert: Textstücke werden zu Zeilen gruppiert, eine Zeile,
// die mit einem Datum beginnt, eröffnet eine Buchung; Folgezeilen ergänzen den Text.

/* global pdfjsLib */

const MONTHS = { jan: 1, feb: 2, mrz: 3, maer: 3, mär: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };

const AMOUNT_RE = /(?<![\d.,])([+\-−–]\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d])(?:\s?(?:EUR|€))?(?:\s?([+\-−–]|S\b|H\b))?/g;
const DATE_NUM_RE = /^(\d{1,2})\.(\d{1,2})\.((?:\d{4}|\d{2})(?!\d))?/;
const DATE_TXT_RE = /^(\d{1,2})\.?\s+(jan|feb|mär|mrz|maer|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zä]*\.?(?:\s+(\d{4}))?/i;
const SKIP_RE = /(alter kontostand|neuer kontostand|kontostand (am|vom|per)|anfangssaldo|endsaldo|saldo (vom|per|alt|neu|am)|^saldo\b|übertrag|uebertrag|zwischensumme|^summe|gesamtumsatz|kontostand\b)/i;
const CREDIT_HDR = /^(haben|gutschrift(en)?|zahlungseingang|eingang|eingänge|einnahmen)$/i;
const DEBIT_HDR = /^(soll|belastung(en)?|zahlungsausgang|ausgang|ausgänge|lastschrift(en)?|ausgaben)$/i;
const BALANCE_HDR = /^(saldo|kontostand)$/i;
const POSITIVE_HINT = /(gutschrift|zahlungseingang|eingang|gehalt|lohn|bezüge|einzahlung|erstattung|rückzahlung|zinsgutschrift|überweisung von|kindergeld)/i;

export async function extractLines(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0,
        h: it.height || Math.abs(it.transform[3]) || 8,
      }));
    pages.push(groupLines(items));
  }
  return pages;
}

function groupLines(items) {
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    let line = lines.find((l) => Math.abs(l.y - it.y) < 2.5);
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    let text = '';
    const spans = [];
    let prevEnd = null;
    for (const it of l.items) {
      // Leerzeichen nur bei echtem Abstand: PDFs zerlegen Wörter oft in mehrere Stücke
      // ("Musterhan" + "del"), die direkt aneinanderstoßen.
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > Math.max(12, it.h * 1.5)) text += '   ';
        else if (gap > it.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      }
      spans.push({ start: text.length, end: text.length + it.str.length, x: it.x, cx: it.x + it.w / 2 });
      text += it.str;
      prevEnd = it.x + it.w;
    }
    l.text = text.replace(/\s+$/, '');
    l.spans = spans;
  }
  return lines;
}

function xAt(line, index) {
  const s = line.spans.find((sp) => index >= sp.start && index < sp.end) || line.spans[line.spans.length - 1];
  return s ? s.cx : 0;
}

function findAmounts(line) {
  const out = [];
  for (const m of line.text.matchAll(AMOUNT_RE)) {
    const value = parseFloat(m[2].replace(/\./g, '') + '.' + m[3]);
    let sign = 0;
    if (m[1]) sign = /\+/.test(m[1]) ? 1 : -1;
    else if (m[4]) sign = /[+H]/.test(m[4]) ? 1 : -1;
    out.push({ value, sign, x: xAt(line, m.index + m[0].length - 1), index: m.index, length: m[0].length });
  }
  return out;
}

function matchDate(text, fallbackYear) {
  let m = text.match(DATE_NUM_RE);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    let y = m[3] ? +m[3] : fallbackYear;
    if (y < 100) y += 2000;
    let rest = text.slice(m[0].length);
    // Zweites Datum (Wertstellung) entfernen
    rest = rest.replace(/^\s*\d{1,2}\.\d{1,2}\.(\d{2,4})?/, '');
    return { date: new Date(y, mo - 1, d), rest };
  }
  m = text.match(DATE_TXT_RE);
  if (m) {
    const key = m[2].toLowerCase().replace('ä', 'ae').slice(0, 4);
    const mo = MONTHS[key] || MONTHS[key.slice(0, 3)];
    if (!mo) return null;
    const y = m[3] ? +m[3] : fallbackYear;
    return { date: new Date(y, mo - 1, +m[1]), rest: text.slice(m[0].length), partialYear: !m[3] };
  }
  return null;
}

function detectHeader(line) {
  const cols = [];
  for (const it of line.items) {
    const w = it.str.trim().replace(/[:.]$/, '');
    if (CREDIT_HDR.test(w)) cols.push({ kind: 'credit', x: it.x + it.w / 2 });
    else if (DEBIT_HDR.test(w)) cols.push({ kind: 'debit', x: it.x + it.w / 2 });
    else if (BALANCE_HDR.test(w)) cols.push({ kind: 'balance', x: it.x + it.w / 2 });
  }
  const kinds = new Set(cols.map((c) => c.kind));
  return kinds.size >= 2 || (kinds.has('credit') && kinds.has('debit')) ? cols : null;
}

function guessYear(pages) {
  const counts = {};
  for (const lines of pages) for (const l of lines) {
    for (const m of l.text.matchAll(/\b\d{1,2}\.\d{1,2}\.(20\d{2})\b|\b(20\d{2})\b/g)) {
      const y = m[1] || m[2];
      counts[y] = (counts[y] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? +best[0] : new Date().getFullYear();
}

const TYPE_RE = /^(SEPA[- ]?)?(Basis-?)?(Lastschrift|Folgelastschrift|Erstlastschrift|Kartenzahlung|Kartentransaktion|dig\.\s?Karte(?:\s*\([^)]*\))?|Online-Überweisung|Online-Ueberweisung|Überweisung|Ueberweisung|Echtzeitüberweisung|Echtzeitueberweisung|Dauerauftrag|Gutschrift|Lohn,\s*Gehalt,\s*Rente|Lohn\/Gehalt|Gehalt\/Rente|GA-Verfügung(?:\s+eigen)?(?:\s*\/\s*Wert:\s*[\d.]+)?|Bargeldauszahlung|Bareinzahlung|Entgeltabrechnung|Abschluss|Entgelt|Zahlungseingang|Zahlungsausgang)(?=[\s:]|$)[:\s]*/i;

/** Nachträglich: Buchungsart vom Titel trennen (für Buchungen, die vor einer Parser-Verbesserung gespeichert wurden). */
export function splitType(tx) {
  if (tx.type) return false;
  const m = (tx.title || '').match(TYPE_RE);
  if (!m) return false;
  tx.type = m[0].replace(/[:\s]+$/, '');
  const rest = tx.title.slice(m[0].length).trim();
  if (rest) tx.title = rest;
  else { tx.title = tx.detail || tx.type; tx.detail = ''; }
  return true;
}

export function parseTransactions(pages, fileName) {
  const year = guessYear(pages);
  const txs = [];
  const balances = [];
  let columns = null;
  let cur = null;

  const close = () => {
    if (cur) {
      const tx = finish(cur, columns);
      if (tx) txs.push({ ...tx, file: fileName });
    }
    cur = null;
  };

  for (const lines of pages) {
    let lastY = null;
    for (const line of lines) {
      const text = line.text.trim();
      if (!text) continue;
      const hdr = detectHeader(line);
      if (hdr) { close(); columns = hdr; continue; }
      if (SKIP_RE.test(text)) {
        close();
        recordBalance(balances, text, findAmounts(line), txs.length);
        continue;
      }

      const d = matchDate(text, year);
      const amounts = findAmounts(line);
      if (d && (amounts.length || d.rest.trim().length > 2)) {
        close();
        cur = { date: d.date, parts: [], amounts, lines: [line], lastY: line.y };
        const rest = stripAmounts(d.rest, amounts, line.text.length - d.rest.length);
        if (rest) cur.parts.push(rest);
        lastY = line.y;
        continue;
      }
      if (cur) {
        const gap = Math.abs(cur.lastY - line.y);
        if (gap > 26 || cur.parts.length >= 4) { close(); continue; }
        if (!cur.amounts.length && amounts.length) cur.amounts = amounts;
        const rest = stripAmounts(text, amounts, 0);
        if (rest) cur.parts.push(rest);
        cur.lastY = line.y;
      }
      lastY = line.y;
    }
    close(); // Seitenende schließt die letzte Buchung
  }

  // Viele Banken drucken nur Abbuchungen mit Minus, Gutschriften ohne Vorzeichen.
  // Hat der Auszug Minus-Beträge, aber keine mit Plus, sind Beträge ohne Vorzeichen Gutschriften.
  const explicitNeg = txs.some((t) => t.signSource === 'explicit' && t.amount < 0);
  const explicitPos = txs.some((t) => t.signSource === 'explicit' && t.amount > 0);
  if (explicitNeg && !explicitPos) {
    for (const t of txs) if (t.signSource === 'guess') t.amount = Math.abs(t.amount);
  }
  return { txs, balance: pickBalance(balances, txs.length), holder: findHolder(pages) };
}

// Kontoinhaber aus dem Anschriftenfeld ("Herrn" / "Frau" + nächste Zeile)
function findHolder(pages) {
  const lines = (pages[0] || []).map((l) => l.text.trim());
  const i = lines.findIndex((t) => /^(herrn?|frau|firma|eheleute)$/i.test(t));
  const name = i >= 0 ? lines[i + 1] : '';
  return name && /^[\p{L} .'-]{4,60}$/u.test(name) ? name : '';
}

// Kontostand-Zeilen sammeln, um Anfangs- und Endsaldo abzugleichen.
// "at" = Anzahl der Buchungen davor, damit Zeilen aus Anlagen (z. B. Rechnungsabschluss
// hinter der Buchungstabelle) nicht als Endstand gelten.
function recordBalance(balances, text, amounts, at) {
  if (!amounts.length || !/(kontostand|saldo|übertrag|uebertrag)/i.test(text)) return;
  const a = amounts[0];
  const t = text.toLowerCase();
  const kind = /(übertrag|uebertrag)/.test(t) ? 'carry'
    : /(\bneu|end|schluss)/.test(t) ? 'closing'
    : /(\balt|anfang|vorher)/.test(t) ? 'opening' : 'plain';
  balances.push({ kind, value: (a.sign || 1) * a.value, at });
}

function pickBalance(balances, total) {
  // Bevorzugt: letzter Kontostand vor der ersten Buchung, erster nach der letzten Buchung
  const before = balances.filter((b) => b.at === 0 && b.kind !== 'carry');
  const after = balances.filter((b) => b.at === total && b.kind !== 'carry');
  if (total > 0 && before.length && after.length) {
    return { opening: before[before.length - 1].value, closing: after[0].value };
  }
  const main = balances.filter((b) => b.kind !== 'carry');
  const list = main.length ? main : balances;
  if (list.length < 2) return null;
  const opening = list.find((b) => b.kind === 'opening') || list[0];
  const closing = [...list].reverse().find((b) => b.kind === 'closing') || list[list.length - 1];
  if (opening === closing) return null;
  return { opening: opening.value, closing: closing.value };
}

function stripAmounts(text, amounts, offset) {
  let t = text;
  for (const a of [...amounts].sort((x, y) => y.index - x.index)) {
    const i = a.index - offset;
    if (i >= 0) t = t.slice(0, i) + ' ' + t.slice(i + a.length);
  }
  return t.replace(/\s+/g, ' ').trim();
}

function finish(cur, columns) {
  if (!cur.amounts.length) return null;
  let chosen = null;
  let sign = 0;
  let signSource = 'guess';
  for (const a of cur.amounts) {
    if (columns && columns.length) {
      const col = columns.reduce((best, c) => (Math.abs(c.x - a.x) < Math.abs(best.x - a.x) ? c : best));
      if (col.kind === 'balance' && cur.amounts.length > 1) continue;
      chosen = a;
      sign = a.sign || (col.kind === 'credit' ? 1 : col.kind === 'debit' ? -1 : 0);
      signSource = a.sign ? 'explicit' : sign ? 'column' : 'guess';
    } else {
      chosen = a;
      sign = a.sign;
      if (sign) signSource = 'explicit';
    }
    break;
  }
  if (!chosen) chosen = cur.amounts[0];
  const full = cur.parts.join(' · ');
  if (!sign) sign = POSITIVE_HINT.test(full) ? 1 : -1;
  if (!chosen.value) return null;

  const first = cur.parts[0] || '';
  const typeMatch = first.match(TYPE_RE);
  const type = typeMatch ? typeMatch[0].replace(/[:\s]+$/, '') : '';
  let title = typeMatch ? first.slice(typeMatch[0].length).trim() : first;
  let detailParts = cur.parts.slice(1);
  if (!title && detailParts.length) { title = detailParts[0]; detailParts = detailParts.slice(1); }

  return {
    date: cur.date,
    amount: Math.round(sign * chosen.value * 100) / 100,
    signSource,
    type,
    title: title || type || 'Buchung',
    detail: detailParts.join(' '),
    raw: cur.parts.join(' '),
  };
}

export function hasText(pages) {
  return pages.some((lines) => lines.some((l) => l.text.trim().length > 0));
}
