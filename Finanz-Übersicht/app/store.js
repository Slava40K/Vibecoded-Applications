// Speichert alle eingelesenen Auszüge, nach Monat geordnet.
// Primär in daten/kassensturz.json über den lokalen Server, sonst im Browser.

const LOCAL_KEY = 'kassensturz.daten.v1';
const OLD_OVERRIDES_KEY = 'kassensturz.zuordnungen.v1';

export const emptyData = () => ({ version: 1, statements: [], overrides: {} });

let mode = 'server';

export async function loadData() {
  let data = null;
  try {
    const res = await fetch('api/daten', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    mode = 'browser';
    try { data = JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch { data = null; }
  }
  if (!data || !Array.isArray(data.statements)) data = { ...emptyData(), ...(data || {}), statements: [] };
  data.overrides ||= {};
  // Zuordnungen aus der ersten Version übernehmen
  try {
    const old = JSON.parse(localStorage.getItem(OLD_OVERRIDES_KEY) || 'null');
    if (old) { data.overrides = { ...old, ...data.overrides }; localStorage.removeItem(OLD_OVERRIDES_KEY); }
  } catch { /* ignorieren */ }
  return data;
}

export const storageMode = () => mode;

let timer = null;
let pending = null;
export function saveData(data) {
  pending = data;
  clearTimeout(timer);
  return new Promise((resolve) => {
    timer = setTimeout(async () => {
      const body = JSON.stringify(pending, null, 1);
      if (mode === 'server') {
        try {
          const res = await fetch('api/daten', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
          if (!res.ok) throw new Error(res.status);
          return resolve(true);
        } catch { mode = 'browser'; }
      }
      try { localStorage.setItem(LOCAL_KEY, body); resolve(true); } catch { resolve(false); }
    }, 250);
  });
}

// ---------- Monate ----------
export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTH_NAMES[+m - 1]} ${y}`; };

// Monat eines Auszugs = häufigster Monat seiner Buchungen
export function monthOf(txs) {
  const count = {};
  for (const t of txs) {
    const d = new Date(t.date);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    count[k] = (count[k] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
}

const txKey = (t) => `${String(t.date).slice(0, 10)}|${t.amount}|${t.raw}`;

/** Fügt einen Auszug ein. Gibt { month, added, merged } zurück. */
export function addStatement(data, stmt) {
  const existing = data.statements.find((s) => s.month === stmt.month);
  if (!existing) {
    data.statements.push(stmt);
    data.statements.sort((a, b) => a.month.localeCompare(b.month));
    return { month: stmt.month, added: stmt.txs.length, merged: false };
  }
  const have = new Set(existing.txs.map(txKey));
  const fresh = stmt.txs.filter((t) => !have.has(txKey(t)));
  existing.txs.push(...fresh);
  existing.txs.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!existing.files.includes(stmt.files[0])) existing.files.push(...stmt.files);
  if (fresh.length && stmt.balance) {
    // Zeitraum erweitert: früheren Anfangs- und späteren Endstand nehmen
    if (!existing.balance) existing.balance = stmt.balance;
    else {
      const firstNew = stmt.txs[0]?.date, firstOld = existing.txs[0]?.date;
      if (firstNew && firstNew <= firstOld) existing.balance.opening = stmt.balance.opening;
      existing.balance.closing = stmt.balance.closing;
    }
  }
  return { month: stmt.month, added: fresh.length, merged: true };
}
