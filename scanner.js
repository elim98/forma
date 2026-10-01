'use strict';
/* Forma — lettore di codici a barre EAN-13 / EAN-8 / UPC-A, senza librerie esterne.
   Legge righe orizzontali dell'immagine, misura la larghezza delle barre e le confronta con le cifre EAN. */
const EAN = (() => {
  const L = ['3211','2221','2122','1411','1132','1231','1114','1312','1213','3112'].map(s => s.split('').map(Number));
  const G = L.map(w => w.slice().reverse());
  const FIRST = {LLLLLL:0, LLGLGG:1, LLGGLG:2, LLGGGL:3, LGLLGG:4, LGGLLG:5, LGGGLL:6, LGLGLG:7, LGLGGL:8, LGGLGL:9};

  function matchDigit(runs, set){
    const sum = runs[0] + runs[1] + runs[2] + runs[3]; if (!sum) return null;
    let best = -1, bestErr = 1e9, second = 1e9;
    for (let d = 0; d < 10; d++) {
      const p = set[d]; let err = 0;
      for (let k = 0; k < 4; k++) err += Math.abs(runs[k] * 7 / sum - p[k]);
      if (err < bestErr) { second = bestErr; bestErr = err; best = d; } else if (err < second) second = err;
    }
    return {d: best, err: bestErr, margin: second - bestErr};
  }
  function checksum(digits){
    const n = digits.length; let s = 0;
    for (let i = 0; i < n - 1; i++) s += digits[n - 2 - i] * (i % 2 === 0 ? 3 : 1);
    return (10 - (s % 10)) % 10 === digits[n - 1];
  }
  const guardOk = (r, m) => r.every(x => x > m * 0.45 && x < m * 1.8);

  // runs: larghezze alternate a partire da una barra scura in posizione i
  function tryEAN13(runs, i){
    if (i + 59 > runs.length) return null;
    const seg = runs.slice(i, i + 59), total = seg.reduce((a, b) => a + b, 0), m = total / 95;
    if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(27, 32), m) || !guardOk(seg.slice(56, 59), m)) return null;
    const quiet = i > 0 ? runs[i - 1] : 99; if (quiet < m * 3) return null;
    const digits = [], par = []; let errSum = 0;
    for (let k = 0; k < 6; k++) {
      const r = seg.slice(3 + k*4, 7 + k*4), a = matchDigit(r, L), b = matchDigit(r, G);
      const x = a.err <= b.err ? a : b; if (x.err > 2) return null;
      digits.push(x.d); par.push(a.err <= b.err ? 'L' : 'G'); errSum += x.err;
    }
    for (let k = 0; k < 6; k++) {
      const r = seg.slice(32 + k*4, 36 + k*4), a = matchDigit(r, L); if (a.err > 2) return null;
      digits.push(a.d); errSum += a.err;
    }
    const f = FIRST[par.join('')]; if (f === undefined) return null;
    const all = [f].concat(digits);
    return checksum(all) ? {code: all.join(''), err: errSum} : null;
  }
  function tryEAN8(runs, i){
    if (i + 43 > runs.length) return null;
    const seg = runs.slice(i, i + 43), total = seg.reduce((a, b) => a + b, 0), m = total / 67;
    if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(19, 24), m) || !guardOk(seg.slice(40, 43), m)) return null;
    const quiet = i > 0 ? runs[i - 1] : 99; if (quiet < m * 3) return null;
    const digits = []; let errSum = 0;
    for (let k = 0; k < 4; k++) { const a = matchDigit(seg.slice(3 + k*4, 7 + k*4), L); if (a.err > 2) return null; digits.push(a.d); errSum += a.err; }
    for (let k = 0; k < 4; k++) { const a = matchDigit(seg.slice(24 + k*4, 28 + k*4), L); if (a.err > 2) return null; digits.push(a.d); errSum += a.err; }
    return checksum(digits) ? {code: digits.join(''), err: errSum} : null;
  }
  function decodeRuns(runs, firstDark){
    // runs[0] è scuro se firstDark, altrimenti chiaro
    const out = [];
    for (let i = firstDark ? 0 : 1; i < runs.length; i += 2) {
      const a = tryEAN13(runs, i); if (a) out.push(a);
      const b = tryEAN8(runs, i); if (b) out.push(b);
    }
    return out;
  }
  function runsFrom(lum, win, mix){
    const n = lum.length, pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + lum[i];
    let lo = 255, hi = 0; for (let i = 0; i < n; i++) { if (lum[i] < lo) lo = lum[i]; if (lum[i] > hi) hi = lum[i]; }
    if (hi - lo < 35) return null;
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - win), b = Math.min(n, i + win + 1), mean = (pre[b] - pre[a]) / (b - a); d[i] = lum[i] - (mean * (1 - mix) + (lo + hi) / 2 * mix); }
    // attraversamenti della soglia con precisione sub-pixel
    const runs = []; let last = 0; const firstDark = d[0] < 0;
    for (let i = 0; i < n - 1; i++) {
      if ((d[i] < 0) !== (d[i + 1] < 0)) { const x = i + d[i] / (d[i] - d[i + 1]); runs.push(x - last); last = x; }
    }
    runs.push(n - last);
    return {runs, firstDark};
  }
  function decodeLine(lum){
    const n = lum.length; if (n < 100) return null;
    for (const [win, mix] of [[Math.round(n / 14), 0.25], [Math.round(n / 30), 0.1], [Math.round(n / 6), 0.5]]) {
      const r = runsFrom(lum, Math.max(8, win), mix); if (!r) return null;
      const {runs, firstDark} = r;
      let res = decodeRuns(runs, firstDark);
      if (!res.length) { const rr = runs.slice().reverse(); const lastDark = (runs.length % 2 === 1) ? firstDark : !firstDark; res = decodeRuns(rr, lastDark); }
      if (res.length) { res.sort((a, b) => a.err - b.err); return res[0].code; }
    }
    return null;
  }
  // immagine → codice (prova molte righe; serve che almeno 2 righe concordino)
  function decodeImageData(img, opts){
    const {data, width, height} = img, rows = (opts && opts.rows) || 24, votes = {};
    const lum = new Float32Array(width);
    for (let r = 0; r < rows; r++) {
      const y = Math.round(height * (0.15 + 0.7 * r / Math.max(1, rows - 1)));
      for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; lum[x] = data[o] * 0.299 + data[o+1] * 0.587 + data[o+2] * 0.114; }
      // leggera sfocatura per ridurre il rumore
      const sm = new Float32Array(width); for (let x = 0; x < width; x++) sm[x] = (lum[Math.max(0, x-1)] + lum[x]*2 + lum[Math.min(width-1, x+1)]) / 4;
      const c = decodeLine(sm);
      if (c) { votes[c] = (votes[c] || 0) + 1; if (votes[c] >= 2) return c; }
    }
    const keys = Object.keys(votes);
    return keys.length === 1 && (opts && opts.single) ? keys[0] : null;
  }
  return {decodeImageData, decodeLine};
})();

/* Fotocamera dal vivo */
const Scanner = {
  stream: null, raf: 0, busy: false, last: null, lastCount: 0,
  async start(video, onCode, onError){
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false});
    } catch (e) { onError && onError(e); return; }
    video.srcObject = this.stream; video.setAttribute('playsinline', ''); video.muted = true;
    try { await video.play(); } catch (e) {}
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', {willReadFrequently: true});
    let t0 = 0;
    const loop = (t) => {
      if (!this.stream) return;
      this.raf = requestAnimationFrame(loop);
      if (t - t0 < 120 || !video.videoWidth) return; t0 = t;
      // ritaglio della fascia centrale (dove c'è il riquadro guida)
      const vw = video.videoWidth, vh = video.videoHeight, cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.36);
      const sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2), W = Math.min(1100, cw), H = Math.round(ch * W / cw);
      cv.width = W; cv.height = H; ctx.drawImage(video, sx, sy, cw, ch, 0, 0, W, H);
      const code = EAN.decodeImageData(ctx.getImageData(0, 0, W, H), {rows: 18, single: true});
      if (code) {
        if (code === this.last) this.lastCount++; else { this.last = code; this.lastCount = 1; }
        if (this.lastCount >= 2) { const c = code; this.stop(); onCode(c); }
      }
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop(){
    cancelAnimationFrame(this.raf); this.raf = 0; this.last = null; this.lastCount = 0;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }
};
/* Da una foto scattata o scelta dalla libreria */
async function decodeImageFile(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', {willReadFrequently: true});
    for (const W of [1400, 1000, 700, 2000]) {
      for (const rot of [0, 90]) {
        const s = W / (rot ? img.height : img.width); const w = Math.round((rot ? img.height : img.width) * s), h = Math.round((rot ? img.width : img.height) * s);
        cv.width = w; cv.height = h; ctx.save();
        if (rot) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(img, 0, 0, rot ? h : w, rot ? w : h); ctx.restore();
        const code = EAN.decodeImageData(ctx.getImageData(0, 0, w, h), {rows: 60, single: true});
        if (code) return code;
      }
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
