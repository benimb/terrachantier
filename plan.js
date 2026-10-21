/* TerraChantier : plans de niveaux (PDF), visionneuse avec zoom, images et métadonnées des photos */

/* ---- PDF : une page par niveau, rendue en image nette (jusqu'à 4000 px de côté) ---- */
async function pdfToImages(file, onProgress) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress && onProgress(p, pdf.numPages);
    const page = await pdf.getPage(p), v0 = page.getViewport({ scale: 1 }), k = Math.min(4000 / Math.max(v0.width, v0.height), 6), vp = page.getViewport({ scale: k });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .86));
    const tc = document.createElement('canvas'), tk = 360 / Math.max(cv.width, cv.height); tc.width = Math.round(cv.width * tk); tc.height = Math.round(cv.height * tk); tc.getContext('2d').drawImage(cv, 0, 0, tc.width, tc.height);
    const thumb = await new Promise(r => tc.toBlob(r, 'image/jpeg', .8));
    out.push({ page: p, w: cv.width, h: cv.height, blob, thumb }); cv.width = cv.height = 0; page.cleanup();
  }
  return out;
}

/* ---- photos : redressées, réduites à 2048 px, vignette 360 px ---- */
async function shrinkImage(file, max = 2048, q = .82) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(file); }); }
  const W = bmp.width, H = bmp.height, go = m => { const k = Math.min(1, m / Math.max(W, H)), c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c; };
  const big = go(max), sm = go(360);
  const blob = await new Promise(r => big.toBlob(r, 'image/jpeg', q)), thumb = await new Promise(r => sm.toBlob(r, 'image/jpeg', .75));
  return { blob, thumb, w: big.width, h: big.height };
}
/* EXIF : date de prise de vue, position GPS et direction (quand l'appareil les enregistre) */
async function readExif(file) {
  const out = {}; try {
    const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer()); if (b.getUint16(0) !== 0xFFD8) return out;
    let o = 2; while (o < b.byteLength - 4) { const m = b.getUint16(o), len = b.getUint16(o + 2); if (m === 0xFFE1 && b.getUint32(o + 4) === 0x45786966) { parse(o + 10); break; } o += 2 + len; }
    function parse(t) {
      const le = b.getUint16(t) === 0x4949, u16 = p => b.getUint16(p, le), u32 = p => b.getUint32(p, le);
      const rat = p => u32(p) / (u32(p + 4) || 1), str = (p, n) => { let s = ''; for (let i = 0; i < n - 1; i++) { const c = b.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } return s; };
      const ifd = (p, cb) => { const n = u16(t + p); for (let i = 0; i < n; i++) { const e = t + p + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), vo = cnt * ([0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] || 1) > 4 ? t + u32(e + 8) : e + 8; cb(tag, type, cnt, vo, e); } };
      let exif = 0, gps = 0;
      ifd(u32(t + 4), (tag, type, cnt, vo, e) => { if (tag === 0x8769) exif = u32(e + 8); if (tag === 0x8825) gps = u32(e + 8); if (tag === 0x0132 && !out.date) out.date = str(vo, cnt); });
      if (exif) ifd(exif, (tag, type, cnt, vo) => { if (tag === 0x9003) out.date = str(vo, cnt); });
      if (gps) { const g = {}; ifd(gps, (tag, type, cnt, vo) => { if (tag === 1 || tag === 3 || tag === 0x10) g[tag] = str(vo, cnt); if (tag === 2 || tag === 4) g[tag] = [rat(vo), rat(vo + 8), rat(vo + 16)]; if (tag === 0x11) g[tag] = rat(vo); if (tag === 6) g[tag] = rat(vo); });
        const dms = a => a ? a[0] + a[1] / 60 + a[2] / 3600 : NaN; const lat = dms(g[2]) * (g[1] === 'S' ? -1 : 1), lon = dms(g[4]) * (g[3] === 'W' ? -1 : 1);
        if (isFinite(lat) && isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; } if (isFinite(g[0x11])) out.dir = g[0x11]; if (isFinite(g[6])) out.alt = g[6]; }
    }
    if (out.date) { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(out.date); out.date = m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString() : undefined; }
  } catch (e) { console.warn('EXIF', e); }
  return out;
}

/* ---- visionneuse : déplacement au doigt ou à la souris, zoom (pincement, molette), repères, toucher ---- */
class PlanView {
  constructor(el, { onTap, onMarker } = {}) {
    this.el = el; this.onTap = onTap; this.onMarker = onMarker; this.s = 1; this.tx = 0; this.ty = 0; this.markers = []; this.ptr = new Map();
    el.classList.add('pv'); el.innerHTML = '<div class="pv-in"><img class="pv-img" alt="" draggable="false"></div><div class="pv-mk"></div><div class="pv-zoom"><button type="button" data-z="1" aria-label="Zoomer">+</button><button type="button" data-z="-1" aria-label="Dézoomer">−</button><button type="button" data-z="0" aria-label="Plan entier">⤢</button></div>';
    this.inn = el.querySelector('.pv-in'); this.img = el.querySelector('.pv-img'); this.mk = el.querySelector('.pv-mk');
    el.querySelector('.pv-zoom').addEventListener('click', e => { const z = e.target.dataset.z; if (z === undefined) return; e.stopPropagation(); if (z === '0') this.fit(); else this.zoomAt(this.el.clientWidth / 2, this.el.clientHeight / 2, z === '1' ? 1.6 : 1 / 1.6); });
    el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * .0015)); }, { passive: false });
    el.addEventListener('pointerdown', e => { if (e.target.closest('.pv-zoom,.pv-m')) return; el.setPointerCapture(e.pointerId); this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.ptr.size === 1) this.down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false }; else this.down = null; this.pinch = null; });
    el.addEventListener('pointermove', e => {
      if (!this.ptr.has(e.pointerId)) return; const p0 = this.ptr.get(e.pointerId), p = { x: e.clientX, y: e.clientY }; this.ptr.set(e.pointerId, p);
      if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = el.getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        if (this.pinch) { this.zoomAt(cx, cy, d / this.pinch.d, false); this.tx += cx - this.pinch.cx; this.ty += cy - this.pinch.cy; this.apply(); } this.pinch = { d, cx, cy }; return; }
      this.tx += p.x - p0.x; this.ty += p.y - p0.y; if (this.down && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 7) this.down.moved = true; this.apply();
    });
    const up = e => { if (!this.ptr.has(e.pointerId)) return; this.ptr.delete(e.pointerId); if (this.ptr.size < 2) this.pinch = null;
      if (this.down && !this.down.moved && Date.now() - this.down.t < 600 && this.onTap && this.w) { const r = el.getBoundingClientRect(), x = (e.clientX - r.left - this.tx) / (this.s * this.w), y = (e.clientY - r.top - this.ty) / (this.s * this.h); if (x >= 0 && y >= 0 && x <= 1 && y <= 1) this.onTap(x, y); }
      this.down = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    this.ro = new ResizeObserver(() => { if (this.w && !this.touched) this.fit(); else this.apply(); }); this.ro.observe(el);
  }
  async load(plan) { this.plan = plan; this.w = plan.w; this.h = plan.h; this.img.src = await BlobURL(plan.blobId); this.img.style.width = plan.w + 'px'; this.img.style.height = plan.h + 'px'; this.touched = false; this.fit(); }
  fit() { const W = this.el.clientWidth, H = this.el.clientHeight; if (!W || !this.w) return; this.s = Math.min(W / this.w, H / this.h) * .96; this.tx = (W - this.w * this.s) / 2; this.ty = (H - this.h * this.s) / 2; this.apply(); }
  zoomAt(cx, cy, f, ap = true) { const s2 = Math.max(.02, Math.min(4, this.s * f)); f = s2 / this.s; this.tx = cx - (cx - this.tx) * f; this.ty = cy - (cy - this.ty) * f; this.s = s2; this.touched = true; if (ap) this.apply(); }
  center(x, y, s) { const W = this.el.clientWidth, H = this.el.clientHeight; if (s) this.s = s; this.tx = W / 2 - x * this.w * this.s; this.ty = H / 2 - y * this.h * this.s; this.touched = true; this.apply(); }
  setMarkers(list) { this.markers = list; this.mk.innerHTML = list.map((m, i) => `<button type="button" class="pv-m ${m.kind || ''}${m.sel ? ' sel' : ''}" data-i="${i}" title="${esc(m.title || '')}">${m.dir != null ? `<i class="pv-dir" style="transform:rotate(${m.dir}deg)"></i>` : ''}<span>${esc(m.label ?? '')}</span></button>`).join('');
    this.mk.querySelectorAll('.pv-m').forEach(b => b.onclick = e => { e.stopPropagation(); const m = this.markers[+b.dataset.i]; this.onMarker && this.onMarker(m); }); this.apply(); }
  apply() { this.inn.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.s})`; this.mk.querySelectorAll('.pv-m').forEach(b => { const m = this.markers[+b.dataset.i]; b.style.transform = `translate(${this.tx + m.x * this.w * this.s}px,${this.ty + m.y * this.h * this.s}px)`; }); }
}
/* extrait de plan autour d'un repère (pour les comptes-rendus et les fiches de réserve) */
async function planExtract(plan, pts, W = 900, H = 560, zoomPx = 1400) {
  const im = new Image(); im.src = await BlobURL(plan.blobId); await im.decode();
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * plan.w, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * plan.h;
  const span = Math.max(zoomPx, ...pts.map(p => Math.abs(p.x * plan.w - cx) * 2.4), ...pts.map(p => Math.abs(p.y * plan.h - cy) * 2.4 * W / H)), k = W / span;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.drawImage(im, cx - W / 2 / k, cy - H / 2 / k, W / k, H / k, 0, 0, W, H);
  for (const p of pts) { const x = (p.x * plan.w - cx) * k + W / 2, y = (p.y * plan.h - cy) * k + H / 2;
    if (p.dir != null) { const a = (p.dir - 90) * Math.PI / 180; c.strokeStyle = p.color || '#c2410c'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 46, y + Math.sin(a) * 46); c.stroke(); }
    c.fillStyle = p.color || '#c2410c'; c.beginPath(); c.arc(x, y, 15, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 15px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(p.label ?? ''), x, y + 1); }
  c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(.5, .5, W - 1, H - 1);
  return cv.toDataURL('image/jpeg', .85);
}
/* petit plan de localisation : le niveau entier, réduit, avec le repère et la direction de prise de vue */
async function planMini(plan, pt, W = 360, H = 360, color = '#c2410c') {
  const im = new Image(); im.src = await BlobURL(plan.blobId); await im.decode();
  const k = Math.min(W / plan.w, H / plan.h), dw = plan.w * k, dh = plan.h * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(im, ox, oy, dw, dh);
  const x = ox + pt.x * dw, y = oy + pt.y * dh;
  if (pt.dir != null) { const a = (pt.dir - 90) * Math.PI / 180; c.fillStyle = color + '55'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, W * .16, a - .45, a + .45); c.closePath(); c.fill(); }
  c.fillStyle = color; c.beginPath(); c.arc(x, y, Math.max(6, W * .028), 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
  c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(.5, .5, W - 1, H - 1);
  return cv.toDataURL('image/jpeg', .85);
}
