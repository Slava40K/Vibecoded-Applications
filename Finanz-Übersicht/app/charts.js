// Diagramme als reines SVG. Farben kommen aus den CSS-Variablen (hell/dunkel).

const eur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const fmt = (n) => eur.format(n) + ' €';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SERIES = {
  in: { label: 'Einnahmen', cls: 'm-in' },
  fix: { label: 'Fixkosten', cls: 'm-fix' },
  var: { label: 'Variable Kosten', cls: 'm-var' },
  save: { label: 'Sparrate', cls: 'm-save' },
  rest: { label: 'Übrig', cls: 'm-rest' },
  deficit: { label: 'Fehlbetrag', cls: 'm-deficit' },
};

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, lo, hi };
}
const tickLabel = (v) => (Math.abs(v) >= 10000 ? eur0.format(v / 1000) + ' Tsd.' : eur0.format(v));

// Rechteck mit 4px gerundetem Datenende ('top' | 'bottom' | 'right' | 'none')
function bar(x, y, w, h, end, cls, tip) {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(4, h / 2, w / 2);
  let d;
  if (end === 'top') d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  else if (end === 'bottom') d = `M${x},${y}H${x + w}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}Z`;
  else if (end === 'right') d = `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  else d = `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `<path class="${cls}" d="${d}"${tip ? ` data-tip="${esc(tip)}"` : ''}/>`;
}

function legend(keys) {
  return `<ul class="chart__legend">${keys.map((k) =>
    `<li><i class="${SERIES[k].cls}${k === 'in' && keys.includes('fix') ? ' is-tick' : ''}"></i>${SERIES[k].label}</li>`).join('')}</ul>`;
}

function frame(title, sub, svg, legendHtml = '') {
  return `<figure class="chart">
    <figcaption><span class="chart__title">${title}</span>${sub ? `<span class="chart__sub">${sub}</span>` : ''}</figcaption>
    ${legendHtml}
    <div class="chart__plot">${svg}</div>
  </figure>`;
}

/** Wasserfall: Einnahmen − Fixkosten − Variable − Sparrate = Übrig */
export function waterfall({ income, fix, vari, save }, width) {
  const rest = income - fix - vari - save;
  const steps = [
    { key: 'in', label: 'Einnahmen', from: 0, to: income },
    { key: 'fix', label: 'Fixkosten', from: income, to: income - fix },
    { key: 'var', label: 'Variable Kosten', from: income - fix, to: income - fix - vari },
    { key: 'save', label: 'Sparrate', from: income - fix - vari, to: rest },
    { key: rest >= 0 ? 'rest' : 'deficit', label: rest >= 0 ? 'Übrig' : 'Fehlbetrag', from: 0, to: rest },
  ];
  const H = 300, padL = 64, padR = 12, padT = 28, padB = 44;
  const vals = steps.flatMap((s) => [s.from, s.to]);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v) => padT + (hi - v) / (hi - lo) * (H - padT - padB);
  const band = (width - padL - padR) / steps.length;
  const bw = Math.min(56, band * 0.56);

  let g = ticks.map((t) => `<line class="grid${t === 0 ? ' grid--zero' : ''}" x1="${padL}" x2="${width - padR}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${tickLabel(t)}</text>`).join('');

  steps.forEach((s, i) => {
    const x = padL + band * i + (band - bw) / 2;
    const top = y(Math.max(s.from, s.to)), bottom = y(Math.min(s.from, s.to));
    const anchored = s.from === 0;
    const goingDown = s.to < s.from;
    const end = anchored ? (s.to >= 0 ? 'top' : 'bottom') : (goingDown ? 'bottom' : 'top');
    const amount = Math.abs(s.to - s.from);
    const shown = s.key === 'in' || s.key === 'rest' || s.key === 'deficit' ? s.to : -amount;
    g += bar(x, top, bw, Math.max(1, bottom - top), end, SERIES[s.key].cls, `${s.label}: ${fmt(shown)}`);
    // Verbindungslinie zur nächsten Stufe
    if (i < steps.length - 1) {
      const nx = padL + band * (i + 1) + (band - bw) / 2;
      g += `<line class="connector" x1="${x + bw}" x2="${nx}" y1="${y(s.to)}" y2="${y(s.to)}"/>`;
    }
    const labelY = s.to >= s.from || anchored && s.to >= 0 ? top - 8 : bottom + 16;
    g += `<text class="value" x="${x + bw / 2}" y="${labelY}" text-anchor="middle">${shown < 0 ? '−' : ''}${eur0.format(Math.abs(shown))}</text>`;
    g += `<text class="axis axis--x" x="${x + bw / 2}" y="${H - padB + 22}" text-anchor="middle">${s.label}</text>`;
  });

  const svg = `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="Wasserfall von Einnahmen zu ${rest >= 0 ? 'Übrig' : 'Fehlbetrag'}">${g}</svg>`;
  return frame('Wohin das Geld floss', 'Von den Einnahmen über die Ausgaben bis zum Rest, in Euro', svg);
}

/** Waagerechte Balken je Kategorie, gefärbt nach Gruppe */
export function categoryBars(items, width, title, sub) {
  const rows = items.filter((r) => r.value > 0.004).sort((a, b) => b.value - a.value);
  if (!rows.length) return frame(title, sub, '<p class="chart__empty">Keine Ausgaben in diesem Zeitraum.</p>');
  const rowH = 30, padT = 6, labelW = Math.min(210, width * 0.42), valueW = 84;
  const H = padT + rows.length * rowH + 6;
  const max = Math.max(...rows.map((r) => r.value));
  const plotW = Math.max(40, width - labelW - valueW);
  let g = '';
  rows.forEach((r, i) => {
    const yy = padT + i * rowH;
    const w = (r.value / max) * plotW;
    g += `<rect class="hit" x="0" y="${yy}" width="${width}" height="${rowH}" data-tip="${esc(`${r.cat}: ${fmt(r.value)}${r.count ? ` (${r.count} Buchung${r.count === 1 ? '' : 'en'})` : ''}`)}"/>`;
    g += `<text class="axis axis--cat" x="${labelW - 12}" y="${yy + rowH / 2 + 4}" text-anchor="end">${esc(r.cat)}</text>`;
    g += bar(labelW, yy + (rowH - 16) / 2, Math.max(2, w), 16, 'right', SERIES[r.series].cls);
    g += `<text class="value" x="${labelW + w + 8}" y="${yy + rowH / 2 + 4}">${eur.format(r.value)}</text>`;
  });
  const keys = [...new Set(rows.map((r) => r.series))];
  const svg = `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="${esc(title)}">${g}</svg>`;
  return frame(title, sub, svg, keys.length > 1 ? legend(keys) : '');
}

/** Jahr: gestapelte Ausgaben je Monat + Einnahmen als Markierung */
export function yearColumns(months, width, onPick) {
  const H = 320, padL = 64, padR = 12, padT = 20, padB = 40;
  const totals = months.map((m) => (m.has ? m.fix + m.vari + m.save : 0));
  const { ticks, lo, hi } = niceTicks(0, Math.max(1, ...totals, ...months.map((m) => m.income || 0)));
  const y = (v) => padT + (hi - v) / (hi - lo) * (H - padT - padB);
  const band = (width - padL - padR) / 12;
  const bw = Math.min(24, band * 0.6);
  const GAP = 2;

  let g = ticks.map((t) => `<line class="grid${t === 0 ? ' grid--zero' : ''}" x1="${padL}" x2="${width - padR}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${tickLabel(t)}</text>`).join('');

  months.forEach((m, i) => {
    const cx = padL + band * i + band / 2;
    const x = cx - bw / 2;
    g += `<text class="axis axis--x${m.has ? '' : ' is-empty'}" x="${cx}" y="${H - padB + 20}" text-anchor="middle">${m.short}</text>`;
    if (!m.has) return;
    const parts = [['fix', m.fix], ['var', m.vari], ['save', m.save]].filter(([, v]) => v > 0.004);
    let base = 0;
    parts.forEach(([k, v], j) => {
      const top = y(base + v), bottom = y(base);
      const isTop = j === parts.length - 1;
      const h = bottom - top - (j > 0 ? GAP : 0);
      g += bar(x, top, bw, Math.max(1, h), isTop ? 'top' : 'none', SERIES[k].cls);
      base += v;
    });
    // Einnahmen-Markierung: breiter Strich
    if (m.income > 0) g += `<line class="income-tick" x1="${cx - bw / 2 - 6}" x2="${cx + bw / 2 + 6}" y1="${y(m.income)}" y2="${y(m.income)}"/>`;
    const rest = m.income - m.fix - m.vari - m.save;
    const tip = `${m.label}\nEinnahmen: ${fmt(m.income)}\nFixkosten: ${fmt(m.fix)}\nVariable Kosten: ${fmt(m.vari)}\nSparrate: ${fmt(m.save)}\n${rest >= 0 ? 'Übrig' : 'Fehlbetrag'}: ${fmt(rest)}`;
    g += `<rect class="hit hit--col" x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB + 28}" data-tip="${esc(tip)}" data-month="${m.key}"/>`;
  });

  const svg = `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="Ausgaben und Einnahmen je Monat">${g}</svg>`;
  return frame('Ausgaben je Monat', 'Gestapelt nach Gruppe, der Strich zeigt die Einnahmen. Klick auf einen Monat öffnet ihn.', svg,
    legend(['fix', 'var', 'save', 'in']));
}

/** Tooltip für alle Elemente mit data-tip innerhalb von root */
export function bindTooltips(root, tipEl) {
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) { tipEl.hidden = true; return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const r = root.getBoundingClientRect();
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let x = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
    if (x + tw > r.width) x = e.clientX - r.left - tw - 14;
    if (yy + th > r.height) yy = e.clientY - r.top - th - 14;
    tipEl.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, yy)}px)`;
  };
  root.addEventListener('pointermove', show);
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; });
}
