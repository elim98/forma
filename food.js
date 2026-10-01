'use strict';
/* Forma — dispensa, diario alimentare, testo libero, codice a barre, stima normocalorica */

const MEAL_LIST = [['colazione','Colazione'],['pranzo','Pranzo'],['cena','Cena'],['spuntini','Spuntini']];
const MEAL_NAME = Object.fromEntries(MEAL_LIST);

/* ---------- dispensa ---------- */
function parseUnits(s){ const u = {}; String(s || '').split(/[|,;]/).forEach(x => { const m = x.trim().match(/^([a-zà-ú' ]+?)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i); if (m) u[m[1].trim().toLowerCase()] = num(m[2]); }); return u; }
const unitsTxt = u => Object.entries(u || {}).map(([k, g]) => k + ':' + fmt1(g)).join(', ');
let _gen = null;
function genericFoods(){ if (!_gen) _gen = GENERIC_FOODS.map((r, i) => ({id: 'g' + i, n: r[0], b: '', k: r[1], p: r[2], c: r[3], f: r[4], u: parseUnits(r[5]), al: r[6] ? r[6].split(';') : [], src: 'generic'})); return _gen; }
function pantryAll(){
  const over = new Map((S.pantry || []).map(x => [x.id, x])), hidden = new Set(S.pantryHidden || []), list = [];
  genericFoods().forEach(g => { if (!hidden.has(g.id)) list.push(over.get(g.id) || g); });
  (S.pantry || []).forEach(x => { if (!x.id.startsWith('g')) list.push(x); });
  return list;
}
function findFood(id){ return pantryAll().find(x => x.id === id) || (S.pantry || []).find(x => x.id === id) || genericFoods().find(x => x.id === id) || null; }
function defPortion(f){ if (f.pg) return f.pg; const u = Object.values(f.u || {}); return u.length ? u[0] : 100; }
function defPortionLabel(f){ if (f.pg) return 'porzione'; const k = Object.keys(f.u || {}); return k.length ? k[0] : '100 g'; }
function unitG(f, unit){ return (f.u && f.u[unit]) || DEFAULT_UNITS[unit] || null; }
const fname = f => f.n + (f.b ? ' · ' + f.b : '');
function saveFood(f){ S.pantry = (S.pantry || []).filter(x => x.id !== f.id); S.pantry.push(f); }
function useCount(id){ return (S.foodUse || {})[id] || 0; }
function bumpUse(id){ S.foodUse = S.foodUse || {}; S.foodUse[id] = (S.foodUse[id] || 0) + 1; }

/* ---------- ricerca alimento da testo ---------- */
const STOP = new Set(['di','del','della','dello','dei','degli','delle','con','al','alla','allo','ai','agli','alle','il','lo','la','i','gli','le','ho','mangiato','bevuto','circa','po','un','una','uno','in','e','ed','poi','anche','per','da','a']);
const stem = w => w.length > 3 ? w.replace(/[aeio]$/, '') : w;
const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w)).map(stem);
function foodScore(q, f){
  const qt = toks(q); if (!qt.length) return 0;
  const nq = qt.join(' '); let best = 0;
  const names = [f.n].concat(f.al || []); if (f.b) names.push(f.n + ' ' + f.b, f.b + ' ' + f.n);
  names.forEach(x => {
    const xt = toks(x.replace(/\([^)]*\)/g, '')); if (!xt.length) return; const nx = xt.join(' ');
    let s = 0;
    if (nx === nq) s = 100;
    else {
      let inter = 0; qt.forEach(w => { if (xt.some(y => y === w || (w.length > 3 && (y.startsWith(w) || w.startsWith(y))))) inter++; });
      s = inter / qt.length * 70 - Math.max(0, xt.length - inter) * 6;
      if (nx.startsWith(nq) || nq.startsWith(nx)) s += 12;
    }
    if (s > best) best = s;
  });
  if (best > 0) { if (f.src !== 'generic') best += 6; best += Math.min(10, useCount(f.id) * 2); }
  return best;
}
function searchFoods(q, limit){ const all = pantryAll(); if (!norm(q)) return all.slice().sort((a, b) => useCount(b.id) - useCount(a.id) || (a.src === 'generic') - (b.src === 'generic') || a.n.localeCompare(b.n, 'it')).slice(0, limit || 50); return all.map(f => ({f, s: foodScore(q, f)})).filter(x => x.s >= 30).sort((a, b) => b.s - a.s).slice(0, limit || 50).map(x => x.f); }
function matchFood(q){ const r = pantryAll().map(f => ({f, s: foodScore(q, f)})).sort((a, b) => b.s - a.s)[0]; return r && r.s >= 40 ? r.f : null; }

const WORDNUM = {un:1, uno:1, una:1, "un'":1, mezzo:0.5, mezza:0.5, due:2, tre:3, quattro:4, cinque:5, sei:6};
const UNIT_RE = '(fett\\w*|vasett\\w*|cucchiain\\w*|cucchiai\\w*|cucchiaio|tazzin\\w*|tazz\\w*|bicchier\\w*|mancia\\w*|pezz\\w*|porzion\\w*|scatolett\\w*|confezion\\w*|lattin\\w*|quadratin\\w*|pacchett\\w*)';
function unitKey(w){ w = w.toLowerCase(); const map = [['cucchiain','cucchiaino'],['cucchiai','cucchiaio'],['tazzin','tazzina'],['tazz','tazza'],['fett','fetta'],['vasett','vasetto'],['bicchier','bicchiere'],['mancia','manciata'],['pezz','pezzo'],['porzion','porzione'],['scatolett','scatoletta'],['confezion','confezione'],['lattin','lattina'],['quadratin','quadratino'],['pacchett','pacchetto']]; const m = map.find(([p]) => w.startsWith(p)); return m ? m[1] : w; }
function parseFoodText(text){
  let meal = null; const t0 = text.toLowerCase();
  const mm = t0.match(/\b(colazione|pranzo|cena|spuntin\w*|merenda)\b/); if (mm) meal = mm[1].startsWith('spunt') || mm[1] === 'merenda' ? 'spuntini' : mm[1];
  const clean = t0.replace(/\b(a|per|ho|oggi|stamattina|stasera)\s+(colazione|pranzo|cena|merenda|spuntin\w*)\b/g, ' ').replace(/\b(colazione|pranzo|cena|merenda|spuntin\w*)\s*:/g, ' ').replace(/(\d),(\d)/g, '$1.$2');
  const chunks = clean.split(/[,;\n+]|\s+e\s+|\s+ed\s+|\s+con\s+|\s+poi\s+|\s+più\s+/).map(x => x.trim()).filter(Boolean);
  const rows = [];
  chunks.forEach(ch => {
    let q = ch, g = null, how = 'default', count = null, unit = null, m;
    if ((m = q.match(/(\d+(?:\.\d+)?)\s*(kg|grammi|grammo|gr|g|ml|cl|l)\b\.?/))) { const v = +m[1]; g = m[2] === 'kg' || m[2] === 'l' ? v * 1000 : m[2] === 'cl' ? v * 10 : v; how = 'g'; q = q.replace(m[0], ' '); }
    else if ((m = q.match(new RegExp('(\\d+(?:\\.\\d+)?|un\'|un|uno|una|mezz[oa]|due|tre|quattro|cinque|sei)\\s*' + UNIT_RE + '\\b(\\s+(di|d\'))?')))) { count = WORDNUM[m[1]] ?? +m[1]; unit = unitKey(m[2]); how = 'unit'; q = q.replace(m[0], ' '); }
    else if ((m = q.match(/^(\d+(?:\.\d+)?|un'|un|uno|una|mezz[oa]|due|tre|quattro|cinque|sei)\s+(.+)$/))) { const v = WORDNUM[m[1]] ?? +m[1]; if (v > 12) { g = v; how = 'g'; } else { count = v; how = 'count'; } q = m[2]; }
    else if ((m = q.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/))) { const v = +m[2]; if (v > 12) { g = v; how = 'g'; } else { count = v; how = 'count'; } q = m[1]; }
    q = q.replace(/\b(circa|un po'?|qualche|abbondante|scarso|scarsa)\b/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(di|d'|del|della|dei|delle)\s*/, '').trim();
    if (!q) return;
    const f = matchFood(q);
    if (f) {
      if (how === 'unit') g = count * (unitG(f, unit) || defPortion(f));
      else if (how === 'count') g = count * defPortion(f);
      else if (how === 'default') g = defPortion(f);
    }
    rows.push({q: cap(q), fid: f ? f.id : null, g: g != null ? Math.round(g) : null, how, unit, count});
  });
  return {meal, rows};
}

/* ---------- diario ---------- */
function dayLog(ds){ S.log = S.log || {}; return S.log[ds] || []; }
function entryFrom(f, g, meal, extra){ return Object.assign({id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), m: meal, fid: f.id, n: f.n, b: f.b || '', g: Math.round(g), k: f.k, p: f.p, c: f.c, f: f.f}, extra || {}); }
function addEntries(ds, entries){ S.log = S.log || {}; S.log[ds] = (S.log[ds] || []).concat(entries); entries.forEach(e => bumpUse(e.fid)); }
const eK = e => e.k * e.g / 100, eP = e => e.p * e.g / 100, eC = e => e.c * e.g / 100, eF = e => e.f * e.g / 100;
function totals(list){ return list.reduce((a, e) => ({k: a.k + eK(e), p: a.p + eP(e), c: a.c + eC(e), f: a.f + eF(e)}), {k:0, p:0, c:0, f:0}); }
function mealNow(){ const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 11 ? 'colazione' : h < 15.5 ? 'pranzo' : h < 18.5 ? 'spuntini' : 'cena'; }
function ensureAuto(ds){
  if (ds !== today()) return; S.autoDone = S.autoDone || {};
  if (S.autoDone[ds]) return; S.autoDone[ds] = true;
  const add = [];
  (S.saved || []).filter(x => x.auto).forEach(sm => {
    if (dayLog(ds).some(e => e.m === sm.m)) return;
    sm.items.forEach(it => { const f = findFood(it.fid); if (f) add.push(entryFrom(f, it.g, sm.m, {auto: true})); });
  });
  if (add.length) { addEntries(ds, add); }
  Object.keys(S.autoDone).forEach(d => { if (d < dstr(new Date(Date.now() - 60 * 864e5))) delete S.autoDone[d]; });
  save();
}
const shiftDay = (ds, n) => { const d = parseD(ds); d.setDate(d.getDate() + n); return dstr(d); };

/* ---------- energia: stima della normocalorica ---------- */
function bmrNow(){ const p = S.profile, w = weightNow(); return 10*w + 6.25*p.height - 5*ageOf(p.birth) + (p.sex === 'f' ? -161 : 5); }
function exerciseKcal(ds){ let k = 0; S.history.forEach(h => { if (h.date === ds) k += sessionKcal(h); }); (S.acts || []).forEach(a => { if (a.date === ds) k += actKcal(a); }); return k; }
function formulaMaint(){
  const neat = {low:1.3, mid:1.45, high:1.6}[S.profile.activity] || 1.45; let ex = 0;
  for (let i = 1; i <= 14; i++) ex += exerciseKcal(shiftDay(today(), -i));
  const avgEx = ex / 14 || (5 * weightNow() * (S.profile.duration || 60) / 60) * 0.4;
  return {base: bmrNow() * neat, ex: avgEx, total: bmrNow() * neat + avgEx};
}
function weightTrend(){
  const w = S.weights; if (!w.length) return {};
  const map = {}, byD = Object.fromEntries(w.map(x => [x.d, x.kg])); let tr = w[0].kg;
  for (let d = w[0].d; d <= today(); d = shiftDay(d, 1)) { if (byD[d] != null) tr = tr + 0.15 * (byD[d] - tr); map[d] = tr; }
  return map;
}
function energyEstimate(){
  const fm = formulaMaint(), tr = weightTrend(), end = shiftDay(today(), -1);
  let n = 0, sum = 0, first = null;
  for (let i = 1; i <= 35; i++) { const d = shiftDay(today(), -i), t = totals(dayLog(d)).k; if (t >= 900 && !(S.logSkip || {})[d]) { n++; sum += t; first = d; } }
  let adaptive = null, delta = null, span = null, wIn = 0;
  if (n >= 7 && first && tr[first] != null && tr[end] != null) {
    span = Math.round((parseD(end) - parseD(first)) / 864e5) + 1;
    wIn = S.weights.filter(x => x.d >= first && x.d <= end).length;
    if (span >= 10 && wIn >= 4) {
      // pendenza del peso con regressione lineare sulle pesate del periodo (meno ritardo della media mobile)
      const pts = S.weights.filter(x => x.d >= first && x.d <= end).map(x => [(parseD(x.d) - parseD(first)) / 864e5, x.kg]);
      const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), sxy = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0);
      const slope = sxx ? sxy / sxx : 0; delta = slope * (span - 1); adaptive = sum / n - slope * 7700;
    }
  }
  const wgt = adaptive != null ? Math.min(1, Math.max(0, (n - 7) / 14 + 0.25)) : 0;
  const est = adaptive != null ? wgt * adaptive + (1 - wgt) * fm.total : fm.total;
  const conf = adaptive == null ? 'solo formula' : n >= 21 ? 'buona' : n >= 14 ? 'discreta' : 'provvisoria';
  return {est, formula: fm, adaptive, n, intake: n ? sum / n : null, delta, span, wIn, conf, wgt};
}
const GOALS = {maint: {n:'Scoprire la mia normocalorica', f:1}, cut10: {n:'Ipocalorica leggera (−10%)', f:0.9}, cut15: {n:'Ipocalorica (−15%)', f:0.85}, bulk: {n:'Leggero surplus (+8%)', f:1.08}};
function kcalFloor(){ return Math.max(S.profile.sex === 'f' ? 1200 : 1500, bmrNow() * 1.1); }
function kcalRef(){ const e = energyEstimate(), g = GOALS[S.profile.goal] || GOALS.maint; let t = e.est * g.f; const floored = g.f < 1 && t < kcalFloor(); if (floored) t = kcalFloor(); return {e, target: Math.round(t / 10) * 10, goal: S.profile.goal || 'maint', floored}; }

/* ---------- Open Food Facts ---------- */
const OFF_FIELDS = 'code,product_name,product_name_it,generic_name_it,brands,nutriments,serving_quantity,quantity';
function offToFood(p, code){
  const n = p.nutriments || {}; let k = n['energy-kcal_100g']; if (k == null && n['energy_100g'] != null) k = n['energy_100g'] / 4.184;
  if (k == null) return null;
  const sq = num(p.serving_quantity);
  return {id: null, n: cap((p.product_name_it || p.product_name || p.generic_name_it || 'Prodotto').trim()), b: (p.brands || '').split(',')[0].trim(), bc: code || p.code || '', k: Math.round(k), p: +(n.proteins_100g || 0), c: +(n.carbohydrates_100g || 0), f: +(n.fat_100g || 0), u: {}, pg: isFinite(sq) && sq > 0 ? Math.round(sq) : null, al: [], src: 'off'};
}
async function offLookup(code){
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!r.ok && r.status !== 404) throw new Error('rete'); const j = await r.json();
  if (j.status !== 1 || !j.product) return null; return offToFood(j.product, code);
}
async function offSearch(q){
  const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${OFF_FIELDS}&lc=it`);
  if (!r.ok) throw new Error('rete'); const j = await r.json();
  return (j.products || []).map(p => offToFood(p, p.code)).filter(Boolean);
}

/* ================= viste cibo ================= */
function macroLine(t){ return `P ${fmt(t.p)} g · C ${fmt(t.c)} g · G ${fmt(t.f)} g`; }
function vCibo(){
  const tab = S.ui.ciboTab || 'diario';
  const tabs = [['diario','Diario'],['dispensa','Dispensa']].concat(S.diet ? [['piano','Piano dietista']] : []);
  const seg = `<div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab===k}" class="${tab===k?'on':''}" data-a="ciboTo" data-v="${k}">${l}</button>`).join('')}</div>`;
  const body = tab === 'dispensa' ? vDispensa() : tab === 'piano' && S.diet ? vPiano() : vDiario();
  return `<header class="col"><h1>Cibo</h1></header>${seg}${body}`;
}
function vDiario(){
  const ds = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(); ensureAuto(ds);
  const log = dayLog(ds), t = totals(log), ref = kcalRef(), isToday = ds === today();
  const pct = ref.target ? Math.min(100, t.k / ref.target * 100) : 0;
  const yest = dayLog(shiftDay(ds, -1));
  return `
  <div class="between datenav"><button class="icon-btn sm" data-a="logDay" data-d="-1" aria-label="Giorno precedente">${I.back}</button>
    <b>${isToday ? 'Oggi' : ds === shiftDay(today(), -1) ? 'Ieri' : cap(fdate(ds, {weekday:'long', day:'numeric', month:'long'}))}</b>
    <button class="icon-btn sm flip" data-a="logDay" data-d="1" aria-label="Giorno successivo" ${isToday ? 'disabled' : ''}>${I.back}</button></div>
  <section class="card tight">
    <div class="between bottom"><div class="col"><span class="sub">Mangiato</span><span class="big">${fmt(t.k)} <span class="unit">kcal</span></span></div>
    <span class="sub right">${ref.goal === 'maint' ? 'Normocalorica stimata' : 'Obiettivo'}<br><b class="ink">${fmt(ref.target)} kcal</b></span></div>
    <div class="kbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <span class="sub">${macroLine(t)}${ref.goal === 'maint' ? '' : ' · restano ' + fmt(Math.max(0, ref.target - t.k)) + ' kcal'}</span>
    ${ref.goal === 'maint' ? `<span class="note">Per ora non c'è un obiettivo: registra quello che mangi e pesati spesso, così l'app impara la tua normocalorica.</span>` : ''}
  </section>
  <section class="card tight">
    <label class="flabel" for="ftxt">Scrivi cosa hai mangiato</label>
    <textarea id="ftxt" class="ftxt" rows="2" placeholder="es. pasta integrale 90 g con ceci 150 g, zucchine e un cucchiaio d'olio"></textarea>
    <div class="row"><select id="fmeal" class="msel" aria-label="Pasto">${MEAL_LIST.map(([k, l]) => `<option value="${k}" ${k === mealNow() ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn dark" data-a="parseText" style="flex:1">Aggiungi</button></div>
  </section>
  ${MEAL_LIST.map(([m, label]) => { const items = log.filter(e => e.m === m), mt = totals(items), hasY = yest.some(e => e.m === m);
    return `<section class="meal">
      <div class="between"><h3>${label}</h3><span class="sub">${items.length ? fmt(mt.k) + ' kcal' : ''}</span></div>
      ${items.length ? `<ul class="items">${items.map(e => `<li class="ent"><button data-a="entEdit" data-id="${e.id}"><span class="col"><span>${esc(e.n)}${e.auto ? ' <span class="tag green">auto</span>' : ''}</span>${e.b ? `<span class="sub">${esc(e.b)}</span>` : ''}</span><span class="r">${fmt(e.g)} g · <b>${fmt(eK(e))}</b></span></button></li>`).join('')}</ul>` : ''}
      <div class="row wrap gap6"><button class="btn ghost small" data-a="addFood" data-m="${m}">${I.plus}Aggiungi</button>
      ${!items.length && hasY ? `<button class="btn ghost small" data-a="copyYest" data-m="${m}">Come ieri</button>` : ''}
      ${items.length ? `<button class="btn ghost small" data-a="saveMeal" data-m="${m}">Salva come abituale</button>` : ''}</div>
    </section>`; }).join('')}
  ${log.length ? `<label class="checkrow"><input type="checkbox" data-c="logSkip" ${(S.logSkip || {})[ds] ? 'checked' : ''}> Giornata incompleta: non usarla per stimare la normocalorica</label>` : ''}`;
}
function vDispensa(){
  const saved = S.saved || [];
  return `
  <div class="grid3"><button class="btn dark tall" data-a="scanOpen">${I.scan}<span>Codice a barre</span></button><button class="btn ghost tall" data-a="offOpen">${I.search}<span>Cerca online</span></button><button class="btn ghost tall" data-a="foodEdit">${I.plus}<span>A mano</span></button></div>
  <h2>Pasti abituali</h2>
  ${saved.length ? `<div class="list">${saved.map(s => { const tt = s.items.reduce((a, it) => { const f = findFood(it.fid); return a + (f ? f.k * it.g / 100 : 0); }, 0);
    return `<div class="li"><button class="grow plainbtn" data-a="savedEdit" data-id="${s.id}"><span class="col"><b>${esc(s.name)}</b><span class="sub">${MEAL_NAME[s.m]} · ${s.items.length} alimenti · ${fmt(tt)} kcal</span></span></button>
      <span class="col center"><span class="sub small">Auto</span><button class="switch ${s.auto ? 'on' : ''}" role="switch" aria-checked="${!!s.auto}" aria-label="Aggiungi ogni giorno in automatico" data-a="savedAuto" data-id="${s.id}"><i></i></button></span></div>`; }).join('')}</div>`
  : `<div class="empty">Nel diario, sotto un pasto, tocca «Salva come abituale». Con «Auto» la tua colazione si aggiunge da sola ogni giorno.</div>`}
  <h2>Alimenti</h2>
  <div class="field"><input id="pq" type="search" placeholder="Cerca nella dispensa" data-c="pq" value="${esc(S.ui.pq || '')}" aria-label="Cerca nella dispensa"></div>
  <div id="plist" class="list">${pantryListHtml(S.ui.pq || '')}</div>`;
}
function pantryListHtml(q){
  const res = searchFoods(q, 60);
  return res.length ? res.map(f => `<button class="li btnrow" data-a="foodEdit" data-id="${f.id}"><span class="col"><b>${esc(f.n)}</b><span class="sub">${f.b ? esc(f.b) + ' · ' : ''}${f.src === 'generic' ? 'valori medi' : f.src === 'off' ? 'Open Food Facts' : 'inserito da te'}</span></span><span class="r">${fmt(f.k)} kcal/100 g</span></button>`).join('') : `<div class="empty">Nessun alimento trovato.</div>`;
}

/* ---------- fogli ---------- */
let FCTX = null; // contesto: {ds, m} quando si aggiunge al diario
function addFoodSheet(m){
  FCTX = {ds: S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(), m};
  const saved = (S.saved || []);
  openSheet('Aggiungi a ' + MEAL_NAME[m].toLowerCase(), `
    <div class="grid2"><button class="btn dark" data-a="scanOpen">${I.scan}Codice a barre</button><button class="btn ghost" data-a="offOpen">${I.search}Cerca online</button></div>
    ${saved.length ? `<h2>Pasti abituali</h2><div class="list">${saved.map(s => `<button class="li btnrow" data-a="savedAdd" data-id="${s.id}"><span>${esc(s.name)}</span><span class="r">${I.plus}</span></button>`).join('')}</div>` : ''}
    <h2>Dalla dispensa</h2>
    <div class="field"><input id="aq" type="search" placeholder="Cerca un alimento" data-c="aq" autocomplete="off" aria-label="Cerca un alimento"></div>
    <div id="alist" class="list">${addListHtml('')}</div>`);
}
function addListHtml(q){ const r = searchFoods(q, 30); return r.map(f => `<button class="li btnrow" data-a="qtyOpen" data-id="${f.id}"><span class="col"><b>${esc(f.n)}</b>${f.b ? `<span class="sub">${esc(f.b)}</span>` : ''}</span><span class="r">${fmt(f.k)} kcal/100 g</span></button>`).join('') + (q ? `<button class="li btnrow" data-a="foodEdit" data-name="${esc(q)}"><span>Crea «${esc(q)}»</span><span class="r">${I.plus}</span></button>` : ''); }
function qtySheet(fid, entryId){
  const f = findFood(fid) || (entryId ? (() => { const e = Object.values(S.log).flat().find(x => x.id === entryId); return e ? {id: e.fid, n: e.n, b: e.b, k: e.k, p: e.p, c: e.c, f: e.f, u: {}} : null; })() : null);
  if (!f) return;
  const e = entryId ? dayLog(FCTX.ds).find(x => x.id === entryId) : null;
  const g = e ? e.g : defPortion(f);
  const units = Object.entries(f.u || {}).concat(f.pg ? [['porzione', f.pg]] : []);
  openSheet(fname(f), `
    <span class="sub">Per 100 g: ${fmt(f.k)} kcal · P ${fmt1(f.p)} · C ${fmt1(f.c)} · G ${fmt1(f.f)}</span>
    <div class="row"><div class="field" style="flex:1"><label for="qg">Quantità (g o ml)</label><input id="qg" inputmode="decimal" value="${g}" data-c="qg" data-k="${f.k}"></div><div class="col center"><span class="sub">kcal</span><b class="n20" id="qk">${fmt(f.k * g / 100)}</b></div></div>
    ${units.length ? `<div class="chips">${units.map(([u, ug]) => [0.5, 1, 2].map(n => `<button class="chipbtn" data-a="qtyUnit" data-g="${ug * n}">${n === 0.5 ? '½' : n} ${esc(u)}${n > 1 && !/[ie]$/.test(u) ? '' : ''} (${fmt(ug * n)} g)</button>`).join('')).join('')}</div>` : ''}
    ${e ? `<div class="field"><label for="qm">Pasto</label><select id="qm">${MEAL_LIST.map(([k, l]) => `<option value="${k}" ${k === e.m ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    <button class="btn dark full" data-a="qtySave" data-id="${f.id}" data-e="${entryId || ''}">${e ? 'Salva' : 'Aggiungi'}</button>
    ${e ? `<button class="btn danger full" data-a="entDel" data-e="${entryId}">${I.trash}Togli dal diario</button>` : ''}`, e || !FCTX.m ? null : () => addFoodSheet(FCTX.m));
}
function foodEditSheet(f, after){
  const isNew = !f || !f.id;
  f = Object.assign({n:'', b:'', bc:'', k:'', p:'', c:'', f:'', u:{}, pg:'', al:[]}, f || {});
  FCTX = Object.assign(FCTX || {}, {after: after || null});
  const v = x => x === '' || x == null ? '' : String(Math.round(x * 10) / 10).replace('.', ',');
  openSheet(isNew ? (f.src === 'off' ? 'Prodotto trovato' : 'Nuovo alimento') : 'Alimento', `
    ${f.src === 'off' ? `<div class="callout green">Dati da Open Food Facts: controllali con l'etichetta prima di salvare.</div>` : ''}
    ${f.src === 'generic' ? `<p class="note">Valori medi del database integrato. Se usi una marca precisa, correggili con quelli dell'etichetta.</p>` : ''}
    <div class="field"><label for="fn">Nome</label><input id="fn" value="${esc(f.n)}"></div>
    <div class="grid2"><div class="field"><label for="fb">Marca</label><input id="fb" value="${esc(f.b)}" placeholder="facoltativa"></div><div class="field"><label for="fbc">Codice a barre</label><input id="fbc" inputmode="numeric" value="${esc(f.bc || '')}" placeholder="facoltativo"></div></div>
    <span class="flabel">Valori per 100 g (dall'etichetta)</span>
    <div class="grid2"><div class="field"><label for="fk">Kcal</label><input id="fk" inputmode="decimal" value="${v(f.k)}"></div><div class="field"><label for="fp">Proteine (g)</label><input id="fp" inputmode="decimal" value="${v(f.p)}"></div>
    <div class="field"><label for="fc">Carboidrati (g)</label><input id="fc" inputmode="decimal" value="${v(f.c)}"></div><div class="field"><label for="ff">Grassi (g)</label><input id="ff" inputmode="decimal" value="${v(f.f)}"></div></div>
    <div class="grid2"><div class="field"><label for="fpg">Porzione abituale (g)</label><input id="fpg" inputmode="decimal" value="${v(f.pg)}" placeholder="${f.u && Object.values(f.u)[0] ? Object.values(f.u)[0] : 100}"></div><div class="field"><label for="fu">Unità (es. fetta:30)</label><input id="fu" value="${esc(unitsTxt(f.u))}" placeholder="fetta:30, vasetto:125"></div></div>
    <div class="field"><label for="fal">Altri nomi con cui la scrivi</label><input id="fal" value="${esc((f.al || []).join(', '))}" placeholder="es. latte di soia, soia"></div>
    <button class="btn dark full" data-a="foodSave" data-id="${f.id || ''}" data-src="${f.src || 'user'}">${FCTX && FCTX.m && isNew ? 'Salva e aggiungi al pasto' : 'Salva'}</button>
    ${!isNew && FCTX && FCTX.m ? `<button class="btn ghost full" data-a="qtyOpen" data-id="${f.id}">Aggiungi al pasto</button>` : ''}
    ${!isNew ? `<button class="btn danger full" data-a="foodDel" data-id="${f.id}">${I.trash}${f.src === 'generic' ? 'Nascondi dalla dispensa' : 'Elimina dalla dispensa'}</button>` : ''}`);
}
function scanSheet(){
  openSheet('Codice a barre', `
    <div class="scanbox"><video id="scanVideo" playsinline muted autoplay></video><div class="scanguide" aria-hidden="true"></div></div>
    <p class="note" id="scanSt">Inquadra il codice a barre dentro il riquadro, ben illuminato e dritto.</p>
    <div class="grid2"><button class="btn ghost" data-a="scanPhoto">Scatta una foto</button><button class="btn ghost" data-a="scanType">Scrivi il numero</button></div>
    <div id="scanManual" class="row hidden"><div class="field" style="flex:1"><input id="scanCode" inputmode="numeric" placeholder="es. 8001234567890" aria-label="Numero del codice a barre"></div><button class="btn dark" data-a="scanGo">Cerca</button></div>`);
  const v = document.getElementById('scanVideo');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { document.getElementById('scanSt').textContent = 'La fotocamera non è disponibile qui: scatta una foto o scrivi il numero.'; return; }
  Scanner.start(v, code => { tone && tone([1200], .12); handleBarcode(code); }, () => { const st = document.getElementById('scanSt'); if (st) st.textContent = 'Non posso usare la fotocamera (permesso negato?). Scatta una foto o scrivi il numero.'; });
}
async function handleBarcode(code){
  Scanner.stop();
  const own = pantryAll().find(f => f.bc === code);
  if (own) { if (FCTX && FCTX.m) qtySheet(own.id); else foodEditSheet(own); return; }
  openSheet('Codice ' + code, `<p class="note" id="offSt">Cerco il prodotto su Open Food Facts…</p>`);
  try {
    const f = await offLookup(code);
    if (f) foodEditSheet(f);
    else { foodEditSheet({bc: code, src: 'user'}); const b = document.getElementById('sheetBody'); b.insertAdjacentHTML('afterbegin', `<div class="callout">Prodotto non trovato nel database. Copia i valori dall'etichetta: la prossima volta lo riconoscerò da solo.</div>`); }
  } catch (e) {
    foodEditSheet({bc: code, src: 'user'}); const b = document.getElementById('sheetBody'); b.insertAdjacentHTML('afterbegin', `<div class="callout">Sei offline o il servizio non risponde. Inserisci i valori dall'etichetta.</div>`);
  }
}
function offSheet(){
  openSheet('Cerca online', `<p class="note">Cerca per nome e marca nel database gratuito Open Food Facts (serve internet).</p>
    <div class="row"><div class="field" style="flex:1"><input id="offQ" type="search" placeholder="es. tofu Sojasun" aria-label="Cerca prodotto"></div><button class="btn dark" data-a="offGo">Cerca</button></div>
    <div id="offRes" class="list"></div>`);
}
let OFF_RES = [];
function textPreviewSheet(parsed, meal, ds){
  FCTX = {ds, m: meal, rows: parsed.rows};
  const rowsHtml = parsed.rows.map((r, i) => { const f = r.fid ? findFood(r.fid) : null;
    return f ? `<div class="prow"><button class="grow plainbtn" data-a="prowPick" data-i="${i}"><span class="col"><b>${esc(f.n)}</b><span class="sub">${f.b ? esc(f.b) + ' · ' : ''}hai scritto «${esc(r.q)}»${r.how === 'default' ? ' · porzione abituale' : ''}</span></span></button><input inputmode="decimal" value="${r.g}" data-c="prowG" data-i="${i}" aria-label="Grammi di ${esc(f.n)}"><span class="pk" id="pk${i}">${fmt(f.k * r.g / 100)}</span><button class="x" data-a="prowDel" data-i="${i}" aria-label="Togli">${I.x}</button></div>`
      : `<div class="prow miss"><span class="col grow"><b>«${esc(r.q)}»</b><span class="sub">Non lo trovo nella dispensa</span></span><button class="btn ghost small" data-a="prowPick" data-i="${i}">Scegli</button><button class="btn ghost small" data-a="prowNew" data-i="${i}">Crea</button><button class="x" data-a="prowDel" data-i="${i}" aria-label="Togli">${I.x}</button></div>`; }).join('');
  const ok = parsed.rows.filter(r => r.fid), tot = ok.reduce((a, r) => a + findFood(r.fid).k * r.g / 100, 0);
  openSheet('Controlla e aggiungi', `
    <div class="field"><label for="pm">Pasto</label><select id="pm" data-c="pm">${MEAL_LIST.map(([k, l]) => `<option value="${k}" ${k === meal ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${parsed.rows.length ? `<div class="plist">${rowsHtml}</div>` : '<div class="empty">Non ho riconosciuto alimenti.</div>'}
    <div class="between"><span class="sub">Totale</span><b id="ptot">${fmt(tot)} kcal</b></div>
    <p class="note">Tocca un alimento per cambiarlo. Quando scegli o crei un alimento per una parola nuova, me la ricordo per le prossime volte.</p>
    <button class="btn dark full" data-a="prowSave" ${ok.length ? '' : 'disabled'}>Aggiungi ${ok.length} ${ok.length === 1 ? 'alimento' : 'alimenti'}</button>`);
}
function pickFoodSheet(onPick, q){
  openSheet('Scegli alimento', `<div class="field"><input id="pfq" type="search" value="${esc(q || '')}" placeholder="Cerca" data-c="pfq" aria-label="Cerca"></div><div id="pflist" class="list">${pickListHtml(q || '')}</div>`, () => textPreviewSheet({rows: FCTX.rows}, FCTX.m, FCTX.ds));
  PICK_CB = onPick;
}
let PICK_CB = null;
function pickListHtml(q){ return searchFoods(q, 30).map(f => `<button class="li btnrow" data-a="pfPick" data-id="${f.id}"><span class="col"><b>${esc(f.n)}</b>${f.b ? `<span class="sub">${esc(f.b)}</span>` : ''}</span><span class="r">${fmt(f.k)} kcal</span></button>`).join(''); }
function learnAlias(f, q){ const nq = String(q || '').toLowerCase().trim(); if (!nq || norm(nq) === norm(f.n) || (f.al || []).some(a => norm(a) === norm(nq))) return; const g = Object.assign({}, f, {al: (f.al || []).concat(nq)}); saveFood(g); }

/* ================= azioni ================= */
Object.assign(A, {
  ciboTo(el){ S.ui.ciboTab = el.dataset.v; save(); render(); },
  logDay(el){ const cur = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(); const n = shiftDay(cur, +el.dataset.d); if (n > today()) return; S.ui.logDay = n === today() ? null : n; render(); },
  parseText(){
    const t = document.getElementById('ftxt').value.trim(); if (!t) { document.getElementById('ftxt').focus(); return; }
    const p = parseFoodText(t), meal = p.meal || document.getElementById('fmeal').value;
    textPreviewSheet(p, meal, S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today());
  },
  prowPick(el){ const i = +el.dataset.i; pickFoodSheet(f => { const r = FCTX.rows[i]; learnAlias(f, r.q); r.fid = f.id; if (r.g == null || r.how !== 'g') r.g = Math.round(r.how === 'unit' ? r.count * (unitG(f, r.unit) || defPortion(f)) : (r.count || 1) * defPortion(f)); save(); textPreviewSheet({rows: FCTX.rows}, FCTX.m, FCTX.ds); }, FCTX.rows[i].q); },
  pfPick(el){ const f = findFood(el.dataset.id); if (PICK_CB && f) { const cb = PICK_CB; PICK_CB = null; cb(f); } },
  prowNew(el){ const i = +el.dataset.i, r = FCTX.rows[i]; FCTX.newRow = i; foodEditSheet({n: r.q, al: [], src: 'user'}, f => { r.fid = f.id; if (r.g == null) r.g = Math.round((r.count || 1) * defPortion(f)); textPreviewSheet({rows: FCTX.rows}, FCTX.m, FCTX.ds); }); },
  prowDel(el){ FCTX.rows.splice(+el.dataset.i, 1); textPreviewSheet({rows: FCTX.rows}, FCTX.m, FCTX.ds); },
  prowSave(){
    const m = document.getElementById('pm').value, ents = FCTX.rows.filter(r => r.fid && r.g > 0).map(r => entryFrom(findFood(r.fid), r.g, m));
    addEntries(FCTX.ds, ents); save(); closeSheet(); const ta = document.getElementById('ftxt'); if (ta) ta.value = ''; render();
    toast('Aggiunto a ' + MEAL_NAME[m].toLowerCase(), fmt(totals(ents).k) + ' kcal');
  },
  addFood(el){ addFoodSheet(el.dataset.m); },
  qtyOpen(el){ if (!FCTX || !FCTX.m) FCTX = {ds: today(), m: mealNow()}; qtySheet(el.dataset.id); },
  qtyUnit(el){ const i = document.getElementById('qg'); i.value = el.dataset.g; i.dispatchEvent(new Event('input', {bubbles: true})); },
  qtySave(el){
    const g = num(document.getElementById('qg').value); if (!(g > 0)) { alert('Inserisci una quantità.'); return; }
    const eid = el.dataset.e;
    if (eid) { const list = dayLog(FCTX.ds), e = list.find(x => x.id === eid); e.g = Math.round(g); e.auto = false; const qm = document.getElementById('qm'); if (qm) e.m = qm.value; }
    else { const f = findFood(el.dataset.id); addEntries(FCTX.ds, [entryFrom(f, g, FCTX.m)]); }
    save(); closeSheet(); render();
  },
  entEdit(el){ FCTX = {ds: S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today()}; const e = dayLog(FCTX.ds).find(x => x.id === el.dataset.id); FCTX.m = e.m; qtySheet(e.fid, e.id); },
  entDel(el){ const ds = FCTX.ds; S.log[ds] = dayLog(ds).filter(x => x.id !== el.dataset.e); save(); closeSheet(); render(); },
  copyYest(el){ const ds = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(), m = el.dataset.m; const src = dayLog(shiftDay(ds, -1)).filter(e => e.m === m); addEntries(ds, src.map(e => Object.assign({}, e, {id: 'e' + Math.random().toString(36).slice(2, 10), auto: false}))); save(); render(); },
  saveMeal(el){
    const ds = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(), m = el.dataset.m, items = dayLog(ds).filter(e => e.m === m);
    openSheet('Pasto abituale', `<div class="field"><label for="smn">Nome</label><input id="smn" value="${esc(MEAL_NAME[m] + ' abituale')}"></div>
      <ul class="items">${items.map(e => `<li><span>${esc(e.n)}</span><span>${fmt(e.g)} g</span></li>`).join('')}</ul>
      <label class="checkrow"><input type="checkbox" id="sma" ${m === 'colazione' ? 'checked' : ''}> Aggiungilo in automatico ogni giorno (se quel pasto è ancora vuoto). Potrai sempre togliere o cambiare qualcosa.</label>
      <button class="btn dark full" data-a="saveMealGo" data-m="${m}">Salva</button>`);
  },
  saveMealGo(el){
    const ds = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(), m = el.dataset.m;
    const items = dayLog(ds).filter(e => e.m === m).map(e => ({fid: e.fid, g: e.g}));
    S.saved = (S.saved || []).concat({id: 's' + Date.now().toString(36), name: document.getElementById('smn').value.trim() || MEAL_NAME[m], m, items, auto: document.getElementById('sma').checked});
    save(); closeSheet(); render(); toast('Pasto abituale salvato');
  },
  savedAdd(el){ const s = S.saved.find(x => x.id === el.dataset.id), ents = s.items.map(it => { const f = findFood(it.fid); return f ? entryFrom(f, it.g, FCTX.m) : null; }).filter(Boolean); addEntries(FCTX.ds, ents); save(); closeSheet(); render(); },
  savedAuto(el){ const s = S.saved.find(x => x.id === el.dataset.id); s.auto = !s.auto; save(); render(); },
  savedEdit(el){
    const s = S.saved.find(x => x.id === el.dataset.id);
    openSheet(s.name, `<div class="field"><label for="sen">Nome</label><input id="sen" value="${esc(s.name)}"></div>
      <div class="field"><label for="sem">Pasto</label><select id="sem">${MEAL_LIST.map(([k, l]) => `<option value="${k}" ${k === s.m ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${s.items.map((it, i) => { const f = findFood(it.fid); return `<div class="prow"><span class="col grow"><b>${esc(f ? f.n : 'Alimento eliminato')}</b>${f && f.b ? `<span class="sub">${esc(f.b)}</span>` : ''}</span><input inputmode="decimal" value="${it.g}" id="seg${i}" aria-label="Grammi"><span class="sub">g</span></div>`; }).join('')}
      <p class="note">Per aggiungere o togliere alimenti: componi il pasto nel diario e salvalo di nuovo come abituale.</p>
      <button class="btn dark full" data-a="savedSave" data-id="${s.id}">Salva</button><button class="btn danger full" data-a="savedDel" data-id="${s.id}">${I.trash}Elimina</button>`);
  },
  savedSave(el){ const s = S.saved.find(x => x.id === el.dataset.id); s.name = document.getElementById('sen').value.trim() || s.name; s.m = document.getElementById('sem').value; s.items.forEach((it, i) => { const g = num(document.getElementById('seg' + i).value); if (g > 0) it.g = Math.round(g); }); save(); closeSheet(); render(); },
  savedDel(el){ if (!confirm('Eliminare questo pasto abituale?')) return; S.saved = S.saved.filter(x => x.id !== el.dataset.id); save(); closeSheet(); render(); },
  foodEdit(el){ if (!document.getElementById('alist')) FCTX = {ds: today(), m: null}; if (el.dataset.id) foodEditSheet(findFood(el.dataset.id)); else foodEditSheet({n: el.dataset.name || '', src: 'user'}); },
  foodSave(el){
    const v = id => document.getElementById(id).value.trim();
    const n = v('fn'), k = num(v('fk'));
    if (!n || !(k >= 0)) { alert('Servono almeno il nome e le kcal per 100 g.'); return; }
    const id = el.dataset.id || 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const old = el.dataset.id ? findFood(el.dataset.id) : null;
    const f = {id, n: cap(n), b: v('fb'), bc: v('fbc').replace(/\D/g, ''), k, p: num(v('fp')) || 0, c: num(v('fc')) || 0, f: num(v('ff')) || 0, pg: num(v('fpg')) || null, u: parseUnits(v('fu')), al: v('fal').split(',').map(x => x.trim()).filter(Boolean), src: old && old.src === 'generic' ? 'generic' : (el.dataset.src === 'off' ? 'off' : (old ? old.src : 'user'))};
    if (f.src === 'generic' && old) f.src = 'edited';
    saveFood(f); save();
    const after = FCTX && FCTX.after; if (FCTX) FCTX.after = null;
    if (after) { after(f); return; }
    if (FCTX && FCTX.m && !el.dataset.id) { qtySheet(f.id); return; }
    closeSheet(); render(); toast('Salvato nella dispensa', fname(f));
  },
  foodDel(el){
    const id = el.dataset.id, f = findFood(id);
    if (!confirm(f && f.id.startsWith('g') ? 'Nascondere questo alimento dalla dispensa?' : 'Eliminare questo alimento dalla dispensa?')) return;
    S.pantry = (S.pantry || []).filter(x => x.id !== id); if (id.startsWith('g')) S.pantryHidden = (S.pantryHidden || []).concat(id);
    save(); closeSheet(); render();
  },
  scanOpen(){ if (!document.getElementById('alist')) FCTX = {ds: today(), m: null}; scanSheet(); },
  scanType(){ document.getElementById('scanManual').classList.remove('hidden'); document.getElementById('scanCode').focus(); },
  scanGo(){ const c = document.getElementById('scanCode').value.replace(/\D/g, ''); if (c.length < 8) { alert('Il codice ha di solito 8 o 13 cifre.'); return; } handleBarcode(c); },
  scanPhoto(){ const i = document.getElementById('photoFile'); i.value = ''; i.click(); },
  offOpen(){ if (!document.getElementById('alist')) FCTX = {ds: today(), m: null}; offSheet(); },
  async offGo(){
    const q = document.getElementById('offQ').value.trim(), box = document.getElementById('offRes'); if (!q) return;
    box.innerHTML = '<p class="note">Cerco…</p>';
    try { OFF_RES = await offSearch(q); box.innerHTML = OFF_RES.length ? OFF_RES.map((f, i) => `<button class="li btnrow" data-a="offPick" data-i="${i}"><span class="col"><b>${esc(f.n)}</b><span class="sub">${esc(f.b || '')}</span></span><span class="r">${fmt(f.k)} kcal/100 g</span></button>`).join('') : '<div class="empty">Nessun prodotto trovato. Prova con meno parole o con il codice a barre.</div>'; }
    catch (e) { box.innerHTML = '<div class="empty">Non riesco a collegarmi. Sei online?</div>'; }
  },
  offPick(el){ foodEditSheet(OFF_RES[+el.dataset.i]); }
});
document.addEventListener('input', ev => {
  const el = ev.target, c = el.dataset && el.dataset.c; if (!c) return;
  if (c === 'pq') { S.ui.pq = el.value; document.getElementById('plist').innerHTML = pantryListHtml(el.value); }
  if (c === 'aq') document.getElementById('alist').innerHTML = addListHtml(el.value);
  if (c === 'pfq') document.getElementById('pflist').innerHTML = pickListHtml(el.value);
  if (c === 'qg') { const g = num(el.value); document.getElementById('qk').textContent = g > 0 ? fmt(+el.dataset.k * g / 100) : '–'; }
  if (c === 'prowG') { const r = FCTX.rows[+el.dataset.i], g = num(el.value); if (g > 0) r.g = Math.round(g); const f = findFood(r.fid); document.getElementById('pk' + el.dataset.i).textContent = fmt(f.k * r.g / 100); const tot = FCTX.rows.filter(x => x.fid).reduce((a, x) => a + findFood(x.fid).k * x.g / 100, 0); document.getElementById('ptot').textContent = fmt(tot) + ' kcal'; }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.c === 'logSkip') { const ds = S.ui.logDay && S.ui.logDay <= today() ? S.ui.logDay : today(); S.logSkip = S.logSkip || {}; if (el.checked) S.logSkip[ds] = true; else delete S.logSkip[ds]; save(); }
  if (el.id === 'photoFile' && el.files[0]) {
    const st = document.getElementById('scanSt'); if (st) st.textContent = 'Leggo la foto…';
    decodeImageFile(el.files[0]).then(code => { if (code) handleBarcode(code); else if (st) st.textContent = 'Non riesco a leggere il codice nella foto. Riprova più vicino e dritto, oppure scrivi il numero.'; });
  }
});

/* ---------- vista energia (Progressi) ---------- */
function energyView(){
  const e = energyEstimate(), ref = kcalRef(), N = 21;
  const days = Array.from({length: N}, (_, i) => { const d = shiftDay(today(), i - N + 1); return {d, k: totals(dayLog(d)).k, skip: !!(S.logSkip || {})[d]}; });
  const W = 320, H = 130, mx = Math.max(e.est * 1.25, ...days.map(x => x.k)), bw = W / N;
  const Y = v => H - 14 - (H - 24) * v / mx;
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorie degli ultimi ${N} giorni rispetto alla normocalorica stimata">
    ${days.map((x, i) => x.k ? `<rect x="${(i * bw + 2).toFixed(1)}" y="${Y(x.k).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${(H - 14 - Y(x.k)).toFixed(1)}" rx="3" fill="${x.skip || x.k < 900 ? 'var(--track)' : 'var(--ochre)'}"/>` : '').join('')}
    <line x1="0" x2="${W}" y1="${Y(e.est).toFixed(1)}" y2="${Y(e.est).toFixed(1)}" stroke="var(--green)" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${W - 4}" y="${(Y(e.est) - 5).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--green)">${fmt(e.est)}</text>
    <text x="2" y="${H - 2}" font-size="10" fill="var(--muted)">${fdate(days[0].d)}</text><text x="${W - 2}" y="${H - 2}" font-size="10" text-anchor="end" fill="var(--muted)">oggi</text></svg>`;
  const cut = Math.round(Math.max(e.est * 0.9, kcalFloor()) / 10) * 10, perWeek = Math.max(0, e.est - cut) * 7 / 7700;
  return `<section class="card">
    <div class="between"><div class="col"><span class="sub">Normocalorica stimata</span><span class="big">${fmt(e.est)} <span class="unit">kcal/giorno</span></span></div><span class="chip ${e.conf === 'buona' ? 'soft' : 'warn'}">Affidabilità: ${e.conf}</span></div>
    ${chart}
    <span class="note">Barre: quello che hai mangiato (in grigio i giorni incompleti). Linea: la normocalorica stimata.</span>
  </section>
  <section class="card tight">
    <h3>Come la calcolo</h3>
    <div class="exd"><b>Dalla formula</b><span class="sub">~${fmt(e.formula.total)} kcal: metabolismo e vita quotidiana ${fmt(e.formula.base)} + sport ${fmt(e.formula.ex)} (media degli ultimi 14 giorni)</span></div>
    <div class="exd"><b>Dai tuoi dati</b><span class="sub">${e.adaptive != null ? `~${fmt(e.adaptive)} kcal: in media hai mangiato ${fmt(e.intake)} kcal in ${e.n} giorni e il tuo peso (tendenza) è ${e.delta > 0.05 ? 'salito' : e.delta < -0.05 ? 'sceso' : 'rimasto stabile'} di ${fmt1(Math.abs(e.delta))} kg in ${e.span} giorni.` : `Non ancora: servono almeno 7 giorni di diario completi e 4 pesate in 10 giorni. Ora: ${e.n} giorni registrati.`}</span></div>
    <div class="exd"><b>Stima finale</b><span class="sub">${e.adaptive != null ? `Mix dei due, con peso ${Math.round(e.wgt * 100)}% ai tuoi dati. Più giorni registri, più conta il dato reale.` : 'Per ora uso solo la formula.'}</span></div>
    <span class="note">Per una stima affidabile: registra tutto quello che mangi per 3 settimane e pesati 3–4 volte a settimana, al mattino a digiuno.</span>
    ${S.profile.sex === 'f' ? `<span class="note">Il ciclo mestruale può far variare il peso di 1–2 kg per la ritenzione idrica: è normale. Per questo la stima guarda la tendenza su più settimane e non la singola pesata; meglio confrontare stessi giorni del ciclo.</span>` : ''}
  </section>
  <section class="card tight">
    <h3>Obiettivo</h3>
    <span class="sub">Ora: ${esc((GOALS[ref.goal] || GOALS.maint).n)}${ref.goal !== 'maint' ? ' · ' + fmt(ref.target) + ' kcal' : ''}</span>
    ${ref.goal === 'maint' ? `<span class="note">${e.conf === 'buona' ? 'La stima è affidabile: puoi passare a una leggera ipocalorica.' : 'Consiglio: aspetta che l\'affidabilità diventi «buona» prima di scendere con le calorie.'}</span>
      <button class="btn dark" data-a="setGoal" data-v="cut10">Inizia ipocalorica leggera (−10%, ~${fmt(cut)} kcal)</button>
      <span class="note">Circa ${fmt1(perWeek)} kg in meno a settimana, mantenendo proteine alte e allenamenti.</span>`
    : `${ref.floored ? `<span class="note">L'obiettivo è stato alzato a ${fmt(ref.target)} kcal: scendere più in basso non è consigliato senza un professionista.</span>` : ''}<button class="btn ghost" data-a="setGoal" data-v="maint">Torna in normocalorica</button>`}
  </section>`;
}
Object.assign(A, { setGoal(el){ S.profile.goal = el.dataset.v; save(); render(); toast(el.dataset.v === 'maint' ? 'Obiettivo: normocalorica' : 'Ipocalorica leggera attivata', el.dataset.v === 'maint' ? '' : '~' + fmt(kcalRef().target) + ' kcal al giorno'); } });
