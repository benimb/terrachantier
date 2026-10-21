/* TerraSuite : carnet de contacts partagé (application TerraContacts).
   Une fiche par organisme (maître d'ouvrage, bureau d'études, entreprise…) avec ses interlocuteurs.
   La fiche marquée « agence » décrit le cabinet qui utilise la suite : son architecte par défaut est l'émetteur
   des comptes-rendus et des photos. Rien n'est propre à un cabinet dans le code : chaque cabinet saisit sa fiche.
   Les fiches sont rangées dans la base locale (magasin « contacts ») et synchronisées comme le reste. */
const Carnet = (() => {
  let list = null;
  const fix = c => { c.personnes = c.personnes || []; c.lots = c.lots || []; c.role = c.role || 'ENT'; return c; };
  async function load(force) { if (!list || force) { list = (await DB.all('contacts')).map(fix); } return list; }
  const all = () => list || [];
  const byId = id => all().find(c => c.id === id);
  const agence = () => all().find(c => c.agence);
  const fullName = p => p ? [p.civ, p.prenom, p.nom].filter(Boolean).join(' ') : '';
  const principal = c => c ? (c.personnes.find(p => p.principal) || c.personnes[0] || null) : null;
  const personne = (c, pid) => c ? (c.personnes.find(p => p.id === pid) || null) : null;
  const architecte = () => principal(agence());
  const sorted = () => all().slice().sort((a, b) => (b.agence ? 1 : 0) - (a.agence ? 1 : 0) || roleRank(a.role) - roleRank(b.role) || (a.nom || '').localeCompare(b.nom || ''));
  async function put(c) {
    fix(c); c.chantierId = null; if (!c.id) c.id = DB.uid();
    if (c.agence) for (const o of all()) if (o.id !== c.id && o.agence) { o.agence = false; await DB.put('contacts', o); } // une seule agence
    await DB.put('contacts', c); const i = all().findIndex(x => x.id === c.id);
    if (c.deleted) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = c; else (list || (list = [])).push(c);
    if (typeof Sync !== 'undefined') Sync.soon(); return c;
  }
  /* copie d'un contact du carnet dans la liste des intervenants d'un chantier (les champs restent lisibles hors réseau) */
  function asIntervenant(c, pid, base = {}) {
    const p = personne(c, pid) || principal(c);
    return Object.assign(base, { role: base.role || (c.agence ? 'MOE' : c.role), contactId: c.id, personneId: p ? p.id : '', nom: c.nom, contact: fullName(p), fonction: (p && p.fonction) || '', tel: (p && (p.mobile || p.tel)) || c.tel || '', email: (p && p.email) || c.email || '' });
  }
  /* met à jour les intervenants d'un chantier liés au carnet ; relie d'office l'intervenant qui porte le nom de l'agence */
  function refreshChantier(ch) {
    if (!ch || !list) return false; let changed = false; const ag = agence();
    for (const e of ch.entreprises || []) {
      if (!e.contactId && ag && norm(e.nom) && norm(e.nom) === norm(ag.nom)) { e.contactId = ag.id; const a = architecte(); if (a && (!e.contact || norm(e.contact).includes(norm(a.nom)))) e.personneId = a.id; changed = true; }
      const c = e.contactId && byId(e.contactId); if (!c) continue;
      const before = JSON.stringify(e); asIntervenant(c, e.personneId, e); if (JSON.stringify(e) !== before) changed = true;
    }
    if (!ch.emetteurId || !(ch.entreprises || []).some(e => e.id === ch.emetteurId)) {
      const moe = (ch.entreprises || []).find(e => ag && e.contactId === ag.id) || (ch.entreprises || []).find(e => e.role === 'MOE');
      if (moe && ch.emetteurId !== moe.id) { ch.emetteurId = moe.id; changed = true; }
    }
    return changed;
  }
  const lotsTxt = c => (c.lots || []).join(', ');
  const lotsParse = s => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).map(x => /^\d$/.test(x) ? '0' + x : x);
  const resume = c => [c.agence ? 'Votre agence' : roleName(c.role), c.ville, c.lots.length ? 'lots ' + lotsTxt(c) : '', c.personnes.length ? c.personnes.length + ' interlocuteur(s)' : ''].filter(Boolean).join(' · ');

  /* ---------- fiche : formulaire ---------- */
  function personHTML(p, i, isAg) {
    return `<div class="card pers" data-p="${i}"><div class="small" style="font-weight:700;color:var(--accent);margin-bottom:6px">Interlocuteur ${i + 1}${p.prenom || p.nom ? ' : ' + esc([p.prenom, p.nom].filter(Boolean).join(' ')) : ''}</div><div class="grid2"><label class="f">Civilité<select data-pf="civ">${['', 'M.', 'Mme'].map(v => `<option${(p.civ || '') === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">Prénom<input type="text" data-pf="prenom" value="${esc(p.prenom)}"></label><label class="f">Nom<input type="text" data-pf="nom" value="${esc(p.nom)}"></label>
      <label class="f">Fonction de la personne<input type="text" data-pf="fonction" value="${esc(p.fonction)}" placeholder="${isAg ? 'Architecte, chef de projet…' : 'Conducteur de travaux, chef de projet…'}"></label>
      <label class="f">Mobile<input type="tel" data-pf="mobile" value="${esc(p.mobile)}"></label><label class="f">Téléphone fixe<input type="tel" data-pf="tel" value="${esc(p.tel)}"></label>
      <label class="f">E-mail<input type="email" data-pf="email" value="${esc(p.email)}"></label></div>
      <div class="row" style="margin-top:6px"><label class="row small muted" style="gap:5px"><input type="radio" name="princ" data-pf="principal"${p.principal ? ' checked' : ''}> ${isAg ? 'Architecte par défaut (émetteur des CR et des photos)' : 'Interlocuteur principal'}</label><span class="grow"></span><button type="button" class="btn sm danger" data-prm>Retirer</button></div></div>`;
  }
  function formHTML(c, { isAg } = {}) {
    return `<h3 class="fsec">${isAg ? 'Agence' : 'Société ou organisme'}</h3><div class="grid2">${isAg ? '' : `<label class="f">Rôle<select data-cf="role">${roleOptions(c.role)}</select></label>`}
      <label class="f">${isAg ? "Nom de l'agence" : 'Société ou organisme'}<input type="text" data-cf="nom" value="${esc(c.nom)}"></label>
      <label class="f">Adresse<input type="text" data-cf="adresse" value="${esc(c.adresse)}"></label><label class="f">Code postal<input type="text" data-cf="cp" value="${esc(c.cp)}" inputmode="numeric"></label>
      <label class="f">Ville<input type="text" data-cf="ville" value="${esc(c.ville)}"></label><label class="f">Téléphone (standard)<input type="tel" data-cf="tel" value="${esc(c.tel)}"></label>
      <label class="f">E-mail (général)<input type="email" data-cf="email" value="${esc(c.email)}"></label><label class="f">Site<input type="url" data-cf="site" value="${esc(c.site)}" placeholder="https://"></label>
      <label class="f">SIRET<input type="text" data-cf="siret" value="${esc(c.siret)}"></label>
      ${isAg ? `<label class="f">Inscription à l'Ordre (n°, région)<input type="text" data-cf="ordre" value="${esc(c.ordre)}"></label>` : `<label class="f">Lots ou corps d'état habituels<input type="text" data-cf="lots" value="${esc(lotsTxt(c))}" placeholder="02, 07"></label>`}</div>
      ${isAg ? `<div class="row" style="flex-wrap:wrap"><span class="small muted grow">Logo de l'agence (en tête des comptes-rendus et des listes de réserves)</span><img id="agLogo" alt="" style="max-height:44px;max-width:160px;display:${c.logoId ? 'block' : 'none'}"><button type="button" class="btn sm" id="agLogoB">${c.logoId ? 'Changer' : 'Ajouter un logo'}</button>${c.logoId ? '<button type="button" class="btn sm danger" id="agLogoX">Retirer</button>' : ''}</div>` : ''}
      <label class="f">Notes<textarea data-cf="notes" rows="2">${esc(c.notes)}</textarea></label>
      <div class="bar" style="margin:8px 0 0"><h3 class="grow fsec" style="margin:0">${isAg ? 'Architectes et collaborateurs' : 'Interlocuteurs (personnes)'}</h3><button type="button" class="btn sm" id="pAdd">+ Interlocuteur</button></div>
      <div class="list" id="pList">${c.personnes.map((p, i) => personHTML(p, i, isAg)).join('')}</div>`;
  }
  /* relie le formulaire à la fiche ; collect() recopie les champs dans la fiche */
  function bindForm(el, c, { isAg } = {}) {
    const collect = () => {
      $$('[data-cf]', el).forEach(i => { c[i.dataset.cf] = i.dataset.cf === 'lots' ? lotsParse(i.value) : i.value.trim(); });
      $$('[data-p]', el).forEach(d => { const p = c.personnes[+d.dataset.p]; $$('[data-pf]', d).forEach(i => { p[i.dataset.pf] = i.type === 'radio' ? i.checked : i.value.trim(); }); });
      if (c.personnes.length && !c.personnes.some(p => p.principal)) c.personnes[0].principal = true;
      return c;
    };
    const drawP = () => { $('#pList', el).innerHTML = c.personnes.map((p, i) => personHTML(p, i, isAg)).join(''); bindP(); };
    const bindP = () => $$('[data-prm]', el).forEach(b => b.onclick = () => { collect(); c.personnes.splice(+b.closest('[data-p]').dataset.p, 1); drawP(); });
    $('#pAdd', el).onclick = () => { collect(); c.personnes.push({ id: DB.uid(), civ: '', prenom: '', nom: '', fonction: '', mobile: '', tel: '', email: '', principal: !c.personnes.length }); drawP(); const n = $$('[data-p]', el).pop(); if (n) { $('[data-pf=prenom]', n).focus(); n.scrollIntoView({ block: 'center' }); } };
    bindP();
    if (isAg) {
      if (c.logoId) BlobURL(c.logoId).then(u => { if ($('#agLogo', el)) $('#agLogo', el).src = u; });
      $('#agLogoB', el).onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const blob = f.size < 1.5e6 ? f : (await shrinkImage(f, 800, .92)).blob; collect(); c.logoId = await DB.putBlob(blob); /* fichier d origine : transparence gardée */ el.dispatchEvent(new Event('redraw')); }; inp.click(); };
      if ($('#agLogoX', el)) $('#agLogoX', el).onclick = () => { collect(); c.logoId = ''; el.dispatchEvent(new Event('redraw')); };
    }
    return collect;
  }
  /* fiche dans une fenêtre ; rend la fiche enregistrée, ou null */
  function edit(c, { role, nom, fresh } = {}) {
    return new Promise(res => {
      const isNew = !c || !!fresh; c = c ? JSON.parse(JSON.stringify(c)) : { id: DB.uid(), role: role || 'ENT', nom: nom || '', adresse: '', cp: '', ville: '', tel: '', email: '', site: '', siret: '', lots: [], notes: '', personnes: [] };
      fix(c); if (isNew && !c.personnes.length) c.personnes.push({ id: DB.uid(), civ: '', prenom: '', nom: '', fonction: '', mobile: '', tel: '', email: '', principal: true });
      const isAg = !!c.agence, sh = sheet(isNew ? 'Nouveau contact' : c.nom || 'Contact', `<div id="cForm" style="display:flex;flex-direction:column;gap:10px">${formHTML(c, { isAg })}</div>`,
        `${isNew || isAg ? '' : '<button class="btn danger" id="cDel">Supprimer</button>'}<span class="grow"></span><button class="btn" data-close>Annuler</button><button class="btn pri" id="cOk">Enregistrer</button>`);
      const form = $('#cForm', sh.el); let collect = bindForm(form, c, { isAg }); let out = null;
      form.addEventListener('redraw', () => { form.innerHTML = formHTML(c, { isAg }); collect = bindForm(form, c, { isAg }); });
      $('[data-cf=nom]', sh.el).focus();
      $('#cOk', sh.el).onclick = async () => { collect(); if (!c.nom) return toast('Indiquez le nom de la société ou de l\'organisme'); c.personnes = c.personnes.filter(p => p.nom || p.prenom || p.email || p.mobile || p.tel); out = await put(c); sh.close(); };
      if ($('#cDel', sh.el)) $('#cDel', sh.el).onclick = async () => { if (!confirm(`Supprimer « ${c.nom} » du carnet ? Les chantiers gardent leur copie de ses coordonnées.`)) return; c.deleted = true; await put(c); out = null; sh.close(); };
      sh.bg.addEventListener('closed', () => res(out));
    });
  }
  /* choix dans le carnet : rend { c, pid } (organisme et interlocuteur), ou null */
  function pick({ role = '', title = 'Choisir dans le carnet', exclude = [], lot = '' } = {}) {
    return new Promise(res => {
      let flt = role ? roleCat(role) : '', q = '', out = null; const cOf = c => roleCat(c.agence ? 'MOE' : c.role);
      const sh = sheet(title, `<input type="search" id="kQ" placeholder="Rechercher (nom, ville, interlocuteur, lot)">
        <div class="levels" id="kR"></div><div class="list" id="kL"></div>`, `<button class="btn" id="kNew">+ Nouveau contact</button><span class="grow"></span><button class="btn" data-close>Annuler</button>`);
      const draw = () => {
        const hab = c => lot && c.lots.includes(lot) ? 1 : 0, L = sorted().filter(c => !exclude.includes(c.id)).sort((a, b) => hab(b) - hab(a));
        $('#kR', sh.el).innerHTML = `<button class="chip${!flt ? ' on' : ''}" data-r="">Tous (${L.length})</button>` + ROLE_CATS.map(([k]) => [k, L.filter(c => cOf(c) === k).length]).filter(x => x[1]).map(([k, n]) => `<button class="chip${flt === k ? ' on' : ''}" data-r="${k}">${esc(catName(k))} (${n})</button>`).join('');
        const nq = norm(q), list = L.filter(c => (!flt || cOf(c) === flt) && (!nq || norm([c.nom, c.ville, lotsTxt(c), ...c.personnes.map(fullName)].join(' ')).includes(nq)));
        $('#kL', sh.el).innerHTML = list.map(c => `<div class="card"><button type="button" class="ch pickrow" data-k="${c.id}" data-pp=""><span class="ico">${esc((c.agence ? 'MOE' : c.role).slice(0, 4))}</span><span class="grow" style="text-align:left"><b>${esc(c.nom)}</b>${hab(c) ? ` <span class="badge b-levee">lot ${esc(lot)} habituel</span>` : ''}<div class="small muted">${esc(resume(c))}</div></span></button>
          ${c.personnes.length > 1 ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px;padding-left:56px">${c.personnes.map(p => `<button type="button" class="chip" data-k="${c.id}" data-pp="${p.id}">${esc(fullName(p) || p.email || '?')}${p.fonction ? ' · ' + esc(p.fonction) : ''}</button>`).join('')}</div>` : ''}</div>`).join('')
          || `<div class="empty"><b>Aucun contact${flt ? ' dans ce rôle' : ''}</b>Ajoutez-le avec « Nouveau contact ».</div>`;
        $$('[data-r]', sh.el).forEach(b => b.onclick = () => { flt = b.dataset.r; draw(); });
        $$('[data-k]', sh.el).forEach(b => b.onclick = () => { out = { c: byId(b.dataset.k), pid: b.dataset.pp }; sh.close(); });
      };
      $('#kQ', sh.el).oninput = e => { q = e.target.value; draw(); };
      $('#kNew', sh.el).onclick = async () => { const c = await edit(null, { role: role || catRoles(flt)[0] || 'ENT', nom: q }); if (c) { out = { c, pid: '' }; sh.close(); } };
      draw(); sh.bg.addEventListener('closed', () => res(out));
    });
  }

  /* ---------- import et export ---------- */
  const ROLE_GUESS = [[/[ée]conomiste/i, 'ECO'], [/paysag/i, 'PAY'], [/ouvrage d.?ouvrage|^moa$|ma[iî]tre d.?ouvrage|client|bailleur|promoteur/i, 'MOA'], [/assistan|^amo$/i, 'AMO'], [/contr[oô]le|^bct$|bureau veritas|socotec|apave|qualiconsult|dekra/i, 'BCT'], [/sps|s[ée]curit[ée].*sant/i, 'CSPS'], [/\bopc\b|ordonnancement/i, 'OPC'], [/bet|[ée]tudes|ing[ée]nierie|fluides|structure|thermi|acousti|[ée]conomiste/i, 'BET'], [/archi|ma[iî]tr.*.oeuvre|ma[iî]trise d.?.uvre|^moe$/i, 'MOE'], [/concession|enedis|grdf|orange|eau de|veolia|suez/i, 'CONC'], [/utilisateur|exploitant|occupant|locataire/i, 'USR'], [/entreprise|^ent$|sous-traitant/i, 'ENT']];
  const guessRole = s => { s = String(s || ''); const k = ROLES.find(r => norm(r[0]) === norm(s) || norm(r[1]) === norm(s)); if (k) return k[0]; const g = ROLE_GUESS.find(([re]) => re.test(s)); return g ? g[1] : ''; };
  const COLS = { role: /^(r[ôo]le|type|cat[ée]gorie|qualit[ée])/i, nom: /soci[ée]t[ée]|entreprise|organisme|raison|structure|^nom de la|^compagnie|^company/i, prenom: /pr[ée]nom|first/i, pnom: /^nom$|^nom du contact|^last|^contact$|interlocuteur|^nom de famille/i, civ: /civilit/i, fonction: /fonction|poste|titre/i, mobile: /mobile|portable|gsm/i, tel: /t[ée]l|phone/i, email: /mail|courriel/i, adresse: /adresse|address|rue/i, cp: /code postal|^cp$|postal|zip/i, ville: /ville|commune|city/i, siret: /siret|siren/i, lots: /lot|corps/i, site: /site|web|url/i, notes: /note|remarque|comment/i };
  async function importFile(file) {
    let rows;
    if (/\.vcf$/i.test(file.name)) rows = vcfRows(await file.text());
    else { const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); }
    if (!rows.length) throw new Error('fichier vide');
    const heads = Object.keys(rows[0]), map = {};
    for (const [k, re] of Object.entries(COLS)) { const h = heads.find(h => re.test(h.trim()) && !Object.values(map).includes(h)); if (h) map[k] = h; }
    if (!map.nom && !map.pnom) throw new Error('aucune colonne « Société » ni « Nom » reconnue');
    const get = (r, k) => map[k] ? String(r[map[k]] ?? '').trim() : '';
    let made = 0, upd = 0; const touched = new Map();
    for (const r of rows) {
      const org = get(r, 'nom') || [get(r, 'prenom'), get(r, 'pnom')].filter(Boolean).join(' '); if (!org) continue;
      let c = touched.get(norm(org)) || all().find(x => norm(x.nom) === norm(org));
      if (!c) { c = fix({ id: DB.uid(), role: guessRole(get(r, 'role')) || guessRole(org) || 'ENT', nom: org, adresse: get(r, 'adresse'), cp: get(r, 'cp'), ville: get(r, 'ville'), tel: '', email: '', site: get(r, 'site'), siret: get(r, 'siret'), lots: lotsParse(get(r, 'lots')), notes: get(r, 'notes'), personnes: [] }); made++; }
      else if (!touched.has(norm(org))) upd++;
      touched.set(norm(org), c);
      const pr = { prenom: get(r, 'prenom'), nom: map.nom ? get(r, 'pnom') : '', civ: get(r, 'civ'), fonction: get(r, 'fonction'), mobile: get(r, 'mobile'), tel: get(r, 'tel'), email: get(r, 'email') };
      if (pr.prenom || pr.nom) { if (!c.personnes.some(p => norm(fullName(p)) === norm(fullName(pr)))) c.personnes.push({ id: DB.uid(), ...pr, principal: !c.personnes.length }); }
      else { c.tel = c.tel || pr.tel || pr.mobile; c.email = c.email || pr.email; }
      if (!c.lots.length && get(r, 'lots')) c.lots = lotsParse(get(r, 'lots'));
    }
    for (const c of touched.values()) await put(c);
    return { made, upd };
  }
  function vcfRows(txt) {
    return txt.split(/END:VCARD/i).map(b => { const v = k => { const m = b.match(new RegExp('^' + k + '[;:][^\\n]*', 'im')); return m ? m[0].replace(/^[^:]*:/, '').trim() : ''; }; const n = v('N').split(';');
      return { 'Société': v('ORG').split(';')[0] || v('FN'), 'Prénom': n[1] || '', 'Nom du contact': n[0] || '', 'Fonction': v('TITLE'), 'Mobile': (b.match(/^TEL[^:]*(CELL|MOBILE)[^:]*:(.*)$/im) || [])[2] || '', 'Téléphone': v('TEL'), 'E-mail': v('EMAIL'), 'Adresse': v('ADR').split(';').slice(2, 3).join(' '), 'Code postal': v('ADR').split(';')[5] || '', 'Ville': v('ADR').split(';')[3] || '' }; }).filter(r => r['Société']);
  }
  function exportXlsx() {
    const rows = []; for (const c of sorted()) { const base = { 'Rôle': c.agence ? 'Agence' : roleName(c.role), 'Société': c.nom, 'Adresse': c.adresse || '', 'Code postal': c.cp || '', 'Ville': c.ville || '', 'Téléphone société': c.tel || '', 'E-mail société': c.email || '', 'SIRET': c.siret || '', 'Lots': lotsTxt(c) };
      if (!c.personnes.length) rows.push({ ...base, 'Civilité': '', 'Prénom': '', 'Nom du contact': '', 'Fonction': '', 'Mobile': '', 'Téléphone': '', 'E-mail': '' });
      for (const p of c.personnes) rows.push({ ...base, 'Civilité': p.civ || '', 'Prénom': p.prenom || '', 'Nom du contact': p.nom || '', 'Fonction': p.fonction || '', 'Mobile': p.mobile || '', 'Téléphone': p.tel || '', 'E-mail': p.email || '' }); }
    const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [18, 30, 30, 10, 18, 15, 26, 16, 10, 8, 14, 18, 22, 15, 15, 28].map(w => ({ wch: w })); ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contacts'); XLSX.writeFile(wb, `TerraContacts - carnet ${today()}.xlsx`);
  }
  /* carnet au format d'échange TerraSuite (pour TerraEstim, TerraPlanning et les autres applications) */
  function exportJSON() {
    const data = { app: 'TerraContacts', format: 'terrasuite-contacts', version: 1, date: new Date().toISOString(), contacts: sorted().map(({ dirty, logoId, ...c }) => c) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = `TerraContacts - carnet ${today()}.json`; a.click();
  }
  /* reprend dans le carnet les intervenants saisis dans les chantiers (sans doublon de nom) et les relie */
  async function fromChantiers() {
    const chs = (await DB.all('chantiers')); let made = 0, linked = 0;
    for (const ch of chs) { let ch2 = false;
      for (const e of ch.entreprises || []) { if (e.contactId && byId(e.contactId)) continue; if (!e.nom) continue;
        let c = all().find(x => norm(x.nom) === norm(e.nom));
        if (!c) { c = await put(fix({ id: DB.uid(), role: e.role || 'ENT', nom: e.nom, adresse: '', cp: '', ville: '', tel: '', email: '', site: '', siret: '', lots: (ch.lots || []).filter(l => l.entrepriseId === e.id).map(l => l.code), notes: '', personnes: [] })); made++; }
        let p = c.personnes.find(x => e.contact && norm(fullName(x)) === norm(e.contact));
        if (!p && (e.contact || e.email || e.tel)) { const parts = String(e.contact || '').trim().split(/\s+/); p = { id: DB.uid(), civ: '', prenom: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', nom: parts.length > 1 ? parts.slice(-1)[0] : parts[0] || '', fonction: e.fonction || '', mobile: e.tel || '', tel: '', email: e.email || '', principal: !c.personnes.length }; c.personnes.push(p); await put(c); }
        e.contactId = c.id; e.personneId = p ? p.id : ''; ch2 = true; linked++; }
      if (ch2) await DB.put('chantiers', ch); }
    if (typeof Sync !== 'undefined') Sync.soon();
    return { made, linked };
  }
  return { load, all, sorted, byId, agence, architecte, principal, personne, fullName, put, edit, pick, asIntervenant, refreshChantier, formHTML, bindForm, importFile, exportXlsx, exportJSON, fromChantiers, resume, guessRole, lotsTxt };
})();
