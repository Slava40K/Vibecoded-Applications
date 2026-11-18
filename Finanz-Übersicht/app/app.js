/* global pdfjsLib */
import { GROUPS, IGNORE, ALL_CATS, ANNUAL, groupOf, autoCategory, merchantKey } from './categories.js';
import { extractLines, parseTransactions, hasText, splitType } from './parser.js';
import { cleanTx } from './clean.js';
import { loadData, saveData, storageMode, emptyData, monthOf, addStatement, monthLabel, MONTH_NAMES } from './store.js';
import { waterfall, categoryBars, yearColumns, bindTooltips } from './charts.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const eur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n) => eur.format(n);
const fmtDate = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const VIEW_KEY = 'kassensturz.ansicht';
const state = {
  data: emptyData(),
  demo: false,
  period: { year: null, month: null }, // month = 'YYYY-MM' oder null für das ganze Jahr
  mode: 'list',
  open: new Set(),
  raw: {},
};
try { if (localStorage.getItem(VIEW_KEY) === 'chart') state.mode = 'chart'; } catch { /* egal */ }

// ---------- Buchungen vorbereiten ----------
function hydrate(tx, stmt) {
  if (!(tx.date instanceof Date)) tx.date = parseIso(tx.date);
  tx.holder = stmt.holder || '';
  tx.display = cleanTx(tx);
  // Schlüssel für gemerkte Zuordnungen. Bleibt vom Namen nichts übrig (z. B. Umbuchung von dir selbst),
  // wird der Originaltext genommen; ganz leer heißt: nur diese eine Buchung umstellen.
  tx.key = merchantKey(tx.display.name) || merchantKey(tx.title + ' ' + tx.detail);
  Object.defineProperty(tx, 'stmt', { value: stmt, enumerable: false, configurable: true });
}

function categorize(tx) {
  const remembered = tx.key && state.data.overrides[tx.key];
  if (remembered && (remembered === IGNORE || groupOf(remembered))) {
    tx.category = remembered;
    tx.remembered = true;
  } else {
    tx.category = autoCategory(`${tx.type} ${tx.title} ${tx.detail}`, tx.amount, { title: tx.title, holder: tx.holder });
    tx.remembered = false;
  }
}

function serialize(data) {
  return {
    version: 1,
    overrides: data.overrides,
    statements: data.statements.map((s) => ({
      id: s.id, month: s.month, files: s.files, balance: s.balance, holder: s.holder, importedAt: s.importedAt,
      txs: s.txs.map((t) => ({
        id: t.id, date: isoDate(t.date), amount: t.amount, type: t.type, title: t.title, detail: t.detail,
        raw: t.raw, category: t.category, remembered: !!t.remembered,
      })),
    })),
  };
}

function persist() {
  if (state.demo) return;
  saveData(serialize(state.data)).then((ok) => { if (!ok) toast('Speichern hat nicht geklappt. Läuft das Fenster „Kassensturz“ mit dem Server noch?'); });
}

// ---------- Dateien einlesen ----------
async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const status = $('status');
  $('rawtext').hidden = true;
  const problems = [];
  const done = [];

  for (const file of files) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      problems.push(`„${file.name}“ ist kein PDF. Lade den Kontoauszug als PDF-Datei hoch.`);
      continue;
    }
    status.textContent = `Lese „${file.name}“ …`;
    try {
      const pages = await extractLines(await file.arrayBuffer());
      if (!hasText(pages)) {
        problems.push(`„${file.name}“ enthält keinen lesbaren Text (vermutlich ein Scan). Lade den digitalen Auszug aus dem Online-Banking herunter.`);
        continue;
      }
      const { txs, balance, holder } = parseTransactions(pages, file.name);
      const rawText = pages.map((p, i) => `--- Seite ${i + 1} ---\n` + p.map((l) => l.text).join('\n')).join('\n\n');
      if (!txs.length) {
        problems.push(`In „${file.name}“ wurden keine Buchungen erkannt. Das Layout dieser Bank wird noch nicht unterstützt.`);
        $('rawtext-pre').textContent = rawText;
        $('rawtext').hidden = false;
        continue;
      }
      const month = monthOf(txs);
      const stmt = { id: `${month}-${Date.now()}`, month, files: [file.name], balance, holder, importedAt: new Date().toISOString(), txs };
      txs.forEach((tx, i) => { tx.id = `${month}:${file.name}#${i}`; hydrate(tx, stmt); categorize(tx); });
      const result = addStatement(state.data, stmt);
      // beim Zusammenführen hängen neue Buchungen am vorhandenen Monat
      const target = state.data.statements.find((s) => s.month === month);
      target.txs.forEach((t) => hydrate(t, target));
      state.raw[month] = rawText;
      done.push(result);
    } catch (err) {
      console.error(err);
      problems.push(`„${file.name}“ konnte nicht gelesen werden: ${err.message || err}. Prüfe, ob die Datei passwortgeschützt oder beschädigt ist.`);
    }
  }

  status.textContent = '';
  if (done.length) {
    persist();
    const last = done[done.length - 1].month;
    setPeriod(last.slice(0, 4), last);
    showReport(true);
    const msgs = done.map((d) => d.merged
      ? (d.added ? `${monthLabel(d.month)} ergänzt um ${d.added} neue Buchungen.` : `${monthLabel(d.month)} war schon vollständig gespeichert.`)
      : `${monthLabel(d.month)} gespeichert (${d.added} Buchungen).`);
    toast([...msgs, ...problems].join(' '));
  } else if (state.data.statements.length) {
    toast(problems.join(' '));
  } else {
    status.textContent = problems.join(' ');
  }
}

// ---------- Zeitraum ----------
const years = () => [...new Set(state.data.statements.map((s) => s.month.slice(0, 4)))].sort();
const statementsInPeriod = () => state.data.statements.filter((s) =>
  state.period.month ? s.month === state.period.month : s.month.startsWith(state.period.year));
const txsInPeriod = () => statementsInPeriod().flatMap((s) => s.txs);

function setPeriod(year, month) {
  state.period = { year, month };
  state.open.clear();
}

function latestPeriod() {
  const last = state.data.statements[state.data.statements.length - 1];
  if (last) setPeriod(last.month.slice(0, 4), last.month);
}

// ---------- Auswertung ----------
function totals(txs) {
  const byCat = {};
  for (const g of GROUPS) for (const c of g.cats) byCat[c] = { sum: 0, txs: [] };
  for (const tx of txs) {
    if (tx.category === IGNORE) continue;
    const g = groupOf(tx.category);
    if (!g) continue;
    byCat[tx.category].sum += g.direction === 'in' ? tx.amount : -tx.amount;
    byCat[tx.category].txs.push(tx);
  }
  const groupSums = {};
  for (const g of GROUPS) groupSums[g.id] = g.cats.reduce((s, c) => s + byCat[c].sum, 0);
  return { byCat, groupSums };
}

function showReport(animate) {
  $('intake').hidden = true;
  $('report').hidden = false;
  render();
  if (animate) {
    const sheet = $('printout');
    sheet.classList.remove('is-printing');
    void sheet.offsetWidth;
    sheet.classList.add('is-printing');
    window.scrollTo({ top: 0 });
  }
}

function showIntake() {
  $('report').hidden = true;
  $('intake').hidden = false;
  $('demo-btn').hidden = state.data.statements.length > 0;
}

function render() {
  if (!state.data.statements.length) { showIntake(); return; }
  renderRegister();
  const txs = txsInPeriod();
  const stmts = statementsInPeriod();
  const { byCat, groupSums } = totals(txs);
  const income = groupSums.einnahmen;
  const fix = groupSums.fixKosten;
  const vari = groupSums.variableKosten;
  const save = groupSums.sparRate;
  const rest = income - fix - vari - save;
  const isYear = !state.period.month;

  $('demo-banner').hidden = !state.demo;
  $('delete-btn').hidden = isYear || state.demo;

  // Kopf
  $('report-title').textContent = isYear ? `Jahr ${state.period.year}` : monthLabel(state.period.month);
  const ignored = txs.filter((t) => t.category === IGNORE).length;
  const files = stmts.flatMap((s) => s.files);
  $('stmt-meta').textContent = isYear
    ? `${stmts.length} ${stmts.length === 1 ? 'Monat' : 'Monate'} mit Auszug (${stmts.map((s) => SHORT[+s.month.slice(5) - 1]).join(', ')}), ${txs.length} Buchungen` + (ignored ? `, davon ${ignored} nicht gewertet` : '')
    : `${txs.length} Buchungen aus ${files.length === 1 ? files[0] : files.length + ' Auszügen'}` + (ignored ? `, davon ${ignored} nicht gewertet` : '');

  // Bilanz-Rechnung
  const term = (label, value, cls, op) => `
    ${op ? `<span class="eq__op" aria-hidden="true">${op}</span>` : ''}
    <div class="eq__term ${cls}">
      <span class="eq__value">${fmt(value)}</span>
      <span class="eq__label">${label}</span>
    </div>`;
  $('equation').innerHTML =
    term('Einnahmen', income, 'is-in') +
    term('Fixkosten', fix, 'is-fix', '−') +
    term('Variable Kosten', vari, 'is-var', '−') +
    term('Sparrate', save, 'is-save', '−') +
    term(rest >= 0 ? 'Übrig' : 'Mehr ausgegeben als eingenommen', rest, rest >= 0 ? 'is-rest' : 'is-deficit', '=');

  const avg = $('average');
  avg.hidden = !isYear || stmts.length < 2;
  if (isYear && stmts.length > 1) {
    const n = stmts.length;
    avg.textContent = `Im Schnitt pro Monat: ${fmt(income / n)} € Einnahmen, ${fmt((fix + vari) / n)} € Ausgaben, ${fmt(save / n)} € Sparrate, ${rest >= 0 ? `${fmt(rest / n)} € übrig` : `${fmt(-rest / n)} € mehr ausgegeben`}.`;
  }

  // Ansicht umschalten
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  $('listview').hidden = state.mode !== 'list';
  $('chartview').hidden = state.mode !== 'chart';

  renderReconcile(stmts);

  if (state.mode === 'chart') {
    renderCharts(byCat, { income, fix, vari, save });
    return;
  }

  // Aufteilung der Einnahmen
  const out = fix + vari + save;
  const base = Math.max(income, out, 0.01);
  const seg = (v, cls, label) => v > 0
    ? `<span class="split__seg ${cls}" style="width:${(v / base) * 100}%" title="${label}: ${fmt(v)} €"></span>` : '';
  const pct = (v) => income > 0 ? Math.round((v / income) * 100) + ' %' : '–';
  $('split').innerHTML = `
    <div class="split__bar" role="img" aria-label="Aufteilung: Fixkosten ${pct(fix)}, variable Kosten ${pct(vari)}, Sparrate ${pct(save)} der Einnahmen">
      ${seg(fix, 'is-fix', 'Fixkosten')}${seg(vari, 'is-var', 'Variable Kosten')}${seg(save, 'is-save', 'Sparrate')}${seg(rest, 'is-rest', 'Übrig')}
      ${out > income && income > 0 ? `<span class="split__limit" style="left:${(income / base) * 100}%"><span>Einnahmen</span></span>` : ''}
    </div>
    <ul class="split__legend">
      <li><i class="is-fix"></i>Fixkosten ${pct(fix)}</li>
      <li><i class="is-var"></i>Variable Kosten ${pct(vari)}</li>
      <li><i class="is-save"></i>Sparrate ${pct(save)}</li>
      ${rest > 0 ? `<li><i class="is-rest"></i>Übrig ${pct(rest)}</li>` : ''}
    </ul>`;

  const unsorted = byCat['Sonstiges'].txs.filter((t) => !t.remembered).length;
  const hint = $('hint');
  hint.hidden = unsorted < 3;
  hint.textContent = `${unsorted} Ausgaben liegen unter „Sonstiges“. Öffne die Kategorie und ordne sie zu. Kassensturz merkt sich die Zuordnung für alle Monate.`;

  $('groups').innerHTML = GROUPS.map((g) => renderGroup(g, byCat, groupSums[g.id], income)).join('');
}

// Registerleiste: Jahre und Monate
function renderRegister() {
  const ys = years();
  if (!ys.includes(state.period.year)) latestPeriod();
  const have = new Set(state.data.statements.map((s) => s.month));
  $('register-years').innerHTML = ys.map((y) =>
    `<button type="button" class="reg-year" data-year="${y}" aria-pressed="${y === state.period.year}">${y}</button>`).join('');
  const tabs = MONTH_NAMES.map((name, i) => {
    const key = `${state.period.year}-${String(i + 1).padStart(2, '0')}`;
    const on = have.has(key);
    const cur = state.period.month === key;
    return `<button type="button" class="reg-tab" data-month="${key}" ${on ? '' : 'disabled'} aria-current="${cur ? 'page' : 'false'}" title="${on ? monthLabel(key) : `${monthLabel(key)}: kein Auszug gespeichert`}">
      <span class="reg-tab__long">${name}</span><span class="reg-tab__short">${SHORT[i]}</span></button>`;
  }).join('');
  $('register-tabs').innerHTML = tabs +
    `<button type="button" class="reg-tab reg-tab--year" data-month="" aria-current="${state.period.month ? 'false' : 'page'}">Ganzes Jahr</button>`;
}

// Abgleich mit dem Kontostand
function renderReconcile(stmts) {
  const el = $('reconcile');
  const sign = (n) => (n > 0 ? '+' : '') + fmt(n);
  const check = stmts.map((s) => {
    const sum = s.txs.reduce((a, t) => a + t.amount, 0);
    const b = s.balance;
    return { s, sum, b, diff: b ? b.closing - b.opening - sum : null };
  });
  const withBal = check.filter((c) => c.b);
  const bad = withBal.filter((c) => Math.abs(c.diff) > 0.005);
  el.hidden = false;

  if (!withBal.length) {
    el.className = 'reconcile is-unknown';
    el.textContent = 'Kein Anfangs- und Endkontostand im Auszug gefunden. Prüfe die Summen deshalb selbst am Auszug.';
    return;
  }

  if (!state.period.month) {
    // Jahresansicht: kurze Zusammenfassung
    if (!bad.length) {
      const first = withBal[0].b.opening, last = withBal[withBal.length - 1].b.closing;
      el.className = 'reconcile is-ok';
      el.innerHTML = `<strong>Kontostand: ${fmt(first)} € → ${fmt(last)} € (${sign(last - first)} €).</strong> ` +
        (withBal.length === 1 ? 'Der Monat stimmt mit dem Kontostand im Auszug überein.' : `Alle ${withBal.length} Monate stimmen mit dem Kontostand im Auszug überein.`);
    } else {
      el.className = 'reconcile is-bad';
      el.innerHTML = `<strong>${bad.length} ${bad.length === 1 ? 'Monat weicht' : 'Monate weichen'} vom Kontostand ab.</strong>
        <ul class="reconcile__list">${bad.map((c) => `<li><span>${monthLabel(c.s.month)}: Differenz ${sign(c.diff)} €</span>
        <button type="button" class="btn btn--small" data-goto="${c.s.month}">Monat öffnen</button></li>`).join('')}</ul>`;
    }
    return;
  }

  if (!bad.length) {
    const c = withBal[0];
    const delta = c.b.closing - c.b.opening;
    el.className = 'reconcile is-ok';
    el.innerHTML = `<strong>Kontostand laut Auszug: ${fmt(c.b.opening)} € → ${fmt(c.b.closing)} € (${sign(delta)} €).</strong> ` +
      `Die Summe aller erkannten Buchungen passt genau dazu, es fehlt also keine Buchung.` +
      (delta < 0 && c.b.closing >= 0 ? ' Dein Konto war nicht im Minus, du hast in diesem Monat nur mehr ausgegeben (inklusive Sparrate) als eingenommen. Die Differenz kam aus dem vorhandenen Guthaben.' : '');
    return;
  }

  el.className = 'reconcile is-bad';
  el.innerHTML = bad.map((c) => {
    const near = (a, x) => Math.abs(a - x) < 0.005;
    const flip = c.s.txs.filter((t) => near(-2 * t.amount, c.diff));
    const drop = c.s.txs.filter((t) => near(-t.amount, c.diff));
    const item = (t, action, label) => `
      <li><span>${fmtDate(t.date)}, ${esc(t.display.name)}, ${t.amount > 0 ? '+' : ''}${fmt(t.amount)} €</span>
      <button type="button" class="btn btn--small" data-fix="${action}" data-tx="${esc(t.id)}">${label}</button></li>`;
    const suggestions = [
      ...flip.map((t) => item(t, 'flip', t.amount < 0 ? 'Als Gutschrift zählen' : 'Als Abbuchung zählen')),
      ...drop.map((t) => item(t, 'drop', 'Ist keine Buchung, entfernen')),
    ];
    return `<strong>Die erkannten Buchungen ergeben ${sign(c.sum)} €, der Kontostand hat sich aber um ${sign(c.b.closing - c.b.opening)} € verändert (Differenz ${sign(c.diff)} €).</strong> ` +
      (suggestions.length
        ? `Diese Buchung erklärt die Differenz genau. Vergleiche sie mit deinem Auszug:<ul class="reconcile__list">${suggestions.join('')}</ul>`
        : `Vermutlich fehlt eine Buchung über ${fmt(Math.abs(c.diff))} € oder ein Betrag wurde falsch gelesen. Vergleiche die Buchungen in den Kategorien mit deinem Auszug.`) +
      (state.raw[c.s.month] ? `<details class="rawtext"><summary>Erkannten Text des Auszugs anzeigen</summary><pre>${esc(state.raw[c.s.month])}</pre></details>` : '');
  }).join('<hr>');
}

// ---------- Diagramme ----------
const SERIES_OF = { fixKosten: 'fix', variableKosten: 'var', sparRate: 'save', einnahmen: 'in' };

function renderCharts(byCat, sums) {
  const host = $('charts');
  const width = Math.max(300, Math.floor(host.clientWidth || 600));
  const expenseItems = [];
  const incomeItems = [];
  for (const g of GROUPS) {
    for (const c of g.cats) {
      const item = { cat: c, value: byCat[c].sum, count: byCat[c].txs.length, series: SERIES_OF[g.id] };
      (g.direction === 'in' ? incomeItems : expenseItems).push(item);
    }
  }
  let html = '';
  if (state.period.month) {
    html += waterfall(sums, width);
  } else {
    const months = MONTH_NAMES.map((name, i) => {
      const key = `${state.period.year}-${String(i + 1).padStart(2, '0')}`;
      const stmt = state.data.statements.find((s) => s.month === key);
      if (!stmt) return { key, short: SHORT[i], label: name, has: false };
      const { groupSums } = totals(stmt.txs);
      return { key, short: SHORT[i], label: monthLabel(key), has: true,
        income: groupSums.einnahmen, fix: groupSums.fixKosten, vari: groupSums.variableKosten, save: groupSums.sparRate };
    });
    html += yearColumns(months, width);
  }
  const period = state.period.month ? 'diesem Monat' : `${state.period.year}`;
  html += categoryBars(expenseItems, width, 'Ausgaben nach Kategorie', `Fixkosten, variable Kosten und Sparrate in ${period}`);
  html += categoryBars(incomeItems, width, 'Einnahmen nach Quelle', `Alle Gutschriften in ${period}`);
  host.innerHTML = html;
}

function renderGroup(g, byCat, total, income) {
  const max = Math.max(...g.cats.map((c) => Math.abs(byCat[c].sum)), 0.01);
  const share = g.direction === 'out' && income > 0 ? `${Math.round((total / income) * 100)} % der Einnahmen` : '';
  const rows = g.cats.map((c) => {
    const { sum, txs } = byCat[c];
    const open = state.open.has(c);
    const id = 'cat-' + c.replace(/[^a-z0-9]/gi, '');
    const empty = txs.length === 0;
    return `
      <li class="cat ${empty ? 'is-empty' : ''} ${open ? 'is-open' : ''}">
        <button type="button" class="cat__row" data-cat="${esc(c)}" aria-expanded="${open}" aria-controls="${id}" ${empty ? 'disabled' : ''}>
          <span class="cat__name">${esc(c)}</span>
          <span class="cat__count">${empty ? '' : txs.length === 1 ? '1 Buchung' : txs.length + ' Buchungen'}${ANNUAL.has(c) && sum > 0 ? `<span class="cat__monthly">≈ ${fmt(sum / 12)} € pro Monat</span>` : ''}</span>
          <span class="cat__bar"><span style="width:${Math.max(0, (sum / max) * 100)}%"></span></span>
          <span class="cat__sum">${empty ? '–' : fmt(sum)}</span>
        </button>
        ${open ? `<ol class="txs" id="${id}">${[...txs].sort((a, b) => a.date - b.date).map(renderTx).join('')}</ol>` : ''}
      </li>`;
  }).join('');
  return `
    <section class="group group--${g.id}" aria-labelledby="g-${g.id}">
      <header class="group__head">
        <h3 id="g-${g.id}" class="group__name">${g.name}</h3>
        <span class="group__share">${share}</span>
        <span class="group__total">${fmt(total)} €</span>
      </header>
      <ul class="cats">${rows}</ul>
    </section>`;
}

function categoryOptions(selected) {
  return GROUPS.map((g) => `<optgroup label="${g.name}">${g.cats.map((c) =>
    `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>`).join('') +
    `<option value="${IGNORE}" ${selected === IGNORE ? 'selected' : ''}>Nicht werten (z. B. Umbuchung)</option>`;
}

function renderTx(tx) {
  const d = tx.display;
  const type = (tx.type || '').replace(/\s*\/\s*Wert:.*$/i, '').replace(/^dig\.\s?Karte\s*\(([^)]*)\)/i, 'Karte').trim();
  const how = [type !== d.name ? type : '', d.via && `über ${d.via}`].filter(Boolean).join(' ');
  return `
    <li class="tx">
      <span class="tx__date">${fmtDate(tx.date)}</span>
      <span class="tx__text" title="${esc(tx.raw)}">
        <span class="tx__title">${esc(d.name)}</span>
        ${d.purpose ? `<span class="tx__purpose">${esc(d.purpose)}</span>` : ''}
        ${how ? `<span class="tx__detail">${esc(how)}</span>` : ''}
      </span>
      <span class="tx__amount ${tx.amount < 0 ? 'is-neg' : 'is-pos'}">${tx.amount > 0 ? '+' : ''}${fmt(tx.amount)}</span>
      <label class="tx__cat">
        <span class="visually-hidden">Kategorie für ${esc(d.name)}</span>
        <select data-tx="${esc(tx.id)}">${categoryOptions(tx.category)}</select>
      </label>
    </li>`;
}

const allTxs = () => state.data.statements.flatMap((s) => s.txs);

// ---------- Interaktion ----------
$('groups').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat__row');
  if (!btn || btn.disabled) return;
  const c = btn.dataset.cat;
  state.open.has(c) ? state.open.delete(c) : state.open.add(c);
  render();
  document.querySelector(`.cat__row[data-cat="${CSS.escape(c)}"]`)?.focus();
});

$('groups').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-tx]');
  if (!sel) return;
  const tx = allTxs().find((t) => t.id === sel.dataset.tx);
  if (!tx) return;
  const cat = sel.value;
  let n = 0;
  for (const t of allTxs()) {
    if (t === tx || (tx.key && t.key === tx.key)) { t.category = cat; t.remembered = true; n++; }
  }
  if (tx.key) state.data.overrides[tx.key] = cat;
  persist();
  const target = cat === IGNORE ? 'Nicht werten' : cat;
  toast(n > 1
    ? `${n} Buchungen von „${tx.display.name}“ jetzt unter ${target}, in allen Monaten. Gemerkt für künftige Auszüge.`
    : `„${tx.display.name}“ jetzt unter ${target}.${tx.key ? ' Gemerkt für künftige Auszüge.' : ''}`);
  render();
});

$('reconcile').addEventListener('click', (e) => {
  const go = e.target.closest('button[data-goto]');
  if (go) { setPeriod(go.dataset.goto.slice(0, 4), go.dataset.goto); render(); return; }
  const btn = e.target.closest('button[data-fix]');
  if (!btn) return;
  const tx = allTxs().find((t) => t.id === btn.dataset.tx);
  if (!tx) return;
  if (btn.dataset.fix === 'flip') {
    tx.amount = -tx.amount;
    categorize(tx);
    toast(`„${tx.display.name}“ zählt jetzt als ${tx.amount > 0 ? 'Gutschrift' : 'Abbuchung'} unter ${tx.category}.`);
  } else {
    tx.stmt.txs.splice(tx.stmt.txs.indexOf(tx), 1);
    toast(`Zeile „${tx.display.name}“ über ${fmt(Math.abs(tx.amount))} € entfernt.`);
  }
  persist();
  render();
});

$('register').addEventListener('click', (e) => {
  const y = e.target.closest('button[data-year]');
  if (y) {
    const months = state.data.statements.filter((s) => s.month.startsWith(y.dataset.year));
    setPeriod(y.dataset.year, state.period.month ? months[months.length - 1].month : null);
    render();
    return;
  }
  const m = e.target.closest('button[data-month]');
  if (m && !m.disabled) {
    setPeriod(state.period.year, m.dataset.month || null);
    render();
    document.querySelector(`#register-tabs [data-month="${m.dataset.month}"]`)?.focus();
  }
});

$('viewswitch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  state.mode = b.dataset.mode;
  try { localStorage.setItem(VIEW_KEY, state.mode); } catch { /* egal */ }
  render();
});

$('charts').addEventListener('click', (e) => {
  const col = e.target.closest('[data-month]');
  if (col) { setPeriod(col.dataset.month.slice(0, 4), col.dataset.month); render(); }
});
bindTooltips($('charts'), $('chart-tip'));
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.mode === 'chart' && !$('report').hidden) render(); }, 150);
});

let toastTimer;
function toast(msg) {
  if (!msg) return;
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), 6000);
}

function exportCsv() {
  const rows = [['Monat', 'Datum', 'Buchungsart', 'Empfänger/Auftraggeber', 'Verwendungszweck', 'Über', 'Betrag', 'Gruppe', 'Kategorie', 'Originaltext']];
  for (const s of statementsInPeriod()) {
    for (const t of [...s.txs].sort((a, b) => a.date - b.date)) {
      const g = groupOf(t.category);
      rows.push([monthLabel(s.month), fmtDate(t.date), t.type, t.display.name, t.display.purpose, t.display.via, fmt(t.amount),
        g ? g.name : 'Nicht gewertet', g ? t.category : '', t.raw]);
    }
  }
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `kassensturz-${state.period.month || state.period.year}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function deleteMonth() {
  const m = state.period.month;
  if (!m) return;
  if (!confirm(`${monthLabel(m)} löschen? Die gespeicherten Buchungen dieses Monats werden entfernt. Deine Kategorie-Zuordnungen bleiben erhalten.`)) return;
  state.data.statements = state.data.statements.filter((s) => s.month !== m);
  persist();
  toast(`${monthLabel(m)} gelöscht.`);
  latestPeriod();
  render();
}

async function closeDemo() {
  state.demo = false;
  await init();
}

// Drag & Drop auf die ganze Seite
let depth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('is-dragging'); });
window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('is-dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  document.body.classList.remove('is-dragging');
  if (e.dataTransfer?.files?.length) {
    if (state.demo) { toast('Schließe zuerst das Beispiel, dann wird dein Auszug gespeichert.'); return; }
    handleFiles(e.dataTransfer.files);
  }
});
$('dropzone').addEventListener('dblclick', () => $('file-input').click());

$('file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
$('file-input-more').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
$('export-btn').addEventListener('click', exportCsv);
$('delete-btn').addEventListener('click', deleteMonth);
$('demo-close').addEventListener('click', closeDemo);
$('demo-btn').addEventListener('click', async () => {
  $('status').textContent = 'Lade Beispielauszug …';
  const res = await fetch('beispiel/kontoauszug-oktober-2026.pdf');
  if (!res.ok) { $('status').textContent = 'Der Beispielauszug fehlt. Starte Kassensturz über „Kassensturz starten.bat“, dann wird er erzeugt.'; return; }
  const blob = await res.blob();
  state.demo = true;
  state.data = emptyData();
  handleFiles([new File([blob], 'kontoauszug-oktober-2026.pdf', { type: 'application/pdf' })]);
});

// ---------- Start ----------
async function init() {
  state.data = await loadData();
  // Zuordnungen zu Kategorien, die es nicht mehr gibt, verwerfen
  for (const [k, cat] of Object.entries(state.data.overrides)) if (!ALL_CATS.has(cat)) delete state.data.overrides[k];
  // Gespeicherte Monate mit den aktuellen Regeln neu einordnen.
  // Von dir selbst gewählte Kategorien bleiben, solange es sie noch gibt.
  let changed = 0;
  for (const s of state.data.statements) {
    for (const t of s.txs) {
      if (splitType(t)) changed++;
      hydrate(t, s);
      if (!t.remembered || !ALL_CATS.has(t.category)) {
        const before = t.category;
        categorize(t);
        if (t.category !== before) changed++;
      }
    }
  }
  if (changed) persist();
  $('storage-note').textContent = storageMode() === 'server'
    ? 'Deine Auszüge werden in daten/kassensturz.json auf diesem Rechner gespeichert.'
    : 'Deine Auszüge werden in diesem Browser gespeichert. Starte Kassensturz über „Kassensturz starten.bat“, damit sie als Datei gesichert werden.';
  if (state.data.statements.length) {
    latestPeriod();
    showReport(false);
  } else {
    showIntake();
  }
}
init();

window.kassensturz = { handleFiles, state, render };
