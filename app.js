/* TerraChantier : comptes-rendus de chantier, OPR et photos localisées sur plan */
const APP_VERSION = '0.5.1';
/* outils communs ($, esc, dates, ICON, ROLES, sheet, toast…) : common.js ; carnet de contacts : carnet.js */
const intervenants = () => ((S.ch && S.ch.entreprises) || []).map(e => (e.role ? e : Object.assign(e, { role: 'ENT' }))).slice().sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.nom || '').localeCompare(b.nom || ''));
/* mode terrain (téléphone) : prise de vues, CR, réserves ; la préparation (chantiers, plans, intervenants, lots) se fait dans la version complète */
const isField = () => S.mode === 'terrain' || (S.mode !== 'complet' && matchMedia('(max-width: 700px)').matches);
const OBS_ST = { afaire: 'En cours', fait: 'Réglée', info: 'Pour information' };
const RES_ST = { ouverte: 'Ouverte', levee: 'Levée', refusee: 'Contestée' };
const PHASES = { chantier: 'En cours de chantier', OPR: 'OPR', reception: 'Réception', GPA: 'Parfait achèvement' };

const S = { mode: 'auto', ch: null, plans: [], photos: [], visites: [], reserves: [], auteur: '', lastPlan: null };
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!location.hash || location.hash === '#/') render(); });

const lotsOf = () => (S.ch && S.ch.lots) || [];
const lotById = id => lotsOf().find(l => l.id === id);
const entById = id => ((S.ch && S.ch.entreprises) || []).find(e => e.id === id);
const lotLabel = id => { const l = lotById(id); return l ? `${l.code} ${l.nom}` : 'Sans lot'; };
const lotOptions = (sel, blank = 'Sans lot') => `<option value="">${blank}</option>` + lotsOf().slice().sort((a, b) => a.code.localeCompare(b.code)).map(l => `<option value="${l.id}"${l.id === sel ? ' selected' : ''}>${esc(l.code)} ${esc(l.nom)}${l.entrepriseId && entById(l.entrepriseId) ? ' · ' + esc(entById(l.entrepriseId).nom) : ''}</option>`).join('');
const planById = id => S.plans.find(p => p.id === id);
const photoById = id => S.photos.find(p => p.id === id);
/* photo : texte, localisation (pièce ou repère, plus le niveau du plan), destinataire(s) parmi les intervenants, émetteur (par défaut l'architecte du chantier) */
const phTxt = p => (p.texte ?? p.legende) || '';
const phLoc = p => { const pl = planById(p.planId), l = (p.localisation || '').trim(); return [l, pl && !norm(l).includes(norm(pl.nom)) ? pl.nom : ''].filter(Boolean).join(' · '); };
const entLabel = e => e ? e.nom + (e.contact ? ' (' + e.contact + ')' : '') : '';
const emetteurOf = o => entById(o && o.emetteurId) || entById(S.ch && S.ch.emetteurId) || intervenants().find(e => e.role === 'MOE') || null;
const phDest = p => (p.destinataires || []).map(entById).filter(Boolean);
const phTodo = p => !phTxt(p).trim() || !phDest(p).length;
const lotEnt = lotId => { const l = lotById(lotId); return l && l.entrepriseId && entById(l.entrepriseId) ? l.entrepriseId : ''; };
const locList = () => [...new Set([...S.photos.map(p => p.localisation), ...S.reserves.map(r => r.localisation)].filter(Boolean).map(s => s.trim()))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

async function loadChantier(id) {
  if (S.ch && S.ch.id === id && S._fresh) return;
  S.ch = await DB.get('chantiers', id); if (!S.ch || S.ch.deleted) { S.ch = null; return; }
  [S.plans, S.photos, S.visites, S.reserves] = await Promise.all(['plans', 'photos', 'visites', 'reserves'].map(s => DB.all(s, id)));
  S.plans.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); S.photos.sort((a, b) => (b.date || '').localeCompare(a.date || '')); S.visites.sort((a, b) => b.numero - a.numero); S.reserves.sort((a, b) => a.numero - b.numero);
  if (Carnet.refreshChantier(S.ch)) await save('chantiers', S.ch);
  await numberQuestions(); // CR antérieurs à la 0.4 : questions numérotées
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
    ${!isField() && !Carnet.agence() ? `<div class="install"><div class="grow"><b>Renseignez votre agence</b><div class="small muted">Nom, coordonnées, logo et architecte par défaut : ils signent les comptes-rendus et les photos. À faire une fois dans TerraContacts.</div></div><a class="btn pri" href="contacts.html#/agence">Mon agence</a></div>` : ''}
    <div class="bar"><h2 class="grow" style="font-size:20px">Chantiers</h2><a class="btn" href="contacts.html">Contacts</a>${isField() ? '' : '<button class="btn pri" id="bNew">+ Nouveau chantier</button>'}</div>
    ${isField() ? `<div class="hint" style="margin-bottom:10px">Mode terrain : les chantiers, plans et intervenants se préparent dans la version complète (PC ou tablette) et arrivent ici par la synchronisation.${list.length ? '' : ' <a href="#" id="lSet">Régler la synchronisation</a>'}</div>` : ''}
    <div class="list">${list.map(c => `<a class="card ch" href="#/c/${c.id}"><span class="ico">${esc((c.code || c.nom || '?').slice(0, 3).toUpperCase())}</span><span class="grow"><b>${esc(c.nom)}</b><div class="small muted">${esc([c.adresse, c.moa].filter(Boolean).join(' · '))}</div></span></a>`).join('') || (isField() ? '<div class="empty"><b>Aucun chantier sur ce téléphone</b>Créez le chantier sur le PC, puis connectez les deux appareils à la synchronisation (Réglages).</div>' : '<div class="empty"><b>Aucun chantier</b>Créez votre premier chantier, puis importez ses plans de niveaux.</div>')}</div></main>`;
  bindTop(app);
  if ($('#bNew')) $('#bNew').onclick = () => editChantier(null); if ($('#lSet')) $('#lSet').onclick = e => { e.preventDefault(); settingsSheet(); };
  if ($('#bInst')) $('#bInst').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); };
}
function editChantier(c) {
  const isNew = !c, ag = Carnet.agence(); c = c || { nom: '', code: '', adresse: '', moa: '', moe: ag ? ag.nom : '', lots: [], entreprises: [] };
  let moaPick = null; // maître d'ouvrage choisi dans le carnet
  const sh = sheet(isNew ? 'Nouveau chantier' : 'Chantier', `<div class="grid2">
    <label class="f">Nom de l'opération<input type="text" id="cNom" value="${esc(c.nom)}" placeholder="Réhabilitation de…"></label>
    <label class="f">Code court<input type="text" id="cCode" value="${esc(c.code)}" maxlength="6" placeholder="CTN"></label>
    <label class="f">Adresse<input type="text" id="cAdr" value="${esc(c.adresse)}"></label>
    <label class="f">Maître d'ouvrage<span class="row" style="gap:6px"><input type="text" id="cMoa" value="${esc(c.moa)}">${isNew ? '<button type="button" class="btn sm" id="cMoaK">Carnet</button>' : ''}</span></label>
    <label class="f">Maître d'œuvre<input type="text" id="cMoe" value="${esc(c.moe)}"></label></div>
    ${isNew && ag ? `<div class="hint">Émetteur des comptes-rendus et des photos : ${esc(ag.nom)}${Carnet.architecte() ? ', ' + esc(Carnet.fullName(Carnet.architecte())) : ''} (modifiable dans « Intervenants et lots »).</div>` : ''}
    ${isNew ? '<label class="row small"><input type="checkbox" id="cLots" checked> Créer la liste de lots habituelle (modifiable ensuite)</label>' : ''}`,
    `${!isNew ? '<button class="btn danger" id="cDel">Supprimer</button><span class="grow"></span>' : ''}<button class="btn" data-close>Annuler</button><button class="btn pri" id="cOk">Enregistrer</button>`);
  $('#cNom', sh.el).focus();
  if ($('#cMoaK', sh.el)) $('#cMoaK', sh.el).onclick = async () => { const k = await Carnet.pick({ role: 'MOA', title: "Maître d'ouvrage" }); if (k) { moaPick = k; $('#cMoa', sh.el).value = k.c.nom; } };
  $('#cOk', sh.el).onclick = async () => {
    const nom = $('#cNom', sh.el).value.trim(); if (!nom) return toast('Donnez un nom au chantier');
    Object.assign(c, { nom, code: $('#cCode', sh.el).value.trim(), adresse: $('#cAdr', sh.el).value.trim(), moa: $('#cMoa', sh.el).value.trim(), moe: $('#cMoe', sh.el).value.trim() });
    if (isNew) {
      c.id = DB.uid(); c.chantierId = c.id;
      const moa = !c.moa ? null : moaPick && moaPick.c.nom === c.moa ? Carnet.asIntervenant(moaPick.c, moaPick.pid, { id: DB.uid(), role: 'MOA', convoque: true }) : { id: DB.uid(), role: 'MOA', nom: c.moa, contact: '', fonction: '', tel: '', email: '', convoque: true };
      const moe = !c.moe ? null : ag && norm(ag.nom) === norm(c.moe) ? Carnet.asIntervenant(ag, '', { id: DB.uid(), role: 'MOE', convoque: true }) : { id: DB.uid(), role: 'MOE', nom: c.moe, contact: S.auteur, fonction: '', tel: '', email: '', convoque: true };
      c.entreprises = [moa, moe].filter(Boolean); c.emetteurId = moe ? moe.id : '';
      if ($('#cLots', sh.el).checked) c.lots = DEFAULT_LOTS.map(([code, nom]) => ({ id: DB.uid(), code, nom, entrepriseId: '' }));
    }
    await save('chantiers', c); sh.close(); if (isNew) location.hash = `#/c/${c.id}/plans`; else render();
  };
  if ($('#cDel', sh.el)) $('#cDel', sh.el).onclick = async () => { if (!confirm(`Supprimer le chantier « ${c.nom} » et toutes ses données sur cet appareil ?`)) return; c.deleted = true; await save('chantiers', c); sh.close(); location.hash = '#/'; };
}

/* ================= Chantier ================= */
function viewChantier(app, tab) {
  const c = S.ch, nP = S.photos.filter(p => !p.planId || phTodo(p)).length, nR = S.reserves.filter(r => r.statut === 'ouverte').length;
  app.innerHTML = topBar(esc(c.nom), [c.adresse, c.moa].filter(Boolean).join(' · '), { back: '#/' }) +
    `<nav class="tabs">${[['photos', 'Photos' + (nP ? ` (${nP} à compléter)` : '')], ['visites', 'Comptes-rendus'], ['reserves', 'Réserves' + (nR ? ` (${nR})` : '')], ['plans', 'Plans'], ['fiche', isField() ? 'Intervenants' : 'Intervenants et lots']].map(([k, t]) => `<a href="#/c/${c.id}/${k}" class="${k === tab ? 'on' : ''}">${t}</a>`).join('')}</nav><main id="main"></main>
    <button class="fab" id="fab" aria-label="Prendre une photo">${ICON.cam}</button>`;
  bindTop(app); $('#fab').onclick = () => takePhoto({});
  const m = $('#main');
  ({ photos: tabPhotos, visites: tabVisites, reserves: tabReserves, plans: tabPlans, fiche: tabFiche }[tab] || tabPhotos)(m);
}

/* ---------- Photos ---------- */
async function thumbsHTML(list, { sel, pick } = {}) {
  const urls = await Promise.all(list.map(p => BlobURL(p.thumbId || p.blobId)));
  return list.map((p, i) => { const tag = phTodo(p) ? '<span class="tag warn">à compléter</span>' : !p.planId ? '<span class="tag warn">à localiser</span>' : `<span class="tag">${esc(phLoc(p))}</span>`;
    return `<button type="button" class="th${sel && sel.has(p.id) ? ' sel' : ''}" data-ph="${p.id}" title="${esc([phLoc(p), phTxt(p), phDest(p).length ? 'À : ' + phDest(p).map(e => e.nom).join(', ') : ''].filter(Boolean).join('\n'))}"><img src="${urls[i]}" alt="${esc(phTxt(p) || 'Photo')}" loading="lazy">${tag}${pick ? `<span class="ck">${sel && sel.has(p.id) ? '✓' : ''}</span>` : ''}</button>`; }).join('');
}
async function tabPhotos(m) {
  const flt = S._phF || 'all', dst = S._phD || '', todo = p => phTodo(p) || !p.planId;
  const list = S.photos.filter(p => (flt === 'all' || (flt === 'todo' ? todo(p) : p.planId === flt)) && (!dst || (p.destinataires || []).includes(dst)));
  const byDay = new Map(); for (const p of list) { const d = dayOf(p.date); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(p); }
  const dests = intervenants().filter(e => S.photos.some(p => (p.destinataires || []).includes(e.id)));
  m.innerHTML = `<div class="bar"><button class="btn pri" id="bCam">${ICON.cam.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2"')} Prendre une photo</button><button class="btn" id="bGal">Importer des photos</button><span class="grow"></span><button class="btn" id="bPhPdf"${list.length ? '' : ' disabled'}>PDF par destinataire</button></div>
    <div class="levels bar"><button class="chip${flt === 'all' ? ' on' : ''}" data-f="all">Toutes (${S.photos.length})</button><button class="chip${flt === 'todo' ? ' on' : ''}" data-f="todo">À compléter (${S.photos.filter(todo).length})</button>${S.plans.map(p => `<button class="chip${flt === p.id ? ' on' : ''}" data-f="${p.id}">${esc(p.nom)}</button>`).join('')}</div>
    ${dests.length ? `<div class="bar"><select id="fDst" style="width:auto;max-width:320px"><option value="">Tous les destinataires</option>${dests.map(e => `<option value="${e.id}"${dst === e.id ? ' selected' : ''}>${esc(entLabel(e))}</option>`).join('')}</select><span class="small muted">${list.length} photo(s)</span></div>` : ''}
    <div id="days">${list.length ? '' : '<div class="empty"><b>Aucune photo</b>Le bouton appareil photo, en bas à droite, prend une photo : texte, localisation, destinataire, puis place sur le plan du niveau.</div>'}</div>`;
  $('#bCam').onclick = () => takePhoto({}); $('#bGal').onclick = () => importPhotos(); $('#bPhPdf').onclick = () => exportPhotos(list);
  $$('[data-f]', m).forEach(b => b.onclick = () => { S._phF = b.dataset.f; tabPhotos(m); });
  if ($('#fDst', m)) $('#fDst', m).onchange = e => { S._phD = e.target.value; tabPhotos(m); };
  let h = ''; for (const [d, ps] of byDay) h += `<div class="day">${fmtDL(d)} · ${ps.length}</div><div class="thumbs">${await thumbsHTML(ps)}</div>`;
  if (list.length) $('#days', m).innerHTML = h;
  $$('[data-ph]', m).forEach(b => b.onclick = () => photoSheet(photoById(b.dataset.ph)));
}
/* prise de vue : appareil photo du téléphone, puis texte, destinataire et localisation */
function takePhoto(ctx) { const inp = $('#camIn'); inp.value = ''; inp.onchange = () => { if (inp.files[0]) processFiles([...inp.files], ctx); }; inp.click(); }
function importPhotos(ctx = {}) { const inp = $('#galIn'); inp.value = ''; inp.onchange = () => { if (inp.files.length) processFiles([...inp.files], { ...ctx, bulk: inp.files.length > 1 }); }; inp.click(); }
const defaultDest = lotId => lotEnt(lotId) ? [lotEnt(lotId)] : (S.lastDest || []).filter(id => entById(id));
async function processFiles(files, ctx) {
  const made = [];
  for (const [i, f] of files.entries()) {
    if (files.length > 1) toast(`Photo ${i + 1} sur ${files.length}…`, 1200);
    const [ex, im] = await Promise.all([readExif(f), shrinkImage(f)]);
    const blobId = await DB.putBlob(im.blob), thumbId = await DB.putBlob(im.thumb);
    const p = { id: DB.uid(), chantierId: S.ch.id, blobId, thumbId, w: im.w, h: im.h, date: ex.date || (ctx.bulk ? new Date(f.lastModified).toISOString() : new Date().toISOString()), gps: ex.lat ? { lat: ex.lat, lon: ex.lon, alt: ex.alt } : null, compass: ex.dir ?? null,
      texte: ctx.texte || '', localisation: ctx.localisation || '', lotId: ctx.lotId || '', destinataires: ctx.destinataires ? [...ctx.destinataires] : (ctx.bulk ? [] : defaultDest(ctx.lotId)), emetteurId: (emetteurOf() || {}).id || '', planId: null, x: null, y: null, dir: null, auteur: S.auteur };
    await save('photos', p); made.push(p);
  }
  if (ctx.bulk) { toast(`${made.length} photo(s) importée(s), datées d'après l'appareil. Complétez-les depuis l'onglet Photos (« À compléter »).`, 4500); render(); return made; }
  for (const p of made) await locateSheet(p, ctx);
  return made;
}
/* champs d'une photo : texte, localisation, lot, destinataire(s), émetteur */
function phFieldsHTML(p) {
  const L = intervenants(), em = emetteurOf(p);
  return `<label class="f">Texte<textarea id="fTx" rows="3" placeholder="Constat, demande, consigne à transmettre…">${esc(phTxt(p))}</textarea></label>
    <div class="grid2"><label class="f">Localisation (pièce, repère)<input type="text" id="fLoc" list="dlLoc" value="${esc(p.localisation || '')}" placeholder="Chambre 3" autocomplete="off"></label><label class="f">Lot<select id="fLot">${lotOptions(p.lotId)}</select></label></div>
    <datalist id="dlLoc">${locList().map(l => `<option value="${esc(l)}">`).join('')}</datalist>
    <div class="f"><span>Destinataire${(p.destinataires || []).length > 1 ? 's' : '(s)'}</span><div class="levels wrap" id="fDest">${L.filter(e => !em || e.id !== em.id).map(e => `<button type="button" class="chip${(p.destinataires || []).includes(e.id) ? ' on' : ''}" data-dst="${e.id}" title="${esc(roleName(e.role) + (e.contact ? ' · ' + e.contact : ''))}">${esc(e.nom || '?')}${e.role !== 'ENT' ? ` <small>${esc(e.role)}</small>` : ''}</button>`).join('')}<button type="button" class="chip" id="fDstK">+ Carnet</button></div></div>
    <label class="row small muted" style="gap:6px">De :<select id="fEm" style="width:auto;max-width:100%">${L.map(e => `<option value="${e.id}"${em && em.id === e.id ? ' selected' : ''}>${esc(entLabel(e))}</option>`).join('')}${em ? '' : '<option value="" selected>(émetteur à choisir)</option>'}</select></label>`;
}
function bindPhFields(el, p) {
  let dest = [...(p.destinataires || [])], touched = dest.length > 0;
  const paint = () => $$('[data-dst]', el).forEach(b => b.classList.toggle('on', dest.includes(b.dataset.dst)));
  const bindChips = () => $$('[data-dst]', el).forEach(b => b.onclick = () => { const id = b.dataset.dst; dest = dest.includes(id) ? dest.filter(x => x !== id) : [...dest, id]; touched = true; $('#fDest', el).classList.remove('need'); paint(); });
  bindChips();
  $('#fLot', el).onchange = () => { if (!touched) { dest = defaultDest($('#fLot', el).value); paint(); } };
  $('#fDstK', el).onclick = async () => { const k = await Carnet.pick({ title: 'Destinataire' }); if (!k) return; let e = intervenants().find(x => x.contactId === k.c.id && (!k.pid || x.personneId === k.pid));
    if (!e) { e = Carnet.asIntervenant(k.c, k.pid, { id: DB.uid(), convoque: false }); S.ch.entreprises.push(e); await save('chantiers', S.ch); $('#fDstK', el).insertAdjacentHTML('beforebegin', `<button type="button" class="chip" data-dst="${e.id}">${esc(e.nom)}</button>`); bindChips(); }
    if (!dest.includes(e.id)) dest.push(e.id); touched = true; paint(); };
  /* recopie les champs ; rend false si l'utilisateur préfère compléter tout de suite */
  return ({ force } = {}) => {
    const texte = $('#fTx', el).value.trim();
    if (!force && (!texte || !dest.length)) { if (!dest.length) $('#fDest', el).classList.add('need'); if (!confirm(`${!texte && !dest.length ? 'Texte et destinataire manquants' : !texte ? 'Texte manquant' : 'Destinataire manquant'}. Enregistrer quand même ? La photo restera « à compléter ».`)) return false; }
    Object.assign(p, { texte, legende: texte.split('\n')[0].slice(0, 120), localisation: $('#fLoc', el).value.trim(), lotId: $('#fLot', el).value, destinataires: dest, emetteurId: $('#fEm', el).value });
    if (dest.length && !lotEnt(p.lotId)) S.lastDest = dest;
    return true;
  };
}
/* fenêtre de prise de vue : texte, destinataire, localisation, puis repère sur le plan du niveau (et point visé, facultatif) */
function locateSheet(p, ctx = {}) {
  return new Promise(async res => {
    const url = await BlobURL(p.thumbId || p.blobId); let plan = planById(p.planId) || planById(S.lastPlan) || S.plans[0], pt = p.planId ? { x: p.x, y: p.y, dir: p.dir } : null, aimNext = false;
    const fixedType = ctx.forObs || ctx.forReserve;
    const sh = sheet(fixedType ? 'Photo' : 'Nouvelle photo', `
      <div class="row" style="align-items:flex-start"><img src="${url}" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;flex:none"><div class="grow" style="display:flex;flex-direction:column;gap:8px">${phFieldsHTML(p)}</div></div>
      ${fixedType ? '' : `<div class="levels" id="lType">${[['photo', 'Photo seule'], ['obs', 'Question du CR du jour'], ['res', 'Réserve']].map(([k, t]) => `<button type="button" class="chip${(ctx.type || 'photo') === k ? ' on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>`}
      ${S.plans.length ? `<div class="f"><span>Niveau</span><div class="levels" id="lLev">${S.plans.map(pl => `<button type="button" class="chip${plan && pl.id === plan.id ? ' on' : ''}" data-l="${pl.id}">${esc(pl.nom)}</button>`).join('')}</div></div>
      <div class="hint" id="lHint">Touchez l'emplacement de la photo sur le plan, puis le point visé pour indiquer la direction (facultatif).</div><div id="lPv" style="height:min(58vh,560px)"></div>`
      : `<div class="hint">Aucun plan importé : indiquez le niveau dans la localisation (par exemple « Chambre 3, R+2 »).</div>`}`,
      `${S.plans.length ? '<button class="btn" id="lNo">Sans repère sur plan</button>' : ''}<span class="grow"></span>${fixedType ? '' : '<button class="btn" id="lNext">Enregistrer, photo suivante</button>'}<button class="btn pri" id="lOk">Enregistrer</button>`, { wide: true });
    const collect = bindPhFields(sh.el, p); $('#fTx', sh.el).focus();
    let type = ctx.type || 'photo';
    $$('[data-t]', sh.el).forEach(b => b.onclick = () => { type = b.dataset.t; $$('[data-t]', sh.el).forEach(x => x.classList.toggle('on', x === b)); });
    let pv = null; const marks = () => { if (!pv) return; const other = S.photos.filter(q => q.planId === plan.id && q.id !== p.id).map(q => ({ x: q.x, y: q.y, kind: '', label: '', title: phTxt(q) }));
      pv.setMarkers([...other, ...(pt ? [{ x: pt.x, y: pt.y, dir: pt.dir, kind: 'new', label: '' }] : [])]); };
    if (S.plans.length) {
      pv = new PlanView($('#lPv', sh.el), { onTap: (x, y) => {
        if (pt && aimNext) { const dx = (x - pt.x) * plan.w, dy = (y - pt.y) * plan.h; if (Math.hypot(dx, dy) > 8 / pv.s) { pt.dir = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; aimNext = false; $('#lHint', sh.el).textContent = 'Direction notée. Touchez ailleurs pour déplacer le repère.'; marks(); return; } }
        pt = { x, y, dir: null }; aimNext = true; $('#lHint', sh.el).textContent = 'Repère placé. Touchez le point visé pour la direction, ou enregistrez.'; marks(); } });
      await pv.load(plan); if (pt) pv.center(pt.x, pt.y, Math.max(pv.s, .35)); marks();
      $$('[data-l]', sh.el).forEach(b => b.onclick = async () => { plan = planById(b.dataset.l); if (pt && p.planId !== plan.id) pt = null; $$('[data-l]', sh.el).forEach(x => x.classList.toggle('on', x === b)); await pv.load(plan); marks(); });
    }
    let saved = false;
    const done = async (next, noLoc) => {
      if (!collect()) return;
      if (!noLoc && pt && plan) { p.planId = plan.id; p.x = pt.x; p.y = pt.y; p.dir = pt.dir; S.lastPlan = plan.id; DB.meta('lastPlan', plan.id); } else if (noLoc) { p.planId = null; p.x = p.y = p.dir = null; }
      await save('photos', p); saved = true;
      if (!fixedType && type === 'obs') await addObsFromPhoto(p);
      if (!fixedType && type === 'res') await addReserveFromPhoto(p);
      sh.close(); res(p);
      if (next) takePhoto({ ...ctx, type, lotId: p.lotId, destinataires: p.destinataires, localisation: '' }); else if (!ctx.silent) render();
    };
    $('#lOk', sh.el).onclick = () => done(false); if ($('#lNext', sh.el)) $('#lNext', sh.el).onclick = () => done(true); if ($('#lNo', sh.el)) $('#lNo', sh.el).onclick = () => done(false, true);
    sh.bg.addEventListener('closed', () => { if (!saved && !ctx.silent) render(); res(p); });
  });
}
async function photoSheet(p) {
  const url = await BlobURL(p.blobId), plan = planById(p.planId), uses = [...S.visites.flatMap(v => (v.observations || []).filter(o => (o.photoIds || []).includes(p.id)).map(o => `${crName(v.numero)}, ${lotLabel(o.lotId)}`)), ...S.reserves.filter(r => (r.photoIds || []).includes(p.id)).map(r => `Réserve n° ${r.numero}`)];
  const sh = sheet('Photo du ' + fmtD(p.date) + ' à ' + fmtT(p.date), `<img class="photo-big" src="${url}" alt="${esc(phTxt(p))}">${phFieldsHTML(p)}
    <div class="small muted">${plan ? 'Repère sur le plan : ' + esc(plan.nom) : 'Pas de repère sur un plan'}${p.gps ? ` · GPS ${p.gps.lat.toFixed(5)}, ${p.gps.lon.toFixed(5)}` : ''}${p.envoyeLe ? ' · transmise le ' + fmtD(p.envoyeLe) : ''}${uses.length ? '<br>Utilisée dans : ' + esc(uses.join(' ; ')) : ''}</div>`,
    `<button class="btn danger" id="pDel">Supprimer</button><span class="grow"></span><button class="btn" id="pShare">${ICON.share.replace('<svg', '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2"')} Transmettre</button><button class="btn" id="pLoc">${plan ? 'Déplacer sur le plan' : 'Placer sur le plan'}</button><button class="btn" id="pRes">Créer une réserve</button><button class="btn pri" id="pOk">Enregistrer</button>`);
  const collect = bindPhFields(sh.el, p);
  const keep = async force => { if (!collect({ force })) return false; await save('photos', p); return true; };
  $('#pOk', sh.el).onclick = async () => { if (await keep()) { sh.close(); render(); } };
  $('#pShare', sh.el).onclick = async () => { if (!(await keep())) return; await sharePhoto(p); };
  $('#pLoc', sh.el).onclick = async () => { if (!(await keep(true))) return; sh.close(); await locateSheet(p, { forObs: true }); };
  $('#pRes', sh.el).onclick = async () => { if (!(await keep(true))) return; sh.close(); const r = await addReserveFromPhoto(p); location.hash = `#/c/${S.ch.id}/r/${r.id}`; };
  $('#pDel', sh.el).onclick = async () => { if (!confirm('Supprimer cette photo ?')) return; for (const v of S.visites) { let ch = false; for (const o of v.observations || []) if ((o.photoIds || []).includes(p.id)) { o.photoIds = o.photoIds.filter(x => x !== p.id); ch = true; } if (ch) await save('visites', v); }
    for (const r of S.reserves) if ((r.photoIds || []).includes(p.id)) { r.photoIds = r.photoIds.filter(x => x !== p.id); await save('reserves', r); } p.deleted = true; await save('photos', p); sh.close(); render(); };
}
/* transmission d'une photo à ses destinataires : partage du téléphone (messagerie, WhatsApp…) avec la photo, sinon message préparé */
async function sharePhoto(p) {
  const dest = phDest(p), em = emetteurOf(p), loc = phLoc(p);
  const subject = `${S.ch.code || S.ch.nom} - ${loc || 'photo du ' + fmtD(p.date)}`;
  const txt = `${S.ch.nom}${S.ch.adresse ? ', ' + S.ch.adresse : ''}\n${loc ? 'Localisation : ' + loc + '\n' : ''}${p.lotId ? 'Lot ' + lotLabel(p.lotId) + '\n' : ''}\n${phTxt(p)}\n\nDe : ${entLabel(em)}\nÀ : ${dest.map(entLabel).join(', ')}\nPhoto du ${fmtD(p.date)} à ${fmtT(p.date)}`;
  const b = await DB.getBlob(p.blobId), file = b && new File([b], subject.replace(/[\\/:*?"<>|]/g, '-') + '.jpg', { type: b.type || 'image/jpeg' });
  const mark = async () => { p.envoyeLe = today(); await save('photos', p); };
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: subject, text: txt }); return mark(); } catch (e) { if (e.name === 'AbortError') return; } }
  if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
  location.href = `mailto:${dest.map(e => e.email).filter(Boolean).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt + '\n\n(photo enregistrée dans vos téléchargements, à joindre)')}`;
  await mark();
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

/* ---------- Comptes-rendus ----------
   Questions numérotées à leur création : C03.04 = 4e question posée au compte-rendu n° 3 ; le numéro suit la question de CR en CR.
   Dans chaque CR : questions du jour (posées à cette réunion), questions en cours (reprises des CR précédents), questions réglées (réglées à cette réunion).
   Les photos restent distinctes : elles illustrent une question (Ph. 1, Ph. 2…), elles ne sont pas des questions. */
const pad2 = n => String(n || 0).padStart(2, '0');
const crName = n => 'C' + pad2(n); // compte-rendu de chantier n° 1 = C01
const qNum = o => o.cr ? `C${pad2(o.cr)}.${pad2(o.seq)}` : '';
const Q_SECT = [['reglees', 'Questions réglées'], ['encours', 'Questions en cours'], ['jour', 'Questions du jour']];
const qSect = (v, o) => o.statut === 'fait' ? 'reglees' : o.cr && o.cr < v.numero ? 'encours' : 'jour';
const PRES = { O: 'Présent', N: 'Absent', R: 'En retard', E: 'Excusé' }, PRES_OLD = { P: 'O', A: 'N' };
const presOf = (v, id) => { const x = (v.presents || {})[id] || ''; return PRES_OLD[x] || x; };
const prevVisite = v => S.visites.filter(x => x.numero < v.numero).sort((a, b) => b.numero - a.numero)[0];
/* convoqué à la prochaine réunion : choix fait dans ce CR, sinon le réglage de l'intervenant */
const convNext = (v, e) => (v.convoques || {})[e.id] ?? (e.convoque !== false);
const crEnts = v => { const pv = prevVisite(v); return intervenants().filter(e => e.convoque !== false || presOf(v, e.id) || (v.convoques || {})[e.id] || (pv && (pv.convoques || {})[e.id])); };
function nextSeq(v) { const used = S.visites.flatMap(x => x.observations || []).filter(o => o.cr === v.numero).reduce((m, o) => Math.max(m, o.seq || 0), 0); v.qMax = Math.max(v.qMax || 0, used) + 1; return v.qMax; }
/* chaque question a un émetteur (celui qui la pose, par défaut l'architecte) et un ou plusieurs destinataires (l'entreprise du lot par défaut, ou « tous ») */
const qDestDefault = lotId => lotEnt(lotId) ? [lotEnt(lotId)] : ['TOUS'];
const qDest = o => (o.destinataires && o.destinataires.length) ? o.destinataires : qDestDefault(o.lotId);
const qEm = o => entById(o.emetteurId) || emetteurOf();
/* lot d'une question : celui de la première entreprise destinataire (sinon généralités) */
const qLot = o => { for (const id of qDest(o)) { const e = entById(id); if (e && e.role === 'ENT') { const l = lotsOf().filter(x => x.entrepriseId === e.id).sort((a, b) => a.code.localeCompare(b.code))[0]; if (l) return l.id; } } return ''; };
const entShort = e => { if (!e) return ''; const l = e.role === 'ENT' ? lotsOf().filter(x => x.entrepriseId === e.id).map(x => x.code).join(', ') : ''; return e.nom + (l ? ' (lot ' + l + ')' : ''); };
const qDestLabel = o => qDest(o).map(id => id === 'TOUS' ? 'Tous' : entShort(entById(id))).filter(Boolean).join(', ');
const obsFromPhoto = (v, p) => Object.assign(newObs(v, p.lotId, phTxt(p), [p.id]), (p.destinataires || []).length ? { destinataires: [...p.destinataires], destAuto: false } : {}, p.emetteurId ? { emetteurId: p.emetteurId } : {});
function newObs(v, lotId = '', texte = '', photoIds = [], localisation = '') { return { id: DB.uid(), qid: DB.uid(), cr: v.numero, seq: nextSeq(v), lotId, localisation, texte, emetteurId: (emetteurOf() || {}).id || '', destinataires: qDestDefault(lotId), destAuto: true, statut: 'afaire', echeance: '', photoIds, origine: null }; }
const carry = (o, from) => ({ ...o, id: DB.uid(), origine: o.cr || o.origine || from.numero, photoIds: [], photosCR: o.photoIds && o.photoIds.length ? (o.photosCR || from.numero) : o.photosCR || null });
/* numérote les questions des CR créés avant la 0.4 (une question reprise garde le numéro de sa première apparition) */
async function numberQuestions() {
  const vs = S.visites.slice().sort((a, b) => a.numero - b.numero), byNum = new Map(vs.map(v => [v.numero, v]));
  for (const v of vs) { let ch = false;
    for (const o of v.observations || []) { if (o.seq) continue; ch = true;
      const src = o.origine && byNum.get(o.origine), twin = src && (src.observations || []).find(x => x.seq && x.texte === o.texte && x.lotId === o.lotId);
      if (twin) Object.assign(o, { cr: twin.cr, seq: twin.seq, qid: twin.qid }); else { const home = src || v; o.cr = home.numero; o.seq = nextSeq(home); o.qid = DB.uid(); if (home !== v) await save('visites', home); } }
    if (ch) await save('visites', v); }
}
async function newVisite(date = today(), heure = '') {
  const prev = S.visites.slice().sort((a, b) => b.numero - a.numero)[0];
  const v = { id: DB.uid(), chantierId: S.ch.id, numero: (prev ? prev.numero : 0) + 1, date, heure, meteo: '', redacteur: S.auteur || (emetteurOf() || {}).contact || '', presents: {}, convoques: {}, autres: '', observations: [], prochaine: '', diffusion: '' };
  if (prev) v.observations = (prev.observations || []).filter(o => o.statut !== 'fait').map(o => carry(o, prev)); // questions du jour et en cours du CR précédent → en cours
  return save('visites', v);
}
/* reprise automatique : toute question non réglée du CR précédent absente de celui-ci y est ajoutée en « en cours »
   (cas d'un CR créé avant que les questions du précédent soient saisies) ; une question retirée à la main n'est pas remise */
async function injectPrev(v) {
  const prev = prevVisite(v); if (!prev) return 0;
  await injectPrev(prev); // chaîne C01 → C02 → C03
  const have = new Set([...(v.observations || []).map(o => o.qid || qNum(o)), ...(v.retires || [])]);
  const add = (prev.observations || []).filter(o => o.statut !== 'fait' && (o.texte || '').trim() && !have.has(o.qid || qNum(o))).map(o => carry(o, prev));
  if (!add.length) return 0; v.observations = [...(v.observations || []), ...add]; await save('visites', v); return add.length;
}
async function visiteDuJour(create = true) { const v = S.visites.find(x => x.date === today()); return v || !create ? v : newVisite(today(), new Date().toTimeString().slice(0, 5)); }
async function addObsFromPhoto(p) { const v = await visiteDuJour(); const o = obsFromPhoto(v, p); v.observations.push(o); await save('visites', v); toast(`Question ${qNum(o)} ajoutée au ${crName(v.numero)}`); }
function tabVisites(m) {
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">Comptes-rendus</h2><button class="btn pri" id="bNv">+ Nouveau compte-rendu (${crName((S.visites[0] || { numero: 0 }).numero + 1)})</button></div>
    <div class="list">${S.visites.map(v => { const o = v.observations || [], n = s => o.filter(x => qSect(v, x) === s).length; return `<a class="card ch" href="#/c/${S.ch.id}/v/${v.id}"><span class="ico">${crName(v.numero)}</span><span class="grow"><b>${crName(v.numero)} · ${fmtDL(v.date)}</b><div class="small muted">${n('jour')} du jour, ${n('encours')} en cours, ${n('reglees')} réglée(s)${v.diffuseLe ? ' · diffusé le ' + fmtD(v.diffuseLe) : ''}</div></span></a>`; }).join('') || '<div class="empty"><b>Aucun compte-rendu</b>Créez le compte-rendu de la visite : les questions en cours sont reprises, les photos du jour vous sont proposées.</div>'}</div>`;
  $('#bNv').onclick = async () => { const v = await newVisite(); if ((v.observations || []).length) toast(`${v.observations.length} question(s) reprise(s) en questions en cours`); location.hash = `#/c/${S.ch.id}/v/${v.id}`; };
}
async function viewVisite(app, id) {
  const v = S.visites.find(x => x.id === id); if (!v) { location.hash = `#/c/${S.ch.id}/visites`; return; }
  if (await injectPrev(v)) toast('Questions non réglées du compte-rendu précédent reprises en questions en cours');
  { let ch = false; for (const o of v.observations || []) { const ph = (o.photoIds || []).map(photoById).filter(Boolean); if (o.localisation && ph.length) { for (const p of ph) if (!p.localisation) { p.localisation = o.localisation; await save('photos', p); } o.localisation = ''; ch = true; } } if (ch) await save('visites', v); } // la localisation va aux photos
  const ents = crEnts(v), lotKey = k => lotById(k) ? lotById(k).code : '~';
  const sect = s => { const qs = v.observations.filter(o => qSect(v, o) === s).sort((a, b) => lotKey(qLot(a)).localeCompare(lotKey(qLot(b))) || (a.cr - b.cr) || (a.seq - b.seq)); let h = '', last = null;
    for (const o of qs) { if (qLot(o) !== last) { last = qLot(o); const l = lotById(last); h += `<div class="lothead"><span class="code">${esc(l ? l.code : '—')}</span>${esc(l ? l.nom : 'Généralités')}${l && entById(l.entrepriseId) ? `<span class="muted small">· ${esc(entById(l.entrepriseId).nom)}</span>` : ''}</div>`; } h += obsHTML(o, v); }
    return [qs.length, h]; };
  const used = new Set(v.observations.flatMap(o => o.photoIds || [])), dayPh = S.photos.filter(p => dayOf(p.date) === v.date && !used.has(p.id));
  const presRow = e => `<tr><td><b>${esc(e.nom || '(sans nom)')}</b><div class="small muted">${esc([e.role === 'ENT' ? lotsOf().filter(l => l.entrepriseId === e.id).map(l => 'lot ' + l.code).join(', ') : '', e.contact ? e.contact + (e.fonction ? ' (' + e.fonction + ')' : '') : ''].filter(Boolean).join(' · '))}</div></td>
    <td style="width:150px"><div class="pres" data-e="${e.id}">${Object.entries(PRES).map(([k, t]) => `<button type="button" data-v="${k}" class="${presOf(v, e.id) === k ? 'on' : ''}" title="${t}">${k}</button>`).join('')}</div></td>
    <td style="width:90px;text-align:center"><input type="checkbox" data-conv="${e.id}"${convNext(v, e) ? ' checked' : ''} aria-label="Convoqué à la prochaine réunion" style="width:20px;height:20px"></td></tr>`;
  const S3 = Q_SECT.map(([k, t]) => [k, t, ...sect(k)]);
  app.innerHTML = topBar(crName(v.numero), S.ch.nom, { back: `#/c/${S.ch.id}/visites`, extra: '<button class="btn pri sm" id="bPdf">PDF</button>' }) + `<main>
    <div class="card"><div class="grid2"><label class="f">Date<input type="date" data-k="date" value="${v.date}"></label><label class="f">Heure<input type="time" data-k="heure" value="${esc(v.heure)}"></label>
      <label class="f">Météo<input type="text" data-k="meteo" value="${esc(v.meteo)}" placeholder="Beau temps, 14 °C"></label><label class="f">Rédacteur<input type="text" data-k="redacteur" value="${esc(v.redacteur)}"></label>
      <label class="f">Prochaine réunion<input type="text" data-k="prochaine" value="${esc(v.prochaine)}" placeholder="Mardi 27/10 à 9 h 30 sur site"></label></div></div>
    <h3 style="margin:18px 0 6px;font-size:16px">Présences et convocations</h3>
    <div class="card">${ents.length ? `<div class="hint" style="margin-bottom:4px">O présent · N absent · R en retard · E excusé</div><table class="t"><thead><tr><th>Intervenant</th><th>Présence</th><th style="text-align:center">Convoqué prochaine réunion</th></tr></thead><tbody>${ents.map((e, i) => `${i === 0 || roleCat(ents[i - 1].role) !== roleCat(e.role) ? `<tr><td colspan="3" class="small" style="color:var(--accent);font-weight:700;padding-top:12px">${esc(catName(roleCat(e.role)))}</td></tr>` : ''}${presRow(e)}`).join('')}</tbody></table>` : '<div class="hint">Ajoutez les intervenants (onglet « Intervenants et lots », version complète) pour noter les présences.</div>'}
      <label class="f" style="margin-top:8px">Autres participants<textarea data-k="autres" rows="2" placeholder="MOA : Mme X ; BET structure : M. Y">${esc(v.autres)}</textarea></label></div>
    ${dayPh.length ? `<h3 style="margin:18px 0 6px;font-size:16px">Photos du ${fmtD(v.date)} non rattachées (${dayPh.length})</h3><div class="hint" style="margin-bottom:6px">Touchez une photo pour poser une question du jour à partir de son texte.</div><div class="thumbs" id="dayPh">${await thumbsHTML(dayPh)}</div>` : ''}
    <div class="bar" style="margin-top:18px"><h3 style="font-size:16px;flex:1 1 100%">Questions</h3><button class="btn" id="bPrev">Reprendre les questions en cours du CR précédent</button><button class="btn pri" id="bObs">+ Question du jour</button></div>
    ${S3.map(([k, t, n, h]) => `<div class="qsect" data-s="${k}"><h4>${t}</h4>${h || `<div class="hint">${k === 'jour' ? 'Aucune question posée à cette réunion.' : k === 'encours' ? 'Aucune question en cours.' : 'Aucune question réglée à cette réunion.'}</div>`}</div>`).join('')}
    <datalist id="dlLoc">${locList().map(l => `<option value="${esc(l)}">`).join('')}</datalist>
    <label class="f" style="margin-top:16px">Diffusion complémentaire (les intervenants convoqués sont destinataires d'office)<textarea data-k="diffusion" rows="2" placeholder="Autres destinataires">${esc(v.diffusion)}</textarea></label>
    <div class="bar" style="margin-top:16px"><button class="btn danger" id="bDelV">Supprimer ce compte-rendu</button></div></main>
    <button class="fab" id="fab" aria-label="Photo pour ce compte-rendu">${ICON.cam}</button>`;
  bindTop(app);
  await Promise.all(v.observations.map(async o => { const el = $(`[data-o="${o.id}"] .phcards`, app); if (el && (o.photoIds || []).length) { el.innerHTML = await phCardsHTML(o.photoIds.map(photoById).filter(Boolean)); bindPhCards(el); } }));
  let tm; const persist = () => { clearTimeout(tm); tm = setTimeout(() => save('visites', v), 400); };
  $$('[data-k]', app).forEach(i => i.oninput = () => { v[i.dataset.k] = i.value; persist(); });
  $$('.pres', app).forEach(g => g.onclick = e => { const b = e.target.closest('button'); if (!b) return; v.presents = v.presents || {}; const cur = presOf(v, g.dataset.e); v.presents[g.dataset.e] = cur === b.dataset.v ? '' : b.dataset.v; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v.presents[g.dataset.e])); persist(); });
  $$('[data-conv]', app).forEach(c => c.onchange = () => { v.convoques = v.convoques || {}; v.convoques[c.dataset.conv] = c.checked; persist(); });
  $$('[data-o]', app).forEach(el => { const o = v.observations.find(x => x.id === el.dataset.o);
    el.querySelectorAll('[data-ok]').forEach(i => i.oninput = i.onchange = () => { o[i.dataset.ok] = i.value;
      if (i.dataset.ok === 'statut') { if (o.statut === 'fait') o.regleeAu = v.numero; else delete o.regleeAu; save('visites', v).then(render); return; }
      if (i.dataset.ok === 'lotId') { if (o.destAuto !== false) o.destinataires = qDestDefault(o.lotId); save('visites', v).then(render); return; }
      if (i.dataset.ok === 'emetteurId') { o.destinataires = qDest(o).filter(x => x !== o.emetteurId); save('visites', v).then(render); return; } persist(); });
    el.querySelectorAll('[data-qd]').forEach(b => b.onclick = () => { const id = b.dataset.qd; let d = [...qDest(o)];
      d = id === 'TOUS' ? ['TOUS'] : d.includes(id) ? d.filter(x => x !== id) : [...d.filter(x => x !== 'TOUS'), id];
      o.destinataires = d.length ? d : ['TOUS']; o.destAuto = false; o.lotId = qLot(o); el.querySelectorAll('[data-qd]').forEach(x => x.classList.toggle('on', o.destinataires.includes(x.dataset.qd))); persist(); });
    el.querySelector('[data-act=ph]').onclick = async () => { const ids = await pickPhotos(o.photoIds || [], v.date); if (ids) { o.photoIds = ids; await save('visites', v); render(); } };
    el.querySelector('[data-act=cam]').onclick = () => { const inp = $('#camIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; const [p] = await processFiles([...inp.files], { forObs: true, lotId: qLot(o), texte: o.titre || o.texte, destinataires: qDest(o).includes('TOUS') ? undefined : qDest(o), silent: true }); o.photoIds = [...(o.photoIds || []), p.id]; await save('visites', v); render(); }; inp.click(); };
    const mv = el.querySelector('[data-act=done]') || el.querySelector('[data-act=open]'); mv.onclick = async () => { if (o.statut === 'fait') { o.statut = 'afaire'; delete o.regleeAu; } else { o.statut = 'fait'; o.regleeAu = v.numero; } await save('visites', v); render(); };
    el.querySelector('[data-act=del]').onclick = async () => { if (!confirm(`Supprimer la question ${qNum(o)} de ce compte-rendu ?`)) return; v.observations = v.observations.filter(x => x !== o); if (o.cr < v.numero) v.retires = [...(v.retires || []), o.qid || qNum(o)]; await save('visites', v); render(); };
    el.querySelector('[data-act=res]').onclick = async () => { const p = photoById((o.photoIds || [])[0]), r = await newReserve({ lotId: qLot(o), description: [o.titre, o.texte].filter(Boolean).join(' : '), localisation: (p && p.localisation) || o.localisation || '', photoIds: [...(o.photoIds || [])] }); if (p && p.planId) Object.assign(r, { planId: p.planId, x: p.x, y: p.y }); await save('reserves', r); toast(`Réserve n° ${r.numero} créée`); };
  });
  $('#bObs').onclick = async () => { const o = newObs(v, ''); v.observations.push(o); await save('visites', v); await render(); const t = $(`[data-o="${o.id}"] [data-ok=titre]`, app); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } };
  $('#bPrev').onclick = async () => { const prev = prevVisite(v); if (!prev) return toast('Pas de compte-rendu précédent');
    const have = new Set(v.observations.map(o => o.qid || qNum(o))), add = (prev.observations || []).filter(o => o.statut !== 'fait' && !have.has(o.qid || qNum(o))).map(o => carry(o, prev));
    if (!add.length) return toast('Aucune question en cours à reprendre'); v.observations.push(...add); await save('visites', v); toast(`${add.length} question(s) reprise(s) du ${crName(prev.numero)}`); render(); };
  if ($('#dayPh')) $$('#dayPh [data-ph]', app).forEach(b => b.onclick = async () => { const p = photoById(b.dataset.ph); v.observations.push(obsFromPhoto(v, p)); await save('visites', v); render(); });
  $('#fab').onclick = () => { const inp = $('#camIn'); inp.value = ''; inp.onchange = async () => { if (!inp.files[0]) return; const [p] = await processFiles([...inp.files], { forObs: true, silent: true }); v.observations.push(obsFromPhoto(v, p)); await save('visites', v); render(); }; inp.click(); };
  $('#bPdf').onclick = () => exportCR(v);
  $('#bDelV').onclick = async () => { if (!confirm(`Supprimer le compte-rendu ${crName(v.numero)} ?`)) return; v.deleted = true; await save('visites', v); location.hash = `#/c/${S.ch.id}/visites`; };
}
function obsHTML(o, v) {
  const hist = [o.cr && o.cr < v.numero ? `posée au ${crName(o.cr)}` : '', o.statut === 'fait' && o.regleeAu ? `réglée au ${crName(o.regleeAu)}` : '', o.photosCR && !(o.photoIds || []).length ? `photos au ${crName(o.photosCR)}` : ''].filter(Boolean).join(' · ');
  return `<div class="obs st-${o.statut}" data-o="${o.id}">
    <div class="qwho"><label class="row small muted" style="gap:6px">De<select data-ok="emetteurId" style="width:auto;max-width:260px">${intervenants().map(e => `<option value="${e.id}"${qEm(o) && qEm(o).id === e.id ? ' selected' : ''}>${esc(entLabel(e))}</option>`).join('')}</select></label>
      <span class="small muted">À</span><div class="levels wrap">${[['TOUS', 'Tous'], ...intervenants().filter(e => !qEm(o) || e.id !== qEm(o).id).map(e => [e.id, entShort(e)])].map(([id, t]) => `<button type="button" class="chip${qDest(o).includes(id) ? ' on' : ''}" data-qd="${id}">${esc(t)}</button>`).join('')}</div>
      ${o.statut === 'fait' ? '' : `<label class="row small muted" style="gap:4px;margin-left:auto">Échéance <input type="date" data-ok="echeance" value="${o.echeance || ''}" style="width:auto"></label>`}</div>
    <div class="row" style="gap:8px"><span class="qnum">${esc(qNum(o))}</span><input type="text" data-ok="titre" value="${esc(o.titre || '')}" placeholder="Titre (ex. : Peintures à revoir)" class="grow qtitle"></div>
    <textarea data-ok="texte" rows="2" placeholder="Question, constat, demande">${esc(o.texte)}</textarea>
    ${o.localisation && !(o.photoIds || []).length ? `<div class="small muted">Localisation : ${esc(o.localisation)}</div>` : ''}
    <div class="phcards"></div>
    <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="cam">Photo</button><button class="btn sm" data-act="ph">Joindre des photos</button><button class="btn sm" data-act="res">En faire une réserve</button>${hist ? `<span class="small muted">${hist}</span>` : ''}<span class="grow"></span>${o.statut === 'fait' ? '<button class="btn sm" data-act="open">Remettre en cours</button>' : '<button class="btn sm pri" data-act="done">✓ Réglée</button>'}<button class="btn sm danger" data-act="del">Supprimer</button></div></div>`;
}
/* photo jointe à une question : vignette, petit plan de localisation, légende = localisation (pièce, niveau) */
const miniCache = new Map();
async function miniPlan(p) { const pl = planById(p.planId); if (!pl || p.x == null) return ''; const k = [p.id, p.planId, p.x, p.y, p.dir].join('|'); if (!miniCache.has(k)) miniCache.set(k, await planMini(pl, p, 240, 240)); return miniCache.get(k); }
async function phCardsHTML(list) {
  const out = await Promise.all(list.map(async p => { const [u, m] = await Promise.all([BlobURL(p.thumbId || p.blobId), miniPlan(p)]);
    return `<div class="phc" data-pc="${p.id}"><div class="row" style="gap:6px;align-items:stretch"><button type="button" class="phc-img" data-ph="${p.id}"><img src="${u}" alt=""></button>${m ? `<button type="button" class="phc-plan" data-pl="${p.id}" title="${esc((planById(p.planId) || {}).nom || '')}"><img src="${m}" alt="Plan de localisation"></button>` : `<button type="button" class="phc-plan none" data-pl="${p.id}">Placer sur le plan</button>`}</div>
      <input type="text" data-ploc="${p.id}" list="dlLoc" value="${esc(p.localisation || '')}" placeholder="Localisation : chambre 3, R+2" autocomplete="off"><div class="small muted">${esc((planById(p.planId) || {}).nom ? 'Niveau ' + planById(p.planId).nom : '')}</div></div>`; }));
  return out.join('');
}
function bindPhCards(el) {
  el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => photoSheet(photoById(b.dataset.ph)));
  el.querySelectorAll('[data-pl]').forEach(b => b.onclick = async () => { const p = photoById(b.dataset.pl); if (!S.plans.length) return toast('Importez d\'abord les plans de niveaux (onglet Plans)'); await locateSheet(p, { forObs: true, silent: true }); render(); });
  el.querySelectorAll('[data-ploc]').forEach(i => i.onchange = async () => { const p = photoById(i.dataset.ploc); p.localisation = i.value.trim(); await save('photos', p); });
}
function pickLot(title = 'Lot concerné') {
  return new Promise(res => { const sh = sheet(title, `<div class="list">${[{ id: '', code: '—', nom: 'Sans lot / généralités' }, ...lotsOf().slice().sort((a, b) => a.code.localeCompare(b.code))].map(l => `<button class="card ch" style="text-align:left;cursor:pointer" data-lot="${l.id}"><span class="ico" style="width:36px;height:36px;font-size:13px">${esc(l.code)}</span><span class="grow"><b>${esc(l.nom)}</b>${l.entrepriseId && entById(l.entrepriseId) ? `<div class="small muted">${esc(entById(l.entrepriseId).nom)}</div>` : ''}</span></button>`).join('')}</div>`);
    let v = null; $$('[data-lot]', sh.el).forEach(b => b.onclick = () => { v = b.dataset.lot; sh.close(); }); sh.bg.addEventListener('closed', () => res(v)); });
}

/* ---------- Réserves (OPR) ---------- */
async function newReserve(o = {}) { const r = { id: DB.uid(), chantierId: S.ch.id, numero: S.reserves.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1, lotId: '', description: '', localisation: '', planId: null, x: null, y: null, photoIds: [], statut: 'ouverte', phase: S._phase || 'OPR', dateConstat: today(), dateLevee: '', echeance: '', commentaire: '', ...o }; return save('reserves', r); }
async function addReserveFromPhoto(p) { const r = await newReserve({ lotId: p.lotId, description: phTxt(p), localisation: p.localisation || '', photoIds: [p.id], planId: p.planId, x: p.x, y: p.y }); toast(`Réserve n° ${r.numero} créée`); return r; }
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
    <div class="grid2"><label class="f">Lot<select data-k="lotId">${lotOptions(r.lotId)}</select></label><label class="f">Localisation (pièce, repère)<input type="text" data-k="localisation" list="dlLoc" autocomplete="off" value="${esc(r.localisation)}" placeholder="Logement B12, salle de bains"></label><datalist id="dlLoc">${locList().map(l => `<option value="${esc(l)}">`).join('')}</datalist>
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
  if (isField()) { m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">Plans de niveaux</h2></div><div class="list">${S.plans.map((p, i) => `<button class="card row" style="text-align:left;cursor:pointer" data-open="${p.id}"><img src="${urls[i]}" alt="" style="width:86px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px"><span class="grow"><b>${esc(p.nom)}</b><div class="small muted">${S.photos.filter(x => x.planId === p.id).length} photo(s) · ${S.reserves.filter(x => x.planId === p.id).length} réserve(s)</div></span></button>`).join('') || '<div class="empty"><b>Aucun plan</b>Les plans s\'importent dans la version complète (PC ou tablette).</div>'}</div>`;
    $$('[data-open]', m).forEach(b => b.onclick = () => planSheet(planById(b.dataset.open))); return; }
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
  const draw = () => pv.setMarkers([...(show.ph ? S.photos.filter(p => p.planId === plan.id).map(p => ({ x: p.x, y: p.y, dir: p.dir, kind: '', label: '', title: [phLoc(p), phTxt(p)].filter(Boolean).join(' : ') || fmtD(p.date), photo: p })) : []),
    ...(show.res ? (reserves || S.reserves).filter(r => r.planId === plan.id).map(r => ({ x: r.x, y: r.y, kind: r.statut === 'levee' ? 'done' : 'res', label: r.numero, title: r.description, res: r })) : [])]);
  draw(); $$('[data-s]', sh.el).forEach(b => b.onclick = () => { show[b.dataset.s] = !show[b.dataset.s]; b.classList.toggle('on', show[b.dataset.s]); draw(); });
}

/* ---------- Intervenants (puisés dans le carnet TerraContacts) et lots ---------- */
async function addFromCarnet(role, { lot } = {}) {
  const k = await Carnet.pick({ role, title: role ? roleName(role) : 'Intervenant', lot }); if (!k) return null;
  let e = intervenants().find(x => x.contactId === k.c.id && (!k.pid || x.personneId === k.pid));
  if (!e) { e = Carnet.asIntervenant(k.c, k.pid, { id: DB.uid(), role: role || (k.c.agence ? 'MOE' : k.c.role), convoque: true }); S.ch.entreprises.push(e); if (!S.ch.emetteurId && k.c.agence) S.ch.emetteurId = e.id; await save('chantiers', S.ch); }
  return e;
}
function tabFiche(m) {
  const c = S.ch; c.lots = c.lots || []; c.entreprises = c.entreprises || []; const field = isField(), L = intervenants(), em = emetteurOf();
  const groups = ROLE_CATS.map(([k]) => [k, L.filter(e => roleCat(e.role) === k)]).filter(g => g[1].length);
  const lotsOfE = e => lotsOf().filter(l => l.entrepriseId === e.id).map(l => 'lot ' + l.code).join(', ');
  const coords = e => `<span class="row small" style="gap:14px;flex-wrap:wrap">${e.tel ? `<a href="tel:${esc(e.tel.replace(/\s/g, ''))}">${esc(e.tel)}</a>` : ''}${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : ''}</span>`;
  const persLine = e => e.contact || e.fonction || e.tel || e.email ? `<div class="persline"><span class="small muted">Interlocuteur</span> <b>${esc(e.contact || '(sans nom)')}</b>${e.fonction ? `, <span>${esc(e.fonction)}</span>` : ''}${coords(e)}</div>` : '<div class="persline small muted">Aucun interlocuteur désigné</div>';
  const orgLine = e => esc(e.role === 'ENT' ? lotsOfE(e) || 'Entreprise' : roleName(e.role));
  const ro = e => `<div class="card" style="display:flex;flex-direction:column;gap:2px"><b>${esc(e.nom || '(sans nom)')}${em && em.id === e.id ? ' <span class="badge b-refusee">émetteur</span>' : ''}</b><span class="small muted">${orgLine(e)}</span>${persLine(e)}</div>`;
  const roleSel = e => `<select data-f="role" style="width:auto">${roleOptions(e.role)}</select>`;
  const conv = e => `<label class="row small muted" style="gap:5px"><input type="checkbox" data-f="convoque"${e.convoque === false ? '' : ' checked'}> Convoqué aux réunions et destinataire des CR</label>`;
  const linked = e => { const k = Carnet.byId(e.contactId), kc = `<span class="row small" style="gap:14px;flex-wrap:wrap">${k.tel ? `<a href="tel:${esc(k.tel.replace(/\s/g, ''))}">${esc(k.tel)}</a>` : ''}${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}</span>`;
    return `<div class="card" data-e="${e.id}"><div class="row" style="flex-wrap:wrap;align-items:flex-start"><div class="grow" style="min-width:200px"><span class="small muted">Société ou organisme</span><br><b>${esc(e.nom)}</b> <span class="badge b-levee" title="Coordonnées tenues à jour depuis TerraContacts">carnet</span>${em && em.id === e.id ? ' <span class="badge b-refusee">émetteur</span>' : ''}
      <div class="small muted">${esc([e.role === 'ENT' ? lotsOfE(e) : '', [k.cp, k.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</div>${kc}</div><label class="f" style="width:auto">Rôle${roleSel(e)}</label></div>
      <div class="persbox"><label class="f">Interlocuteur pour ce chantier<select data-f="personneId">${k.personnes.map(p => `<option value="${p.id}"${e.personneId === p.id ? ' selected' : ''}>${esc(Carnet.fullName(p) || p.email)}${p.fonction ? ' (' + esc(p.fonction) + ')' : ''}</option>`).join('')}${k.personnes.length ? '' : '<option value="">(aucun interlocuteur dans la fiche)</option>'}</select></label>
      ${e.contact ? `<div style="margin-top:4px">${coords(e)}</div>` : ''}</div>
      <div class="row" style="margin-top:6px;flex-wrap:wrap">${conv(e)}<span class="grow"></span><button class="btn sm" data-kedit>Modifier la fiche</button><button class="btn sm danger" data-rm>Retirer</button></div></div>`; };
  const free = e => `<div class="card" data-e="${e.id}"><h3 class="fsec">Société ou organisme</h3><div class="grid2"><label class="f">Rôle${roleSel(e).replace('style="width:auto"', '')}</label>
    <label class="f">Nom de la société ou de l'organisme<input type="text" data-f="nom" value="${esc(e.nom)}"></label></div>
    <div class="persbox"><h3 class="fsec">Interlocuteur (personne)</h3><div class="grid2"><label class="f">Nom de la personne<input type="text" data-f="contact" value="${esc(e.contact)}" placeholder="Prénom Nom"></label><label class="f">Fonction de la personne<input type="text" data-f="fonction" value="${esc(e.fonction || '')}" placeholder="Chargé d'opération, conducteur de travaux…"></label>
    <label class="f">Téléphone<input type="tel" data-f="tel" value="${esc(e.tel)}"></label><label class="f">E-mail<input type="email" data-f="email" value="${esc(e.email)}"></label></div></div>
    <div class="row" style="margin-top:6px;flex-wrap:wrap">${conv(e)}<span class="grow"></span><button class="btn sm" data-ksave title="Crée la fiche dans TerraContacts et la relie à ce chantier">Enregistrer dans le carnet</button><button class="btn sm danger" data-rm>Retirer</button></div></div>`;
  m.innerHTML = `<div class="bar"><h2 class="grow" style="font-size:18px">${esc(c.nom)}</h2>${field ? '' : '<a class="btn" href="contacts.html">Carnet de contacts</a><button class="btn" id="bEdC">Modifier le chantier</button>'}</div>
    ${c.adresse ? `<div class="card small muted" style="margin-bottom:14px">${esc(c.adresse)}</div>` : ''}
    ${field ? '' : `<div class="card" style="margin-bottom:14px"><label class="f">Émetteur des comptes-rendus et des photos (par défaut l'architecte du chantier)<select id="emSel">${L.map(e => `<option value="${e.id}"${em && em.id === e.id ? ' selected' : ''}>${esc(roleName(e.role) + ' · ' + entLabel(e))}</option>`).join('')}${em ? '' : '<option value="" selected>(à choisir)</option>'}</select></label></div>`}
    <div class="bar"><h3 class="grow" style="font-size:16px">Intervenants</h3>${field ? '' : `<select id="addRole" style="width:auto">${roleOptions('')}</select><button class="btn pri" id="bAddK">+ Depuis le carnet</button><button class="btn" id="bAddE">+ Saisie libre</button>`}</div>
    ${groups.map(([k, es]) => `<div class="lothead">${esc(catName(k))}</div><div class="list">${es.map(e => field ? ro(e) : e.contactId && Carnet.byId(e.contactId) ? linked(e) : free(e)).join('')}</div>`).join('') || `<div class="empty" style="padding:16px">${field ? 'Aucun intervenant.' : "Ajoutez le maître d'ouvrage, la maîtrise d'œuvre, le bureau de contrôle, le coordonnateur SPS, les entreprises… depuis le carnet de contacts."}</div>`}
    <div class="bar" style="margin-top:18px"><h3 class="grow" style="font-size:16px">Lots</h3>${field ? '' : (c.lots.length ? '' : '<button class="btn" id="bTpl">Liste habituelle</button>') + '<button class="btn" id="bAddL">+ Lot</button>'}</div>
    <div class="card" style="padding:0 8px">${c.lots.length ? `<table class="t"><thead><tr><th style="width:70px">N°</th><th>Intitulé</th><th>Entreprise</th>${field ? '' : '<th></th>'}</tr></thead><tbody>${c.lots.slice().sort((a, b) => a.code.localeCompare(b.code)).map(l => field ? `<tr><td><b>${esc(l.code)}</b></td><td>${esc(l.nom)}</td><td>${esc((entById(l.entrepriseId) || {}).nom || '—')}</td></tr>` : `<tr data-l="${l.id}"><td><input type="text" data-f="code" value="${esc(l.code)}"></td><td><input type="text" data-f="nom" value="${esc(l.nom)}"></td><td><select data-f="entrepriseId"><option value="">—</option>${L.filter(e => e.role === 'ENT' || e.id === l.entrepriseId).map(e => `<option value="${e.id}"${l.entrepriseId === e.id ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}<option value="__k">Choisir dans le carnet…</option></select></td><td><button class="btn sm danger" data-rm aria-label="Retirer">×</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:16px">Aucun lot.</div>'}</div>`;
  if (field) return;
  const persist = () => save('chantiers', c);
  $('#bEdC').onclick = () => editChantier(c);
  if ($('#emSel')) $('#emSel').onchange = async e => { c.emetteurId = e.target.value; await persist(); tabFiche(m); };
  $('#bAddK').onclick = async () => { const e = await addFromCarnet($('#addRole').value); if (e) tabFiche(m); };
  $('#bAddE').onclick = async () => { const role = $('#addRole').value, e = { id: DB.uid(), role, nom: '', contact: '', fonction: '', tel: '', email: '', convoque: true }; c.entreprises.push(e); await persist(); tabFiche(m); const el = $(`[data-e="${e.id}"] [data-f=nom]`, m); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } };
  $('#bAddL').onclick = async () => { const n = c.lots.reduce((mx, l) => Math.max(mx, parseInt(l.code) || 0), 0) + 1; c.lots.push({ id: DB.uid(), code: String(n).padStart(2, '0'), nom: 'Nouveau lot', entrepriseId: '' }); await persist(); tabFiche(m); };
  if ($('#bTpl')) $('#bTpl').onclick = async () => { c.lots = DEFAULT_LOTS.map(([code, nom]) => ({ id: DB.uid(), code, nom, entrepriseId: '' })); await persist(); tabFiche(m); };
  $$('[data-e]', m).forEach(el => { const e = c.entreprises.find(x => x.id === el.dataset.e);
    el.querySelectorAll('[data-f]').forEach(i => i.onchange = async () => { e[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); if (i.dataset.f === 'personneId') Carnet.asIntervenant(Carnet.byId(e.contactId), e.personneId, e); await persist(); if (['role', 'personneId'].includes(i.dataset.f)) tabFiche(m); });
    el.querySelector('[data-rm]').onclick = async () => { if (!confirm(`Retirer ${e.nom || 'cet intervenant'} du chantier ?`)) return; c.entreprises = c.entreprises.filter(x => x !== e); for (const l of c.lots) if (l.entrepriseId === e.id) l.entrepriseId = ''; if (c.emetteurId === e.id) c.emetteurId = ''; await persist(); tabFiche(m); };
    const ke = el.querySelector('[data-kedit]'); if (ke) ke.onclick = async () => { const k = await Carnet.edit(Carnet.byId(e.contactId)); if (k || !Carnet.byId(e.contactId)) { Carnet.refreshChantier(c); await persist(); tabFiche(m); } };
    const ks = el.querySelector('[data-ksave]'); if (ks) ks.onclick = async () => { if (!e.nom) return toast('Indiquez d\'abord le nom de la société');
      const parts = (e.contact || '').trim().split(/\s+/), p = e.contact || e.email || e.tel ? { id: DB.uid(), civ: '', prenom: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', nom: parts.length > 1 ? parts.slice(-1)[0] : parts[0] || '', fonction: e.fonction || '', mobile: e.tel || '', tel: '', email: e.email || '', principal: true } : null;
      const k = await Carnet.edit({ id: DB.uid(), role: e.role, nom: e.nom, adresse: '', cp: '', ville: '', tel: '', email: '', site: '', siret: '', notes: '', lots: e.role === 'ENT' ? lotsOf().filter(l => l.entrepriseId === e.id).map(l => l.code) : [], personnes: p ? [p] : [] }, { fresh: true }); if (!k) return;
      e.contactId = k.id; e.personneId = (Carnet.principal(k) || {}).id || ''; Carnet.asIntervenant(k, e.personneId, e); await persist(); toast('Ajouté au carnet de contacts'); tabFiche(m); };
  });
  $$('[data-l]', m).forEach(tr => { const l = c.lots.find(x => x.id === tr.dataset.l); tr.querySelectorAll('[data-f]').forEach(i => i.onchange = async () => {
      if (i.value === '__k') { const e = await addFromCarnet('ENT', { lot: l.code }); if (e) { l.entrepriseId = e.id; e.role = e.role || 'ENT'; await persist(); } tabFiche(m); return; }
      l[i.dataset.f] = i.value.trim(); persist(); });
    tr.querySelector('[data-rm]').onclick = async () => { if (!confirm(`Retirer le lot ${l.code} ${l.nom} ?`)) return; c.lots = c.lots.filter(x => x !== l); await persist(); tabFiche(m); }; });
}

/* ================= Réglages ================= */
async function settingsSheet() {
  const cfg = await Sync.config(), est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const sh = sheet('Réglages', `<label class="f">Votre nom sur cet appareil (rédacteur des comptes-rendus)<input type="text" id="sAut" value="${esc(S.auteur)}"></label>
    <label class="f">Affichage<select id="sMode"><option value="auto"${S.mode === 'auto' ? ' selected' : ''}>Automatique : mode terrain sur téléphone, version complète sur PC et tablette</option><option value="terrain"${S.mode === 'terrain' ? ' selected' : ''}>Mode terrain (photos, CR, réserves)</option><option value="complet"${S.mode === 'complet' ? ' selected' : ''}>Version complète (tout faire, y compris la préparation)</option></select></label>
    <div class="card"><b>Votre agence</b><div class="hint" style="margin:4px 0 8px">Nom et logo en tête des comptes-rendus et des listes de réserves.</div>
      <div class="row" style="flex-wrap:wrap;gap:10px"><img id="sLogo" alt="" style="max-height:52px;max-width:180px;display:none;background:#fff;border:1px solid var(--line);border-radius:6px;padding:4px"><span class="grow small" id="sAg">${Carnet.agence() ? esc(Carnet.agence().nom) : 'Agence non renseignée'}</span>
      <button class="btn" id="sLogoB">${Carnet.agence() && Carnet.agence().logoId ? 'Changer le logo' : 'Ajouter le logo'}</button>${Carnet.agence() && Carnet.agence().logoId ? '<button class="btn danger" id="sLogoX">Retirer</button>' : ''}<a class="btn" href="contacts.html#/agence">Fiche de l'agence</a></div></div>
    <div class="card"><b>Synchronisation entre appareils</b><div class="hint" style="margin:4px 0 8px">Téléphone, tablette et PC partagent les mêmes chantiers, plans et photos.</div>${Sync.formHTML(cfg)}</div>
    <div class="card"><b>Sauvegarde</b><div class="hint" style="margin:4px 0 8px">Fichier de sauvegarde complet de cet appareil (chantiers, plans, photos).${est ? ` Espace utilisé : ${(est.usage / 1048576).toFixed(0)} Mo.` : ''}</div><div class="row" style="flex-wrap:wrap"><button class="btn" id="sExp">Enregistrer une sauvegarde</button><button class="btn" id="sImp">Restaurer une sauvegarde</button></div></div>
    <div class="small muted">TerraChantier ${APP_VERSION} bêta · TerraSuite${Carnet.agence() ? ' · ' + esc(Carnet.agence().nom) : ''} · <a href="contacts.html#/agence">Mon agence</a></div>`, `<button class="btn pri" data-close>Fermer</button>`);
  $('#sAut', sh.el).onchange = e => { S.auteur = e.target.value.trim(); DB.meta('auteur', S.auteur); };
  $('#sMode', sh.el).onchange = e => { S.mode = e.target.value; DB.meta('mode', S.mode); render(); };
  Sync.bindForm(sh.el);
  const ag0 = Carnet.agence(); if (ag0 && ag0.logoId) BlobURL(ag0.logoId).then(u => { if (u) { $('#sLogo', sh.el).src = u; $('#sLogo', sh.el).style.display = 'block'; } });
  $('#sLogoB', sh.el).onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
    let ag = Carnet.agence(); if (!ag) { const nom = prompt("Nom de l'agence"); if (!nom) return; ag = { id: DB.uid(), agence: true, role: 'MOE', nom, adresse: '', cp: '', ville: '', tel: '', email: '', site: '', siret: '', ordre: '', notes: '', lots: [], personnes: [] }; }
    const blob = f.size < 1.5e6 ? f : (await shrinkImage(f, 800, .92)).blob; ag.logoId = await DB.putBlob(blob); await Carnet.put(ag); toast('Logo enregistré'); sh.close(); settingsSheet(); }; inp.click(); };
  if ($('#sLogoX', sh.el)) $('#sLogoX', sh.el).onclick = async () => { const ag = Carnet.agence(); ag.logoId = ''; await Carnet.put(ag); sh.close(); settingsSheet(); };
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
  S.auteur = (await DB.meta('auteur')) || ''; S.mode = (await DB.meta('mode')) || 'auto'; S.lastPlan = await DB.meta('lastPlan');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  registerSW(); await Carnet.load();
  await render(); Sync.start();
})();
