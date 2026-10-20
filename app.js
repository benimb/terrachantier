/* TerraChantier : comptes-rendus de chantier, OPR et photos localisées sur plan */
const APP_VERSION = '0.1.1';
const $ = (q, el = document) => el.querySelector(q), $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dayOf = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtD = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDL = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtT = d => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>', cam: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>', img: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
};
const DEFAULT_LOTS = [['00', 'Généralités'], ['01', 'Démolition, désamiantage'], ['02', 'Gros œuvre, maçonnerie'], ['03', 'Charpente, couverture'], ['04', 'Étanchéité'], ['05', 'Menuiseries extérieures'], ['06', 'Serrurerie, métallerie'], ['07', 'Plâtrerie, cloisons, faux plafonds'], ['08', 'Menuiseries intérieures'], ['09', 'Revêtements de sols et murs'], ['10', 'Peinture'], ['11', 'Électricité courants forts et faibles'], ['12', 'Plomberie, sanitaires'], ['13', 'Chauffage, ventilation, climatisation'], ['14', 'Ascenseurs'], ['15', 'VRD, espaces verts']];
const OBS_ST = { afaire: 'À faire', fait: 'Fait', info: 'Pour information' };
const RES_ST = { ouverte: 'Ouverte', levee: 'Levée', refusee: 'Contestée' };
const PHASES = { chantier: 'En cours de chantier', OPR: 'OPR', reception: 'Réception', GPA: 'Parfait achèvement' };

const S = { ch: null, plans: [], photos: [], visites: [], reserves: [], auteur: '', lastPlan: null };
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!location.hash || location.hash === '#/') render(); });

function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function sheet(title, body, foot = '', { wide } = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"${wide ? ' style="max-width:1100px"' : ''} role="dialog" aria-modal="true"><header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${ICON.x}</button></header><div class="body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div>`;
  document.body.appendChild(bg); document.body.style.overflow = 'hidden';
  const close = () => { bg.remove(); if (!$('.sheet-bg')) document.body.style.overflow = ''; bg.dispatchEvent(new Event('closed')); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  return { el: bg.querySelector('.sheet'), bg, close };
}
const lotsOf = () => (S.ch && S.ch.lots) || [];
const lotById = id => lotsOf().find(l => l.id === id);
const entById = id => ((S.ch && S.ch.entreprises) || []).find(e => e.id === id);
const lotLabel = id => { const l = lotById(id); return l ? `${l.code} ${l.nom}` : 'Sans lot'; };
const lotOptions = (sel, blank = 'Sans lot') => `<option value="">${blank}</option>` + lotsOf().slice().sort((a, b) => a.code.localeCompare(b.code)).map(l => `<option value="${l.id}"${l.id === sel ? ' selected' : ''}>${esc(l.code)} ${esc(l.nom)}${l.entrepriseId && entById(l.entrepriseId) ? ' · ' + esc(entById(l.entrepriseId).nom) : ''}</option>`).join('');
const planById = id => S.plans.find(p => p.id === id);
const photoById = id => S.photos.find(p => p.id === id);

async function loadChantier(id) {
  if (S.ch && S.ch.id === id && S._fresh) return;
  S.ch = await DB.get('chantiers', id); if (!S.ch || S.ch.deleted) { S.ch = null; return; }
  [S.plans, S.photos, S.visites, S.reserves] = await Promise.all(['plans', 'photos', 'visites', 'reserves'].map(s => DB.all(s, id)));
  S.plans.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); S.photos.sort((a, b) => (b.date || '').localeCompare(a.date || '')); S.visites.sort((a, b) => b.numero - a.numero); S.reserves.sort((a, b) => a.numero - b.numero);
  S._fresh = true;
}
async function save(store, o) { await DB.put(store, o); const arr = { photos: S.photos, plans: S.plans, visites: S.visites, reserves: S.reserves }[store]; if (arr) { const i = arr.findIndex(x => x.id === o.id); if (o.deleted) { if (i >= 0) arr.splice(i, 1); } else if (i >= 0) arr[i] = o; else arr.unshift(o); } if (store === 'chantiers' && S.ch && S.ch.id === o.id) S.ch = o; Sync.soon(); return o; }

/* ================= Navigation ================= */
function route() { const h = location.hash.replace(/^#\/?/, '').split('/'); return h; }
async function render() {
  const r = route(), app = $('#app');
  if (r[0] === 'c' && r[1]) {
    await loadChantier(r[1]); if (!S.ch) { location.hash = '#/'; return; }
    const tab = r[2] || 'photos';
    if (tab === 'v' && r[3]) return viewVisite(app, r[3]);
    if (tab === 'r' && r[3]) return viewReserve(app, r[3]);
    return viewChantier(app, tab);
  }
  S.ch = null; S._fresh = false; return viewHome(app);
}
window.addEventListener('hashchange', render);
const topBar = (title, sub, { back, extra = '' } = {}) => `<div class="top">${back ? `<a class="icon-btn" href="${back}" aria-label="Retour">${ICON.back}</a>` : ''}<h1>${title}${sub ? `<small>${esc(sub)}</small>` : ''}</h1>${extra}<span class="sync" id="syncSt" title="Synchronisation"><i></i></span><button class="icon-btn" id="bSet" aria-label="Réglages">${ICON.gear}</button></div>`;
function bindTop(app) { const b = $('#bSet', app); if (b) b.onclick = settingsSheet; Sync.paint(); }

/* ================= Accueil : chantiers ================= */
async function viewHome(app) {
  const list = (await DB.all('chantiers')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone, standalone = matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  app.innerHTML = topBar('<span class="brand">Terra<b>Chantier</b></span> <span class="ver">v' + APP_VERSION + ' bêta</span>', 'Comptes-rendus, OPR, photos sur plan') + `<main>
    ${!standalone && installEvt ? `<div class="install"><div class="grow"><b>Installer TerraChantier</b><div class="small muted">Icône sur l'écran d'accueil, plein écran, fonctionne sans réseau.</div></div><button class="btn pri" id="bInst">Installer</button></div>` : ''}
    ${!standalone && ios ? `<div class="install"><div class="grow"><b>Installer sur l'iPhone</b><div class="small muted">Dans Safari : bouton Partager, puis « Sur l'écran d'accueil ».</div></div></div>` : ''}
    <div class="bar"><h2 class="grow" style="font-size:20px">Chantiers</h2><button class="btn pri" id="bNew">+ Nouveau chantier</button></div>
    <div class="list">${list.map(c => `<a class="card ch" href="#/c/${c.id}"><span class="ico">${esc((c.code || c.nom || '?').slice(0, 3).toUpperCase())}</span><span class="grow"><b>${esc(c.nom)}</b><div class="small muted">${esc([c.adresse, c.moa].filter(Boolean).join(' · '))}</div></span></a>`).join('') || '<div class="empty"><b>Aucun chantier</b>Créez votre premier chantier, puis importez ses plans de niveaux.</div>'}</div></main>`;
  bindTop(app);
  $('#bNew').onclick = () => editChantier(null);
  if ($('#bInst')) $('#bInst').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); };
}
function editChantier(c) {
  const isNew = !c; c = c || { nom: '', code: '', adresse: '', moa: '', moe: 'TERRAFORM', lots: [], entreprises: [] };
  const sh = sheet(isNew ? 'Nouveau chantier' : 'Chantier', `<div class="grid2">
    <label class="f">Nom de l'opération<input type="text" id="cNom" value="${esc(c.nom)}" placeholder="Réhabilitation de…"></label>
    <label class="f">Code court<input type="text" id="cCode" value="${esc(c.code)}" maxlength="6" placeholder="CTN"></label>
    <label class="f">Adresse<input type="text" id="cAdr" value="${esc(c.adresse)}"></label>
    <label class="f">Maître d'ouvrage<input type="text" id="cMoa" value="${esc(c.moa)}"></label>
    <label class="f">Maître d'œuvre<input type="text" id="cMoe" value="${esc(c.moe)}"></label></div>
    ${isNew ? '<label class="row small"><input type="checkbox" id="cLots" checked> Créer la liste de lots habituelle (modifiable ensuite)</label>' : ''}`,
    `${!isNew ? '<button class="btn danger" id="cDel">Supprimer</button><span class="grow"></span>' : ''}<button class="btn" data-close>Annuler</button><button class="btn pri" id="cOk">Enregistrer</button>`);
  $('#cNom', sh.el).focus();
  $('#cOk', sh.el).onclick = async () => {
    const nom = $('#cNom', sh.el).value.trim(); if (!nom) return toast('Donnez un nom au chantier');
    Object.assign(c, { nom, code: $('#cCode', sh.el).value.trim(), adresse: $('#cAdr', sh.el).value.trim(), moa: $('#cMoa', sh.el).value.trim(), moe: $('#cMoe', sh.el).value.trim() });
    if (isNew) { c.id = DB.uid(); c.chantierId = c.id; if ($('#cLots', sh.el).checked) c.lots = DEFAULT_LOTS.map(([code, nom]) => ({ id: DB.uid(), code, nom, entrepriseId: '' })); }
    await save('chantiers', c); sh.close(); if (isNew) location.hash = `#/c/${c.id}/plans`; else render();
  };
  if ($('#cDel', sh.el)) $('#cDel', sh.el).onclick = async () => { if (!confirm(`Supprimer le chantier « ${c.nom} » et toutes ses données sur cet appareil ?`)) return; c.deleted = true; await save('chantiers', c); sh.close(); location.hash = '#/'; };
}

/* ================= Chantier ================= */
function viewChantier(app, tab) {
  const c = S.ch, nP = S.photos.filter(p => !p.planId).length, nR = S.reserves.filter(r => r.statut === 'ouverte').length;
  app.innerHTML = topBar(esc(c.nom), [c.adresse, c.moa].filter(Boolean).join(' · '), { back: '#/' }) +
    `<nav class="tabs">${[['photos', 'Photos' + (nP ? ` (${nP} à localiser)` : '')], ['visites', 'Comptes-rendus'], ['reserves', 'Réserves' + (nR ? ` (${nR})` : '')], ['plans', 'Plans'], ['fiche', 'Lots et entreprises']].map(([k, t]) => `<a href="#/c/${c.id}/${k}" class="${k === tab ? 'on' : ''}">${t}</a>`).join('')}</nav><main id="main"></main>
    <button class="fab" id="fab" aria-label="Prendre une photo">${ICON.cam}</button>`;
  bindTop(app); $('#fab').onclick = () => takePhoto({});
  const m = $('#main');
  ({ photos: tabPhotos, visites: tabVisites, reserves: tabReserves, plans: tabPlans, fiche: tabFiche }[tab] || tabPhotos)(m);
}

/* ---------- Photos ---------- */
async function thumbsHTML(list, { sel, pick } = {}) {
  const urls = await Promise.all(list.map(p => BlobURL(p.thumbId || p.blobId)));
  return list.map((p, i) => `<button type="button" class="th${sel && sel.has(p.id) ? ' sel' : ''}" data-ph="${p.id}" title="${esc(p.legende || '')}"><img src="${urls[i]}" alt="${esc(p.legende || 'Photo')}" loading="lazy">${!p.planId ? '<span class="tag warn">à localiser</span>' : `<span class="tag">${esc((planById(p.planId) || {}).nom || '')}</span>`}${pick ? `<span class="ck">${sel && sel.has(p.id) ? '✓' : ''}</span>` : ''}</button>`).join('');
}
async function tabPhotos(m) {
  const flt = S._phF || 'all', list = S.photos.filter(p => flt === 'all' || (flt === 'loc' ? !p.planId : p.planId === flt));
  const byDay = new Map(); for (const p of list) { const d = dayOf(p.date); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(p); }
  m.innerHTML = `<div class="bar"><button class="btn pri" id="bCam">${ICON.cam.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2"')} Prendre une photo</button><button class="btn" id="bGal">Importer des photos</button><span class="grow"></span></div>
    <div class="levels bar"><button class="chip${flt === 'all' ? ' on' : ''}" data-f="all">Toutes (${S.photos.length})</button><button class="chip${flt === 'loc' ? ' on' : ''}" data-f="loc">À localiser (${S.photos.filter(p => !p.planId).length})</button>${S.plans.map(p => `<button class="chip${flt === p.id ? ' on' : ''}" data-f="${p.id}">${esc(p.nom)}</button>`).join('')}</div>
    <div id="days">${list.length ? '' : '<div class="empty"><b>Aucune photo</b>Le bouton appareil photo, en bas à droite, prend une photo et la place sur le plan du niveau.</div>'}</div>`;
  $('#bCam').onclick = () => takePhoto({}); $('#bGal').onclick = () => importPhotos();
  $$('[data-f]', m).forEach(b => b.onclick = () => { S._phF = b.dataset.f; tabPhotos(m); });
  let h = ''; for (const [d, ps] of byDay) h += `<div class="day">${fmtDL(d)} · ${ps.length}</div><div class="thumbs">${await thumbsHTML(ps)}</div>`;
  if (list.length) $('#days', m).innerHTML = h;
  $$('[data-ph]', m).forEach(b => b.onclick = () => photoSheet(photoById(b.dataset.ph)));
}
/* prise de vue : appareil photo du téléphone, puis localisation sur le plan */
function takePhoto(ctx) { const inp = $('#camIn'); inp.value = ''; inp.onchange = () => { if (inp.files[0]) processFiles([...inp.files], ctx); }; inp.click(); }
function importPhotos(ctx = {}) { const inp = $('#galIn'); inp.value = ''; inp.onchange = () => { if (inp.files.length) processFiles([...inp.files], { ...ctx, bulk: inp.files.length > 1 }); }; inp.click(); }
async function processFiles(files, ctx) {
  const made = [];
  for (const [i, f] of files.entries()) {
    if (files.length > 1) toast(`Photo ${i + 1} sur ${files.length}…`, 1200);
    const [ex, im] = await Promise.all([readExif(f), shrinkImage(f)]);
    const blobId = await DB.putBlob(im.blob), thumbId = await DB.putBlob(im.thumb);
    const p = { id: DB.uid(), chantierId: S.ch.id, blobId, thumbId, w: im.w, h: im.h, date: ex.date || (ctx.bulk ? new Date(f.lastModified).toISOString() : new Date().toISOString()), gps: ex.lat ? { lat: ex.lat, lon: ex.lon, alt: ex.alt } : null, compass: ex.dir ?? null, legende: '', lotId: ctx.lotId || '', planId: null, x: null, y: null, dir: null, auteur: S.auteur };
    await save('photos', p); made.push(p);
  }
  if (ctx.bulk) { toast(`${made.length} photo(s) importée(s), datées d'après l'appareil. Localisez-les depuis l'onglet Photos.`, 4000); render(); return made; }
  for (const p of made) await locateSheet(p, ctx);
  return made;
}
/* fenêtre de localisation : niveau, toucher l'emplacement, puis (facultatif) le point visé */
function locateSheet(p, ctx = {}) {
  return new Promise(async res => {
    const url = await BlobURL(p.thumbId || p.blobId); let plan = planById(p.planId) || planById(S.lastPlan) || S.plans[0], pt = p.planId ? { x: p.x, y: p.y, dir: p.dir } : null, aimNext = false;
    const fixedType = ctx.forObs || ctx.forReserve;
    const sh = sheet(fixedType ? 'Photo' : 'Nouvelle photo', `
      <div class="row" style="align-items:flex-start"><img src="${url}" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;flex:none"><div class="grow" style="display:flex;flex-direction:column;gap:6px">
        <input type="text" id="lLeg" placeholder="Légende ou observation" value="${esc(p.legende)}"><select id="lLot">${lotOptions(p.lotId)}</select></div></div>
      ${fixedType ? '' : `<div class="levels" id="lType">${[['photo', 'Photo seule'], ['obs', 'Observation du CR du jour'], ['res', 'Réserve']].map(([k, t], i) => `<button type="button" class="chip${(ctx.type || 'photo') === k ? ' on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>`}
      ${S.plans.length ? `<div class="levels" id="lLev">${S.plans.map(pl => `<button type="button" class="chip${plan && pl.id === plan.id ? ' on' : ''}" data-l="${pl.id}">${esc(pl.nom)}</button>`).join('')}</div>
      <div class="hint" id="lHint">Touchez l'emplacement de la photo sur le plan, puis le point visé pour indiquer la direction (facultatif).</div><div id="lPv" style="height:min(58vh,560px)"></div>`
      : `<div class="empty" style="padding:16px"><b>Aucun plan</b>Importez les plans de niveaux (onglet Plans) pour localiser les photos.</div>`}`,
      `${S.plans.length ? '<button class="btn" id="lNo">Sans localisation</button>' : ''}<span class="grow"></span>${fixedType ? '' : '<button class="btn" id="lNext">Enregistrer, photo suivante</button>'}<button class="btn pri" id="lOk">Enregistrer</button>`, { wide: true });
    let type = ctx.type || 'photo';
    $$('[data-t]', sh.el).forEach(b => b.onclick = () => { type = b.dataset.t; $$('[data-t]', sh.el).forEach(x => x.classList.toggle('on', x === b)); });
    let pv = null; const marks = () => { if (!pv) return; const other = S.photos.filter(q => q.planId === plan.id && q.id !== p.id).map(q => ({ x: q.x, y: q.y, kind: '', label: '', title: q.legende }));
      pv.setMarkers([...other, ...(pt ? [{ x: pt.x, y: pt.y, dir: pt.dir, kind: 'new', label: '' }] : [])]); };
    if (S.plans.length) {
      pv = new PlanView($('#lPv', sh.el), { onTap: (x, y) => {
        if (pt && aimNext) { const dx = (x - pt.x) * plan.w, dy = (y - pt.y) * plan.h; if (Math.hypot(dx, dy) > 8 / pv.s) { pt.dir = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; aimNext = false; $('#lHint', sh.el).textContent = 'Direction notée. Touchez ailleurs pour déplacer le repère.'; marks(); return; } }
        pt = { x, y, dir: null }; aimNext = true; $('#lHint', sh.el).textContent = 'Repère placé. Touchez le point visé pour la direction, ou enregistrez.'; marks(); } });
      await pv.load(plan); if (pt) pv.center(pt.x, pt.y, Math.max(pv.s, .35)); marks();
      $$('[data-l]', sh.el).forEach(b => b.onclick = async () => { plan = planById(b.dataset.l); if (pt && p.planId !== plan.id) pt = null; $$('[data-l]', sh.el).forEach(x => x.classList.toggle('on', x === b)); await pv.load(plan); marks(); });
    }
    const done = async (next, noLoc) => {
      p.legende = $('#lLeg', sh.el).value.trim(); p.lotId = $('#lLot', sh.el).value;
      if (!noLoc && pt && plan) { p.planId = plan.id; p.x = pt.x; p.y = pt.y; p.dir = pt.dir; S.lastPlan = plan.id; DB.meta('lastPlan', plan.id); } else if (noLoc) { p.planId = null; p.x = p.y = p.dir = null; }
      await save('photos', p);
      if (!fixedType && type === 'obs') await addObsFromPhoto(p);
      if (!fixedType && type === 'res') await addReserveFromPhoto(p);
      sh.close(); res(p);
      if (next) takePhoto({ ...ctx, type }); else if (!ctx.silent) render();
    };
    $('#lOk', sh.el).onclick = () => done(false); if ($('#lNext', sh.el)) $('#lNext', sh.el).onclick = () => done(true); if ($('#lNo', sh.el)) $('#lNo', sh.el).onclick = () => done(false, true);
    sh.bg.addEventListener('closed', () => res(p));
  });
}
async function photoSheet(p) {
  const url = await BlobURL(p.blobId), plan = planById(p.planId), uses = [...S.visites.flatMap(v => (v.observations || []).filter(o => (o.photoIds || []).includes(p.id)).map(o => `CR n° ${v.numero}, ${lotLabel(o.lotId)}`)), ...S.reserves.filter(r => (r.photoIds || []).includes(p.id)).map(r => `Réserve n° ${r.numero}`)];
  const sh = sheet('Photo du ' + fmtD(p.date) + ' à ' + fmtT(p.date), `<img class="photo-big" src="${url}" alt="${esc(p.legende)}">
    <label class="f">Légende<input type="text" id="pLeg" value="${esc(p.legende)}"></label><label class="f">Lot<select id="pLot">${lotOptions(p.lotId)}</select></label>
    <div class="small muted">${plan ? 'Localisée : ' + esc(plan.nom) : 'Pas encore localisée sur un plan'}${p.gps ? ` · GPS ${p.gps.lat.toFixed(5)}, ${p.gps.lon.toFixed(5)}` : ''}${uses.length ? '<br>Utilisée dans : ' + esc(uses.join(' ; ')) : ''}</div>`,
    `<button class="btn danger" id="pDel">Supprimer</button><span class="grow"></span><button class="btn" id="pLoc">${plan ? 'Déplacer sur le plan' : 'Localiser'}</button><button class="btn" id="pRes">Créer une réserve</button><button class="btn pri" id="pOk">Enregistrer</button>`);
  const keep = async () => { p.legende = $('#pLeg', sh.el).value.trim(); p.lotId = $('#pLot', sh.el).value; await save('photos', p); };
  $('#pOk', sh.el).onclick = async () => { await keep(); sh.close(); render(); };
  $('#pLoc', sh.el).onclick = async () => { await keep(); sh.close(); await locateSheet(p, { forObs: true }); };
  $('#pRes', sh.el).onclick = async () => { await keep(); sh.close(); const r = await addReserveFromPhoto(p); location.hash = `#/c/${S.ch.id}/r/${r.id}`; };
  $('#pDel', sh.el).onclick = async () => { if (!confirm('Supprimer cette photo ?')) return; for (const v of S.visites) { let ch = false; for (const o of v.observations || []) if ((o.photoIds || []).includes(p.id)) { o.photoIds = o.photoIds.filter(x => x !== p.id); ch = true; } if (ch) await save('visites', v); }
    for (const r of S.reserves) if ((r.photoIds || []).includes(p.id)) { r.photoIds = r.photoIds.filter(x => x !== p.id); await save('reserves', r); } p.deleted = true; await save('photos', p); sh.close(); render(); };
}
/* choix de photos du chantier (pour une observation ou une réserve) */
function pickPhotos(pre = [], day) {
  return new Promise(async res => {
    const sel = new Set(pre); let onlyDay = !!day;
    const sh = sheet('Choisir des photos', `<div class="levels">${day ? `<button class="chip on" data-d="1">Du ${fmtD(day)}</button><button class="chip" data-d="0">Toutes</button>` : ''}</div><div class="thumbs" id="ppG"></div>`, `<span class="grow small muted" id="ppN"></span><button class="btn" data-close>Annuler</button><button class="btn pri" id="ppOk">Valider</button>`);
    const draw = async () => { const list = S.photos.filter(p => !onlyDay || dayOf(p.date) === day); $('#ppG', sh.el).innerHTML = list.length ? await thumbsHTML(list, { sel, pick: true }) : '<div class="empty">Aucune photo.</div>'; $('#ppN', sh.el).textContent = sel.size + ' sélectionnée(s)';
      $$('[data-ph]', sh.el).forEach(b => b.onclick = () => { const id = b.dataset.ph; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('sel', sel.has(id)); b.querySelector('.ck').textContent = sel.has(id) ? '✓' : ''; $('#ppN', sh.el).textContent = sel.size + ' sélectionnée(s)'; }); };
    $$('[data-d]', sh.el).forEach(b => b.onclick = () => { onlyDay = b.dataset.d === '1'; $$('[data-d]', sh.el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    await draw(); let ok = false;
    $('#ppOk', sh.el).onclick = () => { ok = true; sh.close(); }; sh.bg.addEventListener('closed', () => res(ok ? [...sel] : null));
  });
}

/* ---------- Comptes-rendus ---------- */
function newObs(lotId = '', texte = '', photoIds = []) { return { id: DB.uid(), lotId, texte, statut: 'afaire', echeance: '', photoIds, origine: null }; }
async function visiteDuJour(create = true) {
  let v = S.visites.find(x => x.date === today()); if (v || !create) return v;
  v = { id: DB.uid(), chantierId: S.ch.id, numero: (S.visites.reduce((m, x) => Math.max(m, x.numero || 0), 0)) + 1, date: today(), heure: new Date().toTimeString().slice(0, 5), meteo: '', redacteur: S.auteur, presents: {}, autres: '', observations: [], prochaine: '', diffusion: '' };
  return save('visites', v);
}
async function addObsFromPhoto(p) { const v = await visiteDuJour(); v.observations.push(newObs(p.lotId, p.legende, [p.id])); await save('visites', v); toast(`Ajoutée au CR n° ${v.numero}`); }
function tabVisites(m) {
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">Comptes-rendus</h2><button class="btn pri" id="bNv">+ Nouveau compte-rendu</button></div>
    <div class="list">${S.visites.map(v => { const o = v.observations || [], af = o.filter(x => x.statut === 'afaire').length; return `<a class="card ch" href="#/c/${S.ch.id}/v/${v.id}"><span class="ico">${v.numero}</span><span class="grow"><b>CR n° ${v.numero} · ${fmtDL(v.date)}</b><div class="small muted">${o.length} observation(s)${af ? `, ${af} à faire` : ''}${v.diffuseLe ? ' · diffusé le ' + fmtD(v.diffuseLe) : ''}</div></span></a>`; }).join('') || '<div class="empty"><b>Aucun compte-rendu</b>Créez le compte-rendu de la visite : les photos du jour vous seront proposées.</div>'}</div>`;
  $('#bNv').onclick = async () => {
    const v = { id: DB.uid(), chantierId: S.ch.id, numero: (S.visites.reduce((mx, x) => Math.max(mx, x.numero || 0), 0)) + 1, date: today(), heure: '', meteo: '', redacteur: S.auteur, presents: {}, autres: '', observations: [], prochaine: '', diffusion: '' };
    const prev = S.visites[0]; if (prev) { v.presents = Object.fromEntries(Object.keys(prev.presents || {}).map(k => [k, ''])); v.observations = (prev.observations || []).filter(o => o.statut === 'afaire').map(o => ({ ...o, id: DB.uid(), origine: o.origine || prev.numero, photoIds: [] })); }
    await save('visites', v); location.hash = `#/c/${S.ch.id}/v/${v.id}`;
  };
}
async function viewVisite(app, id) {
  const v = S.visites.find(x => x.id === id); if (!v) { location.hash = `#/c/${S.ch.id}/visites`; return; }
  const ents = S.ch.entreprises || [], obsByLot = new Map();
  for (const o of v.observations) { const k = o.lotId || ''; if (!obsByLot.has(k)) obsByLot.set(k, []); obsByLot.get(k).push(o); }
  const lotsSorted = [...obsByLot.keys()].sort((a, b) => (lotById(a) ? lotById(a).code : '~').localeCompare(lotById(b) ? lotById(b).code : '~'));
  const used = new Set(v.observations.flatMap(o => o.photoIds || [])), dayPh = S.photos.filter(p => dayOf(p.date) === v.date && !used.has(p.id));
  app.innerHTML = topBar(`CR n° ${v.numero}`, S.ch.nom, { back: `#/c/${S.ch.id}/visites`, extra: '<button class="btn pri sm" id="bPdf">PDF</button>' }) + `<main>
    <div class="card"><div class="grid2"><label class="f">Date<input type="date" data-k="date" value="${v.date}"></label><label class="f">Heure<input type="time" data-k="heure" value="${esc(v.heure)}"></label>
      <label class="f">Météo<input type="text" data-k="meteo" value="${esc(v.meteo)}" placeholder="Beau temps, 14 °C"></label><label class="f">Rédacteur<input type="text" data-k="redacteur" value="${esc(v.redacteur)}"></label>
      <label class="f">Prochaine réunion<input type="text" data-k="prochaine" value="${esc(v.prochaine)}" placeholder="Mardi 27/10 à 9 h 30 sur site"></label></div></div>
    <h3 style="margin:18px 0 6px;font-size:16px">Présents</h3>
    <div class="card">${ents.length ? `<table class="t"><tbody>${ents.map(e => `<tr><td><b>${esc(e.nom)}</b><div class="small muted">${esc([lotsOf().filter(l => l.entrepriseId === e.id).map(l => l.code).join(', '), e.contact].filter(Boolean).join(' · '))}</div></td><td style="width:120px"><div class="pres" data-e="${e.id}">${['P', 'A', 'E'].map(k => `<button type="button" data-v="${k}" class="${(v.presents || {})[e.id] === k ? 'on' : ''}" title="${{ P: 'Présent', A: 'Absent', E: 'Excusé' }[k]}">${k}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Ajoutez les entreprises dans l\'onglet « Lots et entreprises » pour noter les présences.</div>'}
      <label class="f" style="margin-top:8px">Autres participants<textarea data-k="autres" rows="2" placeholder="MOA : Mme X ; BET structure : M. Y">${esc(v.autres)}</textarea></label></div>
    ${dayPh.length ? `<h3 style="margin:18px 0 6px;font-size:16px">Photos du ${fmtD(v.date)} non utilisées (${dayPh.length})</h3><div class="hint" style="margin-bottom:6px">Touchez une photo pour en faire une observation.</div><div class="thumbs" id="dayPh">${await thumbsHTML(dayPh)}</div>` : ''}
    <div class="bar" style="margin-top:18px"><h3 style="font-size:16px;flex:1 1 100%">Observations</h3><button class="btn" id="bPrev">Reprendre les points en cours du CR précédent</button><button class="btn pri" id="bObs">+ Observation</button></div>
    <div id="obsL">${lotsSorted.map(k => `<div class="lothead"><span class="code">${esc(lotById(k) ? lotById(k).code : '—')}</span>${esc(lotById(k) ? lotById(k).nom : 'Sans lot')}${lotById(k) && entById(lotById(k).entrepriseId) ? `<span class="muted small">· ${esc(entById(lotById(k).entrepriseId).nom)}</span>` : ''}</div>${obsByLot.get(k).map(o => obsHTML(o)).join('')}`).join('') || '<div class="empty">Aucune observation.</div>'}</div>
    <label class="f" style="margin-top:16px">Diffusion<textarea data-k="diffusion" rows="2" placeholder="Toutes les entreprises, MOA, BET">${esc(v.diffusion)}</textarea></label>
    <div class="bar" style="margin-top:16px"><button class="btn danger" id="bDelV">Supprimer ce compte-rendu</button></div></main>
    <button class="fab" id="fab" aria-label="Photo pour ce compte-rendu">${ICON.cam}</button>`;
  bindTop(app);
  await Promise.all(v.observations.map(async o => { const el = $(`[data-o="${o.id}"] .thumbs`, app); if (el && (o.photoIds || []).length) { el.innerHTML = await thumbsHTML(o.photoIds.map(photoById).filter(Boolean)); el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => photoSheet(photoById(b.dataset.ph))); } }));
  let tm; const persist = () => { clearTimeout(tm); tm = setTimeout(() => save('visites', v), 400); };
  $$('[data-k]', app).forEach(i => i.oninput = () => { v[i.dataset.k] = i.value; persist(); });
  $$('.pres', app).forEach(g => g.onclick = e => { const b = e.target.closest('button'); if (!b) return; const cur = v.presents[g.dataset.e]; v.presents[g.dataset.e] = cur === b.dataset.v ? '' : b.dataset.v; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v.presents[g.dataset.e])); persist(); });
  $$('[data-o]', app).forEach(el => { const o = v.observations.find(x => x.id === el.dataset.o);
    el.querySelectorAll('[data-ok]').forEach(i => i.oninput = i.onchange = () => { o[i.dataset.ok] = i.value; if (i.dataset.ok === 'statut') el.className = 'obs st-' + o.statut; if (i.dataset.ok === 'lotId') { save('visites', v).then(render); return; } persist(); });
    el.querySelector('[data-act=ph]').onclick = async () => { const ids = await pickPhotos(o.photoIds || [], v.date); if (ids) { o.photoIds = ids; await save('visites', v); render(); } };
    el.querySelector('[data-act=cam]').onclick = () => { const inp = $('#camIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; const [p] = await processFiles([...inp.files], { forObs: true, lotId: o.lotId, silent: true }); o.photoIds = [...(o.photoIds || []), p.id]; if (!p.legende && o.texte) { p.legende = o.texte.slice(0, 80); await save('photos', p); } await save('visites', v); render(); }; inp.click(); };
    el.querySelector('[data-act=del]').onclick = async () => { if (!confirm('Supprimer cette observation ?')) return; v.observations = v.observations.filter(x => x !== o); await save('visites', v); render(); };
    el.querySelector('[data-act=res]').onclick = async () => { const r = await newReserve({ lotId: o.lotId, description: o.texte, photoIds: [...(o.photoIds || [])] }); const p = photoById((o.photoIds || [])[0]); if (p && p.planId) Object.assign(r, { planId: p.planId, x: p.x, y: p.y }); await save('reserves', r); toast(`Réserve n° ${r.numero} créée`); };
  });
  $('#bObs').onclick = async () => { const lotId = await pickLot(); if (lotId === null) return; v.observations.push(newObs(lotId)); await save('visites', v); await render(); const last = $$('[data-o] textarea', app).pop(); if (last) last.focus(); };
  $('#bPrev').onclick = async () => { const prev = S.visites.filter(x => x.numero < v.numero).sort((a, b) => b.numero - a.numero)[0]; if (!prev) return toast('Pas de compte-rendu précédent');
    const have = new Set(v.observations.map(o => o.texte + '|' + o.lotId)), add = (prev.observations || []).filter(o => o.statut === 'afaire' && !have.has(o.texte + '|' + o.lotId)).map(o => ({ ...o, id: DB.uid(), origine: o.origine || prev.numero, photoIds: [] }));
    if (!add.length) return toast('Aucun point en cours à reprendre'); v.observations.push(...add); await save('visites', v); toast(`${add.length} point(s) repris du CR n° ${prev.numero}`); render(); };
  if ($('#dayPh')) $$('#dayPh [data-ph]', app).forEach(b => b.onclick = async () => { const p = photoById(b.dataset.ph); v.observations.push(newObs(p.lotId, p.legende, [p.id])); await save('visites', v); render(); });
  $('#fab').onclick = () => { const inp = $('#camIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; const [p] = await processFiles([...inp.files], { forObs: true, silent: true }); v.observations.push(newObs(p.lotId, p.legende, [p.id])); await save('visites', v); render(); }; inp.click(); };
  $('#bPdf').onclick = () => exportCR(v);
  $('#bDelV').onclick = async () => { if (!confirm(`Supprimer le CR n° ${v.numero} ?`)) return; v.deleted = true; await save('visites', v); location.hash = `#/c/${S.ch.id}/visites`; };
}
function obsHTML(o) {
  return `<div class="obs st-${o.statut}" data-o="${o.id}"><textarea data-ok="texte" rows="2" placeholder="Observation">${esc(o.texte)}</textarea>
    <div class="row" style="flex-wrap:wrap"><select data-ok="statut" style="width:auto">${Object.entries(OBS_ST).map(([k, t]) => `<option value="${k}"${o.statut === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <label class="row small muted" style="gap:4px">Échéance <input type="date" data-ok="echeance" value="${o.echeance || ''}" style="width:auto"></label>
    <select data-ok="lotId" style="width:auto;max-width:200px">${lotOptions(o.lotId)}</select>${o.origine ? `<span class="small muted">depuis le CR n° ${o.origine}</span>` : ''}</div>
    <div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(74px,1fr))"></div>
    <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="cam">Photo</button><button class="btn sm" data-act="ph">Choisir des photos</button><button class="btn sm" data-act="res">En faire une réserve</button><span class="grow"></span><button class="btn sm danger" data-act="del">Supprimer</button></div></div>`;
}
function pickLot(title = 'Lot concerné') {
  return new Promise(res => { const sh = sheet(title, `<div class="list">${[{ id: '', code: '—', nom: 'Sans lot / généralités' }, ...lotsOf().slice().sort((a, b) => a.code.localeCompare(b.code))].map(l => `<button class="card ch" style="text-align:left;cursor:pointer" data-lot="${l.id}"><span class="ico" style="width:36px;height:36px;font-size:13px">${esc(l.code)}</span><span class="grow"><b>${esc(l.nom)}</b>${l.entrepriseId && entById(l.entrepriseId) ? `<div class="small muted">${esc(entById(l.entrepriseId).nom)}</div>` : ''}</span></button>`).join('')}</div>`);
    let v = null; $$('[data-lot]', sh.el).forEach(b => b.onclick = () => { v = b.dataset.lot; sh.close(); }); sh.bg.addEventListener('closed', () => res(v)); });
}

/* ---------- Réserves (OPR) ---------- */
async function newReserve(o = {}) { const r = { id: DB.uid(), chantierId: S.ch.id, numero: S.reserves.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1, lotId: '', description: '', localisation: '', planId: null, x: null, y: null, photoIds: [], statut: 'ouverte', phase: S._phase || 'OPR', dateConstat: today(), dateLevee: '', echeance: '', commentaire: '', ...o }; return save('reserves', r); }
async function addReserveFromPhoto(p) { const r = await newReserve({ lotId: p.lotId, description: p.legende, photoIds: [p.id], planId: p.planId, x: p.x, y: p.y }); toast(`Réserve n° ${r.numero} créée`); return r; }
async function tabReserves(m) {
  const F = S._rF || (S._rF = { lot: '', statut: 'ouverte', phase: '' }), list = S.reserves.filter(r => (!F.lot || r.lotId === F.lot) && (!F.statut || r.statut === F.statut) && (!F.phase || r.phase === F.phase));
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">Réserves</h2><button class="btn" id="bRx">Excel</button><button class="btn" id="bRp">PDF</button><button class="btn pri" id="bNr">+ Réserve</button></div>
    <div class="bar"><select id="fLot" style="width:auto;max-width:230px">${lotOptions(F.lot, 'Tous les lots')}</select><select id="fSt" style="width:auto"><option value="">Tous statuts</option>${Object.entries(RES_ST).map(([k, t]) => `<option value="${k}"${F.statut === k ? ' selected' : ''}>${t}</option>`).join('')}</select><select id="fPh" style="width:auto"><option value="">Toutes phases</option>${Object.entries(PHASES).map(([k, t]) => `<option value="${k}"${F.phase === k ? ' selected' : ''}>${t}</option>`).join('')}</select><span class="small muted">${list.length} réserve(s)</span></div>
    ${S.plans.length ? `<div class="levels bar">${S.plans.map(p => `<button class="chip" data-pl="${p.id}">Voir sur ${esc(p.nom)} (${list.filter(r => r.planId === p.id).length})</button>`).join('')}</div>` : ''}
    <div class="card" style="padding:0 8px">${list.length ? `<table class="t"><thead><tr><th>N°</th><th>Réserve</th><th>Lot</th><th>Statut</th></tr></thead><tbody>${list.map(r => `<tr data-r="${r.id}" style="cursor:pointer"><td><b>${r.numero}</b></td><td>${esc(r.description || '(sans description)')}<div class="small muted">${esc([(planById(r.planId) || {}).nom, r.localisation].filter(Boolean).join(' · '))}${(r.photoIds || []).length ? ` · ${r.photoIds.length} photo(s)` : ''}</div></td><td class="small">${esc(lotLabel(r.lotId))}</td><td><span class="badge b-${r.statut}">${RES_ST[r.statut]}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>Aucune réserve</b>Prenez une photo et choisissez « Réserve », ou ajoutez-la ici.</div>'}</div>`;
  $('#fLot').onchange = e => { F.lot = e.target.value; tabReserves(m); }; $('#fSt').onchange = e => { F.statut = e.target.value; tabReserves(m); }; $('#fPh').onchange = e => { F.phase = e.target.value; tabReserves(m); };
  $$('[data-r]', m).forEach(t => t.onclick = () => location.hash = `#/c/${S.ch.id}/r/${t.dataset.r}`);
  $('#bNr').onclick = async () => { const lotId = await pickLot(); if (lotId === null) return; const r = await newReserve({ lotId }); location.hash = `#/c/${S.ch.id}/r/${r.id}`; };
  $('#bRp').onclick = () => exportReserves(list, F); $('#bRx').onclick = () => exportReservesXlsx(list);
  $$('[data-pl]', m).forEach(b => b.onclick = () => planSheet(planById(b.dataset.pl), { reserves: list }));
}
async function viewReserve(app, id) {
  const r = S.reserves.find(x => x.id === id); if (!r) { location.hash = `#/c/${S.ch.id}/reserves`; return; }
  const plan = planById(r.planId);
  app.innerHTML = topBar(`Réserve n° ${r.numero}`, S.ch.nom, { back: `#/c/${S.ch.id}/reserves` }) + `<main>
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><label class="f">Description<textarea data-k="description" rows="3">${esc(r.description)}</textarea></label>
    <div class="grid2"><label class="f">Lot<select data-k="lotId">${lotOptions(r.lotId)}</select></label><label class="f">Localisation (pièce, repère)<input type="text" data-k="localisation" value="${esc(r.localisation)}" placeholder="Logement B12, salle de bains"></label>
      <label class="f">Phase<select data-k="phase">${Object.entries(PHASES).map(([k, t]) => `<option value="${k}"${r.phase === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label class="f">Statut<select data-k="statut">${Object.entries(RES_ST).map(([k, t]) => `<option value="${k}"${r.statut === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Constatée le<input type="date" data-k="dateConstat" value="${r.dateConstat || ''}"></label><label class="f">À lever avant le<input type="date" data-k="echeance" value="${r.echeance || ''}"></label><label class="f">Levée le<input type="date" data-k="dateLevee" value="${r.dateLevee || ''}"></label></div>
    <label class="f">Commentaire<textarea data-k="commentaire" rows="2">${esc(r.commentaire)}</textarea></label></div>
    <h3 style="margin:18px 0 6px;font-size:16px">Plan</h3><div class="card">${plan ? `<div id="rPv" style="height:320px"></div><div class="row" style="margin-top:8px"><span class="small muted grow">${esc(plan.nom)}</span><button class="btn sm" id="rLoc">Déplacer</button></div>` : `<div class="row"><span class="grow muted">Pas encore placée sur un plan.</span><button class="btn sm" id="rLoc"${S.plans.length ? '' : ' disabled'}>Placer sur le plan</button></div>`}</div>
    <h3 style="margin:18px 0 6px;font-size:16px">Photos</h3><div class="thumbs" id="rPh"></div><div class="row" style="margin-top:8px"><button class="btn" id="rCam">Photo</button><button class="btn" id="rPick">Choisir des photos</button></div>
    <div class="bar" style="margin-top:20px"><button class="btn danger" id="rDel">Supprimer la réserve</button></div></main><button class="fab" id="fab" aria-label="Photo de la réserve">${ICON.cam}</button>`;
  bindTop(app);
  const ph = (r.photoIds || []).map(photoById).filter(Boolean); $('#rPh').innerHTML = ph.length ? await thumbsHTML(ph) : '<span class="hint">Aucune photo.</span>'; $$('#rPh [data-ph]').forEach(b => b.onclick = () => photoSheet(photoById(b.dataset.ph)));
  let tm; $$('[data-k]', app).forEach(i => i.oninput = i.onchange = () => { r[i.dataset.k] = i.value; if (i.dataset.k === 'statut' && r.statut === 'levee' && !r.dateLevee) { r.dateLevee = today(); $('[data-k=dateLevee]', app).value = r.dateLevee; } clearTimeout(tm); tm = setTimeout(() => save('reserves', r), 400); });
  if (plan) { const pv = new PlanView($('#rPv'), {}); await pv.load(plan); pv.setMarkers([{ x: r.x, y: r.y, kind: 'res', label: r.numero }]); pv.center(r.x, r.y, Math.max(pv.s * 3, .25)); }
  $('#rLoc').onclick = () => placeOnPlan(r.planId || S.lastPlan, r.planId ? { x: r.x, y: r.y } : null, `Réserve n° ${r.numero}`).then(async loc => { if (!loc) return; Object.assign(r, loc); await save('reserves', r); render(); });
  const addCam = () => { const inp = $('#camIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; const [p] = await processFiles([...inp.files], { forReserve: true, lotId: r.lotId, silent: true }); r.photoIds = [...(r.photoIds || []), p.id]; if (!r.planId && p.planId) Object.assign(r, { planId: p.planId, x: p.x, y: p.y }); await save('reserves', r); render(); }; inp.click(); };
  $('#rCam').onclick = addCam; $('#fab').onclick = addCam;
  $('#rPick').onclick = async () => { const ids = await pickPhotos(r.photoIds || [], null); if (ids) { r.photoIds = ids; await save('reserves', r); render(); } };
  $('#rDel').onclick = async () => { if (!confirm(`Supprimer la réserve n° ${r.numero} ?`)) return; r.deleted = true; await save('reserves', r); location.hash = `#/c/${S.ch.id}/reserves`; };
}
/* placer un repère (réserve) sur un plan */
function placeOnPlan(planId, pt, title) {
  return new Promise(async res => {
    let plan = planById(planId) || S.plans[0], loc = pt ? { ...pt } : null;
    const sh = sheet(title, `<div class="levels">${S.plans.map(pl => `<button type="button" class="chip${pl.id === plan.id ? ' on' : ''}" data-l="${pl.id}">${esc(pl.nom)}</button>`).join('')}</div><div class="hint">Touchez l'emplacement sur le plan.</div><div id="ppv" style="height:min(62vh,600px)"></div>`, `<button class="btn" data-close>Annuler</button><button class="btn pri" id="ppOk">Valider</button>`, { wide: true });
    const pv = new PlanView($('#ppv', sh.el), { onTap: (x, y) => { loc = { x, y }; pv.setMarkers([{ x, y, kind: 'new' }]); } });
    await pv.load(plan); if (loc) pv.setMarkers([{ ...loc, kind: 'new' }]);
    $$('[data-l]', sh.el).forEach(b => b.onclick = async () => { plan = planById(b.dataset.l); loc = null; $$('[data-l]', sh.el).forEach(x => x.classList.toggle('on', x === b)); await pv.load(plan); pv.setMarkers([]); });
    let out = null; $('#ppOk', sh.el).onclick = () => { if (!loc) return toast('Touchez le plan pour placer le repère'); out = { planId: plan.id, x: loc.x, y: loc.y }; S.lastPlan = plan.id; sh.close(); };
    sh.bg.addEventListener('closed', () => res(out));
  });
}

/* ---------- Plans ---------- */
async function tabPlans(m) {
  const urls = await Promise.all(S.plans.map(p => BlobURL(p.thumbId)));
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">Plans de niveaux</h2><button class="btn pri" id="bPdf">+ Plan PDF</button><button class="btn" id="bPImg">+ Plan en image</button></div>
    <div class="hint" style="margin-bottom:10px">Un PDF de plusieurs pages donne un niveau par page. Nommez chaque niveau (Sous-sol, RDC, R+1…) ; les photos et les réserves s'y placent d'un toucher.</div>
    <div id="pdfProg"></div>
    <div class="list">${S.plans.map((p, i) => `<div class="card row"><img src="${urls[i]}" alt="" style="width:86px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px;cursor:pointer" data-open="${p.id}"><div class="grow"><input type="text" value="${esc(p.nom)}" data-ren="${p.id}" aria-label="Nom du niveau"><div class="small muted" style="margin-top:3px">${S.photos.filter(x => x.planId === p.id).length} photo(s) · ${S.reserves.filter(x => x.planId === p.id).length} réserve(s)${p.source ? ' · ' + esc(p.source) : ''}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm danger" data-del="${p.id}" aria-label="Supprimer">×</button></div></div>`).join('') || '<div class="empty"><b>Aucun plan</b>Importez les plans de niveaux du dossier (PDF).</div>'}</div>`;
  // deux boutons : sur Android, un sélecteur qui accepte aussi les images ouvre la galerie de photos, où les PDF n'apparaissent pas
  $('#bPdf').onclick = () => { const inp = $('#pdfIn'); inp.value = ''; inp.onchange = () => inp.files[0] && importPlan(inp.files[0], m); inp.click(); };
  $('#bPImg').onclick = () => { const inp = $('#planImgIn'); inp.value = ''; inp.onchange = () => inp.files[0] && importPlan(inp.files[0], m); inp.click(); };
  $$('[data-ren]', m).forEach(i => i.onchange = async () => { const p = planById(i.dataset.ren); p.nom = i.value.trim() || p.nom; await save('plans', p); });
  $$('[data-open]', m).forEach(b => b.onclick = () => planSheet(planById(b.dataset.open)));
  $$('[data-up]', m).forEach(b => b.onclick = async () => { const i = +b.dataset.up, a = S.plans[i - 1], c = S.plans[i]; [a.ordre, c.ordre] = [i, i - 1]; await save('plans', a); await save('plans', c); S.plans.sort((x, y) => x.ordre - y.ordre); tabPlans(m); });
  $$('[data-del]', m).forEach(b => b.onclick = async () => { const p = planById(b.dataset.del), n = S.photos.filter(x => x.planId === p.id).length + S.reserves.filter(x => x.planId === p.id).length; if (!confirm(`Supprimer le plan « ${p.nom} » ?${n ? ` ${n} photo(s) ou réserve(s) y sont placées : elles resteront, sans localisation.` : ''}`)) return;
    for (const x of S.photos.filter(x => x.planId === p.id)) { x.planId = null; await save('photos', x); } for (const x of S.reserves.filter(x => x.planId === p.id)) { x.planId = null; await save('reserves', x); } p.deleted = true; await save('plans', p); tabPlans(m); });
}
async function importPlan(file, m) {
  const pg = $('#pdfProg', m); pg.innerHTML = '<div class="hint">Lecture du plan…</div><div class="prog"><i></i></div>';
  try {
    let pages;
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) pages = await pdfToImages(file, (p, n) => { pg.innerHTML = `<div class="hint">Page ${p} sur ${n}…</div><div class="prog"><i style="width:${Math.round(p / n * 100)}%"></i></div>`; });
    else { const im = await shrinkImage(file, 4000, .88); pages = [{ page: 1, w: im.w, h: im.h, blob: im.blob, thumb: im.thumb }]; }
    const base = file.name.replace(/\.[^.]+$/, ''); let ordre = S.plans.length;
    for (const pgx of pages) { const blobId = await DB.putBlob(pgx.blob), thumbId = await DB.putBlob(pgx.thumb); await save('plans', { id: DB.uid(), chantierId: S.ch.id, nom: pages.length > 1 ? `${base} p.${pgx.page}` : base, ordre: ordre++, w: pgx.w, h: pgx.h, blobId, thumbId, source: file.name + (pages.length > 1 ? ' p. ' + pgx.page : '') }); }
    S.plans.sort((a, b) => a.ordre - b.ordre); toast(`${pages.length} niveau(x) importé(s) : renommez-les si besoin`); tabPlans(m);
  } catch (e) { console.error(e); pg.innerHTML = `<div class="hint" style="color:var(--warn)">Plan illisible : ${esc(e.message)}</div>`; }
}
async function planSheet(plan, { reserves } = {}) {
  let show = { ph: !reserves, res: true };
  const sh = sheet(plan.nom, `<div class="levels"><button class="chip${show.ph ? ' on' : ''}" data-s="ph">Photos</button><button class="chip on" data-s="res">Réserves</button></div><div id="psPv" style="height:min(72vh,760px)"></div>`, '', { wide: true });
  const pv = new PlanView($('#psPv', sh.el), { onMarker: mk => { if (mk.photo) photoSheet(mk.photo); else if (mk.res) { sh.close(); location.hash = `#/c/${S.ch.id}/r/${mk.res.id}`; } } });
  await pv.load(plan);
  const draw = () => pv.setMarkers([...(show.ph ? S.photos.filter(p => p.planId === plan.id).map(p => ({ x: p.x, y: p.y, dir: p.dir, kind: '', label: '', title: p.legende || fmtD(p.date), photo: p })) : []),
    ...(show.res ? (reserves || S.reserves).filter(r => r.planId === plan.id).map(r => ({ x: r.x, y: r.y, kind: r.statut === 'levee' ? 'done' : 'res', label: r.numero, title: r.description, res: r })) : [])]);
  draw(); $$('[data-s]', sh.el).forEach(b => b.onclick = () => { show[b.dataset.s] = !show[b.dataset.s]; b.classList.toggle('on', show[b.dataset.s]); draw(); });
}

/* ---------- Lots et entreprises ---------- */
function tabFiche(m) {
  const c = S.ch; c.lots = c.lots || []; c.entreprises = c.entreprises || [];
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">${esc(c.nom)}</h2><button class="btn" id="bEdC">Modifier le chantier</button></div>
    <div class="card small muted" style="margin-bottom:14px">${esc([c.adresse, c.moa && 'MOA : ' + c.moa, c.moe && 'MOE : ' + c.moe].filter(Boolean).join(' · ')) || 'Ajoutez l\'adresse et le maître d\'ouvrage.'}</div>
    <div class="bar"><h3 class="grow" style="font-size:16px">Entreprises</h3><button class="btn" id="bAddE">+ Entreprise</button></div>
    <div class="card" style="padding:0 8px;margin-bottom:16px">${c.entreprises.length ? `<table class="t"><thead><tr><th>Entreprise</th><th>Contact</th><th>Téléphone</th><th>E-mail</th><th></th></tr></thead><tbody>${c.entreprises.map(e => `<tr data-e="${e.id}"><td><input type="text" data-f="nom" value="${esc(e.nom)}"></td><td><input type="text" data-f="contact" value="${esc(e.contact)}"></td><td><input type="tel" data-f="tel" value="${esc(e.tel)}"></td><td><input type="email" data-f="email" value="${esc(e.email)}"></td><td><button class="btn sm danger" data-rm aria-label="Retirer">×</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:16px">Aucune entreprise.</div>'}</div>
    <div class="bar"><h3 class="grow" style="font-size:16px">Lots</h3>${c.lots.length ? '' : '<button class="btn" id="bTpl">Liste habituelle</button>'}<button class="btn" id="bAddL">+ Lot</button></div>
    <div class="card" style="padding:0 8px">${c.lots.length ? `<table class="t"><thead><tr><th style="width:70px">N°</th><th>Intitulé</th><th>Entreprise</th><th></th></tr></thead><tbody>${c.lots.slice().sort((a, b) => a.code.localeCompare(b.code)).map(l => `<tr data-l="${l.id}"><td><input type="text" data-f="code" value="${esc(l.code)}"></td><td><input type="text" data-f="nom" value="${esc(l.nom)}"></td><td><select data-f="entrepriseId"><option value="">—</option>${c.entreprises.map(e => `<option value="${e.id}"${l.entrepriseId === e.id ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></td><td><button class="btn sm danger" data-rm aria-label="Retirer">×</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:16px">Aucun lot.</div>'}</div>`;
  const persist = () => save('chantiers', c);
  $('#bEdC').onclick = () => editChantier(c);
  $('#bAddE').onclick = async () => { c.entreprises.push({ id: DB.uid(), nom: 'Nouvelle entreprise', contact: '', tel: '', email: '' }); await persist(); tabFiche(m); $$('[data-e] input', m).slice(-4)[0].select(); };
  $('#bAddL').onclick = async () => { const n = c.lots.reduce((mx, l) => Math.max(mx, parseInt(l.code) || 0), 0) + 1; c.lots.push({ id: DB.uid(), code: String(n).padStart(2, '0'), nom: 'Nouveau lot', entrepriseId: '' }); await persist(); tabFiche(m); };
  if ($('#bTpl')) $('#bTpl').onclick = async () => { c.lots = DEFAULT_LOTS.map(([code, nom]) => ({ id: DB.uid(), code, nom, entrepriseId: '' })); await persist(); tabFiche(m); };
  $$('[data-e]', m).forEach(tr => { const e = c.entreprises.find(x => x.id === tr.dataset.e); tr.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { e[i.dataset.f] = i.value.trim(); persist(); }); tr.querySelector('[data-rm]').onclick = async () => { if (!confirm(`Retirer ${e.nom} ?`)) return; c.entreprises = c.entreprises.filter(x => x !== e); for (const l of c.lots) if (l.entrepriseId === e.id) l.entrepriseId = ''; await persist(); tabFiche(m); }; });
  $$('[data-l]', m).forEach(tr => { const l = c.lots.find(x => x.id === tr.dataset.l); tr.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { l[i.dataset.f] = i.value.trim(); persist(); }); tr.querySelector('[data-rm]').onclick = async () => { if (!confirm(`Retirer le lot ${l.code} ${l.nom} ?`)) return; c.lots = c.lots.filter(x => x !== l); await persist(); tabFiche(m); }; });
}

/* ================= Réglages ================= */
async function settingsSheet() {
  const cfg = await Sync.config(), est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const sh = sheet('Réglages', `<label class="f">Votre nom (rédacteur des comptes-rendus)<input type="text" id="sAut" value="${esc(S.auteur)}"></label>
    <div class="card"><b>Synchronisation entre appareils</b><div class="hint" style="margin:4px 0 8px">Téléphone, tablette et PC partagent les mêmes chantiers, plans et photos.</div>${Sync.formHTML(cfg)}</div>
    <div class="card"><b>Sauvegarde</b><div class="hint" style="margin:4px 0 8px">Fichier de sauvegarde complet de cet appareil (chantiers, plans, photos).${est ? ` Espace utilisé : ${(est.usage / 1048576).toFixed(0)} Mo.` : ''}</div><div class="row" style="flex-wrap:wrap"><button class="btn" id="sExp">Enregistrer une sauvegarde</button><button class="btn" id="sImp">Restaurer une sauvegarde</button></div></div>
    <div class="small muted">TerraChantier ${APP_VERSION} bêta · TERRAFORM</div>`, `<button class="btn pri" data-close>Fermer</button>`);
  $('#sAut', sh.el).onchange = e => { S.auteur = e.target.value.trim(); DB.meta('auteur', S.auteur); };
  Sync.bindForm(sh.el);
  $('#sExp', sh.el).onclick = () => backupExport();
  $('#sImp', sh.el).onclick = () => { const inp = $('#jsonIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; try { const n = await backupImport(inp.files[0]); toast(`${n} fiche(s) restaurée(s)`); sh.close(); S._fresh = false; render(); } catch (e) { toast('Sauvegarde illisible : ' + e.message, 4000); } }; inp.click(); };
}
async function backupExport() {
  const data = { app: 'TerraChantier', version: APP_VERSION, date: new Date().toISOString(), stores: {}, blobs: {} };
  for (const s of DB.STORES) data.stores[s] = await DB.all(s, null, { withDeleted: true });
  for (const id of await DB.allBlobIds()) { const b = await DB.getBlob(id); data.blobs[id] = { type: b.type, data: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }) }; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = `TerraChantier - sauvegarde ${today()}.json`; a.click();
}
async function backupImport(file) {
  const d = JSON.parse(await file.text()); if (d.app !== 'TerraChantier') throw new Error('ce n\'est pas une sauvegarde TerraChantier'); let n = 0;
  for (const [id, b] of Object.entries(d.blobs || {})) { const bin = atob(b.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await DB.putBlob(new Blob([u], { type: b.type }), id); }
  for (const s of DB.STORES) for (const o of d.stores[s] || []) { const cur = await DB.get(s, o.id); if (!cur || (o.updatedAt || '') > (cur.updatedAt || '')) { await DB.put(s, o); n++; } }
  return n;
}

/* ================= Démarrage ================= */
(async function init() {
  S.auteur = (await DB.meta('auteur')) || ''; S.lastPlan = await DB.meta('lastPlan');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const had = !!navigator.serviceWorker.controller; let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } }); // nouvelle version installée : rechargement
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(e => console.warn('SW', e));
  }
  await render(); Sync.start();
})();
