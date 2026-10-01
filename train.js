'use strict';
/* Forma — ciclo di allenamento, altre attività (corsa, pole dance), recupero e consiglio del giorno */

const KINDS = {
  full:  {n:'Full body', legs:2,   upper:2},
  upper: {n:'Upper',     legs:0,   upper:3},
  lower: {n:'Lower',     legs:3,   upper:0.5},
  other: {n:'Altro',     legs:1,   upper:1}
};
const ACT_TYPES = {run:'Corsa', pole:'Pole dance', other:'Altro sport'};
const RUN_KINDS = {facile:'Facile', ritmo:'Ritmo', lungo:'Lungo', ripetute:'Ripetute'};
const INTENS = {light:'Leggera', mid:'Media', hard:'Intensa'};
const H_LEGS = 24, H_UPPER = 20;   // ore di recupero per ogni punto di carico

function sessKind(s){
  if (s && s.kind && KINDS[s.kind]) return s.kind;
  const ex = (s && s.ex) || []; if (!ex.length) return 'other';
  let legs = 0; ex.forEach(e => { const l = findLib(e.name); if (l && (l.g === 'Gambe' || l.g === 'Glutei')) legs++; });
  const r = legs / ex.length; return r >= 0.6 ? 'lower' : r <= 0.15 ? 'upper' : 'full';
}
function actLoad(a){
  if (a.type === 'run') { const km = +a.km || 0; const L = (a.kind === 'lungo' || km >= 12) ? 2.5 : (a.kind === 'ripetute' || a.kind === 'ritmo' || km >= 7) ? 2 : 1.5; return {legs: L, upper: 0}; }
  if (a.type === 'pole') return {legs: 0.5, upper: {light:1.5, mid:2, hard:2.5}[a.int || 'mid']};
  return {legs: [0, 1.5, 2.5][a.legs ?? 1], upper: [0, 1.5, 2.5][a.upper ?? 1]};
}
function actKcal(a){
  const w = weightNow(), h = (+a.min || 0) / 60;
  if (a.type === 'run') return a.km ? w * a.km * 1.0 : 9 * w * h;
  if (a.type === 'pole') return ({light:3.5, mid:5, hard:6.5}[a.int || 'mid']) * w * h;
  return ({light:4, mid:6, hard:8}[a.int || 'mid']) * w * h;
}
function sessionKcal(h){ return 5 * weightNow() * ((h.dur || S.profile.duration || 60) / 60); }
function tsOf(x){ return x.ts || (parseD(x.date).getTime() + 18*3600e3); }

/* tutti gli eventi con il loro carico */
function loadEvents(){
  const ev = [];
  S.history.forEach(h => { const k = h.kind || sessKind({ex: h.ex.map(e => ({name: e.name}))}); const K = KINDS[k] || KINDS.other; ev.push({ts: tsOf(h), legs: K.legs, upper: K.upper, label: h.name, date: h.date}); });
  (S.acts || []).forEach(a => { const l = actLoad(a); ev.push({ts: tsOf(a), legs: l.legs, upper: l.upper, label: ACT_TYPES[a.type] || a.name, date: a.date}); });
  return ev;
}
function recovery(area){
  const now = Date.now(), H = area === 'legs' ? H_LEGS : H_UPPER; let left = 0, by = null;
  loadEvents().forEach(e => { const end = e.ts + e[area] * H * 3600e3; if (e[area] > 0 && end > now && e.ts <= now) { const h = (end - now) / 3600e3; if (h > left) { left = h; by = e.label; } } });
  return {h: left, by};
}

/* ---------- ciclo ---------- */
function ensureCycle(){ if (!S.cycle) S.cycle = {start: today(), length: 10}; if (!S.cycle.length) S.cycle.length = 10; }
function cycleInfo(){
  ensureCycle(); ensurePlan();
  const L = S.cycle.length, st = parseD(S.cycle.start), diff = Math.floor((parseD(today()) - st) / 864e5);
  const idx = Math.max(0, Math.floor(diff / L)), cs = new Date(st); cs.setDate(st.getDate() + idx * L);
  const ce = new Date(cs); ce.setDate(cs.getDate() + L - 1);
  const a = dstr(cs), b = dstr(ce), day = Math.max(1, diff - idx * L + 1);
  const inC = d => d >= a && d <= b;
  const sessions = S.plan.sessions.map((s, i) => {
    const h = S.history.filter(x => inC(x.date) && (x.si === i || (x.si == null && x.name === s.name)));
    return {i, s, kind: sessKind(s), done: h.length > 0, date: h.length ? h[h.length-1].date : null};
  });
  const acts = {run:0, pole:0, other:0}; (S.acts || []).forEach(x => { if (inC(x.date)) acts[x.type] = (acts[x.type] || 0) + 1; });
  return {n: idx + 1, day, L, start: a, end: b, sessions, acts, daysLeft: L - day + 1};
}

/* ---------- consiglio del giorno ---------- */
function recommend(){
  const c = cycleInfo(), legs = recovery('legs'), up = recovery('upper');
  const doneToday = S.history.some(h => h.date === today());
  const rem = c.sessions.filter(x => !x.done), opts = [];
  rem.forEach(x => {
    const K = KINDS[x.kind]; let score = 50; const why = []; let blocked = false;
    if (K.legs >= 2 && legs.h > 10) { blocked = true; why.push(`gambe in recupero ancora ~${Math.ceil(legs.h)} h (${legs.by})`); }
    else if (K.legs >= 2 && legs.h > 0) { score -= 12; why.push('gambe quasi recuperate'); }
    else if (K.legs >= 2) { score += K.legs * 5; why.push('gambe riposate: buon momento per allenarle'); }
    if (K.legs === 0 && legs.h > 0) { score += 18; why.push('lascia riposare le gambe'); }
    if (K.upper >= 2 && up.h > 10) { score -= 22; why.push(`parte alta ancora affaticata (~${Math.ceil(up.h)} h)`); }
    score += rem.length / Math.max(1, c.daysLeft) * 20;
    opts.push({x, score: blocked ? score - 100 : score, blocked, why});
  });
  opts.sort((a, b) => b.score - a.score);
  const slack = c.daysLeft - rem.length;
  return {c, legs, up, opts, doneToday, slack, rem};
}

/* ---------- ciclo tipo consigliato (disposizione ottimale delle sessioni) ---------- */
function cycleTemplate(){
  ensureCycle();
  const ss = S.plan.sessions.map((s, i) => ({i, name: s.name, k: sessKind(s)})), L = S.cycle.length, n = ss.length;
  if (!n || n > L) return null;
  const cg = (a, b) => { const d = Math.abs(a - b); return Math.min(d, L - d); };
  const score = pos => {
    let p = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const g = cg(pos[i], pos[j]), A = KINDS[ss[i].k], B = KINDS[ss[j].k];
      p += A.legs * B.legs * (g === 1 ? 10 : g === 2 ? 4 : g === 3 ? 1 : 0);
      p += A.upper * B.upper * (g === 1 ? 2 : g === 2 ? 0.5 : 0);
    }
    const sorted = pos.slice().sort((a, b) => a - b), gaps = sorted.map((v, i) => (i < n - 1 ? sorted[i+1] : sorted[0] + L) - v), m = L / n;
    gaps.forEach(g => p += (g - m) * (g - m) * 0.6);
    return p;
  };
  let best = null, bestS = 1e9;
  const used = new Array(L).fill(false), pos = new Array(n);
  const rec = k => {
    if (k === n) { const s = score(pos); if (s < bestS) { bestS = s; best = pos.slice(); } return; }
    for (let d = (k === 0 ? 0 : 1); d < (k === 0 ? 1 : L); d++) { if (used[d]) continue; used[d] = true; pos[k] = d; rec(k + 1); used[d] = false; }
  };
  if (n <= 6) rec(0); else { best = ss.map((_, i) => Math.round(i * L / n)); }
  const days = Array.from({length: L}, (_, d) => ({d, sess: null}));
  ss.forEach((s, i) => days[best[i]].sess = s);
  days.forEach(day => {
    if (day.sess) return;
    const prev = days[(day.d - 1 + L) % L].sess, next = days[(day.d + 1) % L].sess;
    const pl = prev ? KINDS[prev.k].legs : 0, nl = next ? KINDS[next.k].legs : 0, pu = prev ? KINDS[prev.k].upper : 0;
    if (pl >= 3) day.tip = pu >= 2 ? 'Riposo' : 'Pole o riposo (gambe a riposo)';
    else if (nl >= 2) day.tip = pu >= 3 ? 'Riposo (domani gambe)' : 'Pole o riposo (domani gambe)';
    else if (pl >= 2) day.tip = 'Corsa facile o pole';
    else day.tip = 'Buono per la corsa';
  });
  return days;
}

/* ---------- viste ---------- */
function statusChip(label, r){
  const ok = r.h <= 0;
  return `<span class="chip ${ok ? 'soft' : 'warn'}">${label}: ${ok ? 'pronte' : 'recupero ~' + Math.ceil(r.h) + ' h'}</span>`;
}
function recommendCard(compact){
  if (S.active) return `<section class="card green"><span class="sub">Allenamento in corso</span><h3 class="disp">${esc(S.active.name)}</h3><button class="btn white" data-a="tab" data-t="work">${I.play}Continua</button></section>`;
  const r = recommend();
  const status = `<div class="row wrap gap6">${statusChip('Gambe', r.legs).replace('pronte', 'riposate')}${statusChip('Parte alta', r.up).replace('pronte', 'riposata')}</div>`;
  let main;
  if (r.doneToday) main = `<span class="sub">Oggi</span><h3 class="disp">Allenamento fatto.</h3><span class="sub">Domani: ${r.opts.length ? esc(r.opts[0].x.s.name) + (r.opts[0].blocked ? ' (se le gambe sono pronte)' : '') : 'ciclo completato'}</span>`;
  else if (!r.rem.length) main = `<span class="sub">Ciclo ${r.c.n} · giorno ${r.c.day} di ${r.c.L}</span><h3 class="disp">Sessioni del ciclo completate</h3><span class="sub">${r.legs.h > 0 ? 'Le gambe stanno recuperando: meglio pole o riposo.' : 'Se ti va: corsa o pole. Il nuovo ciclo parte il ' + fdate(dstr(new Date(parseD(r.c.end).getTime() + 864e5))) + '.'}</span>`;
  else {
    const top = r.opts[0];
    if (top.blocked) main = `<span class="sub">Consiglio di oggi</span><h3 class="disp">Riposo o pole</h3><span class="sub">${esc(top.why[0])}. Prossima sessione utile: ${esc(top.x.s.name)}.</span>`;
    else main = `<span class="sub">Consiglio di oggi${norm(top.x.s.name) !== norm(KINDS[top.x.kind].n) ? ' · ' + KINDS[top.x.kind].n : ''}</span><h3 class="disp">${esc(top.x.s.name)}</h3><span class="sub">${esc(cap(top.why.join(' · ')) || 'In linea con il ciclo')}</span>
      <button class="btn white" data-a="startWork" data-i="${top.x.i}">${I.play}Inizia</button>`;
    const alt = r.opts.slice(top.blocked ? 0 : 1).filter(o => !o.blocked).slice(0, 2);
    if (alt.length && !compact) main += `<span class="sub">In alternativa: ${alt.map(o => esc(o.x.s.name)).join(', ')}</span>`;
    if (r.slack <= 0 && r.rem.length) main += `<span class="sub"><b>Attenzione:</b> restano ${r.rem.length} sessioni e ${r.c.daysLeft} giorni nel ciclo.</span>`;
  }
  return `<section class="card green">${main}${status}</section>`;
}
function cycleCard(){
  const c = cycleInfo();
  return `<section class="card tight">
    <div class="between"><b class="n20">Ciclo ${c.n} · giorno ${Math.min(c.day, c.L)} di ${c.L}</b><span class="sub">${fdate(c.start)} – ${fdate(c.end)}</span></div>
    <div class="cyclebar" aria-hidden="true">${Array.from({length: c.L}, (_, d) => `<i class="${d < c.day - 1 ? 'past' : d === c.day - 1 ? 'now' : ''}"></i>`).join('')}</div>
    <div class="row wrap gap6">${c.sessions.map(x => `<span class="chip ${x.done ? 'done' : ''}">${x.done ? I.check : ''}${esc(x.s.name)}</span>`).join('')}</div>
    <div class="row wrap gap6"><span class="chip">Corsa: ${c.acts.run || 0}</span><span class="chip">Pole: ${c.acts.pole || 0}</span>${c.acts.other ? `<span class="chip">Altro: ${c.acts.other}</span>` : ''}</div>
    <button class="linkbtn" data-a="cycleRestart" style="align-self:flex-start">Fai ripartire il ciclo da oggi</button>
  </section>`;
}
function templateHtml(){
  const t = cycleTemplate(); if (!t) return '';
  return `<details class="sess"><summary><span>Ciclo tipo consigliato</span><span class="sub">ordine che riposa le gambe</span></summary>
    <ol class="tpl">${t.map(d => `<li><span class="dnum">G${d.d + 1}</span>${d.sess ? `<b>${esc(d.sess.name)}</b>${norm(d.sess.name).includes(norm(KINDS[d.sess.k].n)) ? '' : ` <span class="tag">${KINDS[d.sess.k].n}</span>`}` : `<span class="sub">${esc(d.tip)}</span>`}</li>`).join('')}</ol>
    <p class="note">È un ordine indicativo: tra due giornate pesanti per le gambe (Lower, Full body, corsa) lascia almeno 48 ore. Il consiglio del giorno tiene conto di quello che hai fatto davvero.</p></details>`;
}

/* ---------- registro attività ---------- */
function actSheet(type, id){
  const a = id ? S.acts.find(x => x.id === id) : {type, date: today(), min: type === 'run' ? 30 : 60, km: '', kind: 'facile', int: 'mid', rpe: '', note: '', name: '', legs: 1, upper: 1};
  type = a.type;
  const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
  openSheet(id ? 'Modifica attività' : 'Registra ' + ACT_TYPES[type].toLowerCase(), `
    ${type === 'other' ? `<div class="field"><label for="aName">Attività</label><input id="aName" value="${esc(a.name)}" placeholder="es. Nuoto, Calcetto, Arrampicata"></div>` : ''}
    <div class="grid2"><div class="field"><label for="aDate">Giorno</label><input id="aDate" type="date" value="${a.date}" max="${today()}"></div>
    <div class="field"><label for="aMin">Durata (min)</label><input id="aMin" inputmode="numeric" value="${esc(a.min)}"></div></div>
    ${type === 'run' ? `<div class="grid2"><div class="field"><label for="aKm">Distanza (km)</label><input id="aKm" inputmode="decimal" value="${esc(String(a.km).replace('.', ','))}"></div>
      <div class="field"><label for="aKind">Tipo</label><select id="aKind">${opt(RUN_KINDS, a.kind)}</select></div></div>` :
      `<div class="field"><label for="aInt">Intensità</label><select id="aInt">${opt(INTENS, a.int)}</select></div>`}
    ${type === 'other' ? `<div class="grid2"><div class="field"><label for="aLegs">Carico sulle gambe</label><select id="aLegs">${opt({0:'Nessuno',1:'Medio',2:'Alto'}, String(a.legs))}</select></div><div class="field"><label for="aUp">Carico parte alta</label><select id="aUp">${opt({0:'Nessuno',1:'Medio',2:'Alto'}, String(a.upper))}</select></div></div>` : ''}
    <div class="field"><label for="aRpe">Fatica percepita (1–10)</label><input id="aRpe" inputmode="numeric" value="${esc(a.rpe)}" placeholder="facoltativa"></div>
    <div class="field"><label for="aNote">Note</label><input id="aNote" value="${esc(a.note)}" placeholder="facoltative"></div>
    <button class="btn dark full" data-a="actSave" data-t="${type}" data-id="${id || ''}">Salva</button>
    ${id ? `<button class="btn danger full" data-a="actDel" data-id="${id}">${I.trash}Elimina</button>` : ''}`);
}
const actDesc = a => a.type === 'run' ? `${a.km ? fmt1(a.km) + ' km · ' : ''}${a.min} min${a.km && a.min ? ' · ' + paceTxt(a.min, a.km) + '/km' : ''} · ${RUN_KINDS[a.kind] || ''}` : `${a.min} min · ${INTENS[a.int] || ''}`;
function paceTxt(min, km){ const s = Math.round(min * 60 / km); return Math.floor(s / 60) + ':' + pad(s % 60); }

Object.assign(A, {
  actOpen(el){ actSheet(el.dataset.t); },
  actEdit(el){ actSheet(null, el.dataset.id); },
  actSave(el){
    const v = id => { const x = document.getElementById(id); return x ? x.value : ''; }, type = el.dataset.t, id = el.dataset.id;
    const a = {id: id || 'a' + Date.now().toString(36), type, date: v('aDate') || today(), min: Math.max(0, parseInt(v('aMin')) || 0), note: v('aNote').trim(), rpe: parseInt(v('aRpe')) || ''};
    if (type === 'run') { a.km = num(v('aKm')) || 0; a.kind = v('aKind'); }
    else a.int = v('aInt');
    if (type === 'other') { a.name = v('aName').trim() || 'Altro sport'; a.legs = +v('aLegs'); a.upper = +v('aUp'); }
    if (!a.min && !a.km) { alert('Inserisci almeno la durata.'); return; }
    a.ts = a.date === today() ? Date.now() : parseD(a.date).getTime() + 18*3600e3;
    S.acts = (S.acts || []).filter(x => x.id !== a.id); S.acts.push(a); S.acts.sort((x, y) => x.date < y.date ? -1 : 1);
    closeSheet(); save(); render(); toast((ACT_TYPES[type] || 'Attività') + ' registrata', actDesc(a));
  },
  actDel(el){ if (!confirm('Eliminare questa attività?')) return; S.acts = S.acts.filter(x => x.id !== el.dataset.id); closeSheet(); save(); render(); },
  cycleRestart(){ if (!confirm('Far partire un nuovo ciclo da oggi?')) return; ensureCycle(); S.cycle.start = today(); save(); render(); }
});
