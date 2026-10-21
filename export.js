/* TerraChantier : exports PDF (comptes-rendus, réserves, photos par destinataire) et Excel (réserves) */
const pdfTxt = s => String(s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, '"').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[  ]/g, ' ').replace(/→/g, '->').replace(/[^\x00-\xff]/g, '');
async function imgData(blobId, max = 1100) {
  const b = (await DB.getBlob(blobId)) || (typeof Sync !== 'undefined' ? await Sync.fetchBlob(blobId) : null); if (!b) return null; const bm = await createImageBitmap(b), k = Math.min(1, max / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height); // fond blanc : logos transparents
  return { url: c.toDataURL('image/jpeg', .82), w: c.width, h: c.height };
}
function pdfDoc(title) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 14, ctx = { doc, y: M, W, M, title };
  ctx.need = h => { if (ctx.y + h > 297 - 16) { doc.addPage(); ctx.y = M + 4; } };
  ctx.text = (t, { size = 10, bold = false, color = [28, 31, 34], indent = 0, gap = 1.2, width } = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfTxt(t), width || (W - 2 * M - indent)), lh = size * .42; for (const l of lines) { ctx.need(lh + .5); doc.text(l, M + indent, ctx.y + lh * .8); ctx.y += lh; } ctx.y += gap; };
  ctx.rule = (c = [200, 194, 186]) => { doc.setDrawColor(...c); doc.setLineWidth(.25); doc.line(M, ctx.y, W - M, ctx.y); ctx.y += 2; };
  ctx.finish = name => { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(pdfTxt(`${title} · ${(Carnet.agence() || {}).nom || S.ch.moe || ''} · TerraChantier`), M, 297 - 8); doc.text(`${i} / ${n}`, W - M, 297 - 8, { align: 'right' }); } doc.save(pdfTxt(name) + '.pdf'); };
  return ctx;
}
async function pdfHeader(ctx, big, lines) {
  const { doc, M, W } = ctx, ag = Carnet.agence(), logo = ag && ag.logoId ? await imgData(ag.logoId, 500) : null;
  if (logo) { const h = 14, w = Math.min(50, h * logo.w / logo.h); doc.addImage(logo.url, 'JPEG', W - M - w, ctx.y, w, w * logo.h / logo.w); }
  if (ag) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110); doc.text(doc.splitTextToSize(pdfTxt([ag.nom, ag.adresse, [ag.cp, ag.ville].filter(Boolean).join(' '), ag.tel, ag.email].filter(Boolean).join(' · ')), logo ? W - 2 * M - 56 : W - 2 * M)[0], M, ctx.y + 3); ctx.y += logo ? 16 : 6; }
  doc.setFillColor(122, 79, 176); doc.rect(M, ctx.y, W - 2 * M, 1.4, 'F'); ctx.y += 5;
  ctx.text(big, { size: 16, bold: true, gap: 1 }); ctx.text(S.ch.nom, { size: 12, bold: true, gap: .5 });
  ctx.text([S.ch.adresse, S.ch.moa && "Maître d'ouvrage : " + S.ch.moa, S.ch.moe && "Maître d'oeuvre : " + S.ch.moe].filter(Boolean).join(' · '), { size: 9, color: [100, 104, 108], gap: 1.5 });
  for (const l of lines.filter(Boolean)) ctx.text(l, { size: 9.5, gap: .3 }); ctx.y += 2; ctx.rule();
}
/* photos d'un bloc : trois par ligne, légende dessous ; extrait de plan quand elles sont localisées */
async function pdfPhotos(ctx, ids, numStart = 1, ref = '') {
  const ph = ids.map(photoById).filter(Boolean); if (!ph.length) return;
  const { doc, M, W } = ctx, gap = 3, cw = (W - 2 * M - 2 * gap) / 3;
  for (let i = 0; i < ph.length; i += 3) {
    const row = ph.slice(i, i + 3), ims = await Promise.all(row.map(p => imgData(p.blobId))), hs = ims.map(im => im ? Math.min(cw * im.h / im.w, cw * 1.05) : 0);
    doc.setFontSize(7.5); const caps = row.map((p, k) => doc.splitTextToSize(pdfTxt(`Ph. ${numStart + i + k}${ref ? ' (' + ref + ')' : ''} - ${[phLoc(p), phTxt(p)].filter(Boolean).join(' : ') || fmtD(p.date)}`), cw).slice(0, 3));
    const rh2 = Math.max(...hs) + 2.5 + 3.1 * Math.max(...caps.map(c => c.length)); ctx.need(rh2 + 2);
    row.forEach((p, k) => { const im = ims[k]; if (!im) return; const w = Math.min(cw, hs[k] * im.w / im.h), x = M + k * (cw + gap) + (cw - w) / 2; doc.addImage(im.url, 'JPEG', x, ctx.y, w, hs[k]);
      doc.setFontSize(7.5); doc.setTextColor(90); doc.setFont('helvetica', 'normal'); caps[k].forEach((l, j) => doc.text(l, M + k * (cw + gap), ctx.y + hs[k] + 3.4 + j * 3.1)); });
    ctx.y += rh2;
  }
  const byPlan = new Map(); ph.forEach((p, k) => { if (p.planId && planById(p.planId)) { if (!byPlan.has(p.planId)) byPlan.set(p.planId, []); byPlan.get(p.planId).push({ x: p.x, y: p.y, dir: p.dir, label: numStart + k, color: '#2f6fb5' }); } });
  for (const [pid, pts] of byPlan) { const pl = planById(pid), u = await planExtract(pl, pts, 900, 420), h = (W - 2 * M) * 420 / 900 * .62; ctx.need(h + 6); doc.addImage(u, 'JPEG', M, ctx.y, (W - 2 * M) * .62, h); doc.setFontSize(7.5); doc.setTextColor(90); doc.text(pdfTxt('Localisation : ' + pl.nom), M + (W - 2 * M) * .62 + 3, ctx.y + 4); ctx.y += h + 3; }
}
async function exportCR(v) {
  toast('Préparation du PDF…'); const ctx = pdfDoc(`${crName(v.numero)} du ${fmtD(v.date)}`), { doc, M, W } = ctx;
  const em = emetteurOf(v);
  await pdfHeader(ctx, `Compte-rendu de chantier ${crName(v.numero)}`, [`Visite du ${fmtDL(v.date)}${v.heure ? ' à ' + v.heure.replace(':', ' h ') : ''}${v.meteo ? ' · météo : ' + v.meteo : ''}`, em && 'Émetteur : ' + entLabel(em), v.redacteur && 'Rédigé par ' + v.redacteur]);
  // première page : présences, convocations, prochaine réunion
  const ents = crEnts(v);
  if (ents.length) { ctx.text('Présences et convocations', { size: 11.5, bold: true, gap: 1 }); ctx.text('O présent · N absent · R en retard · E excusé', { size: 7.5, color: [120, 120, 120], gap: 1.5 });
    const cols = [M, M + 55, M + 85, M + 135, M + 158];
    doc.setFontSize(7.5); doc.setTextColor(110); doc.setFont('helvetica', 'bold'); ['Organisme', 'Rôle', 'Interlocuteur', 'Présence', 'Convoqué prochaine réunion'].forEach((t, i) => doc.text(doc.splitTextToSize(pdfTxt(t), i === 4 ? W - M - cols[4] : 40), cols[i], ctx.y + 3)); ctx.y += 8;
    let lastRole = null;
    for (const e of ents) { ctx.need(6); const p = presOf(v, e.id), st = PRES[p] || '-', cv = convNext(v, e);
      if (roleCat(e.role) !== lastRole) { lastRole = roleCat(e.role); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(90, 55, 140); doc.text(pdfTxt(catName(lastRole)), M, ctx.y + 3.3); ctx.y += 4.6; }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30);
      const lots = e.role === 'ENT' ? lotsOf().filter(l => l.entrepriseId === e.id).map(l => l.code).join(', ') : '';
      doc.text(doc.splitTextToSize(pdfTxt(e.nom), 53)[0] || '', cols[0], ctx.y + 3.5); doc.text(doc.splitTextToSize(pdfTxt(e.role === 'ENT' ? (lots ? 'Lot ' + lots : 'Entreprise') : roleName(e.role)), 28)[0] || '', cols[1], ctx.y + 3.5); doc.text(doc.splitTextToSize(pdfTxt([e.contact, e.fonction].filter(Boolean).join(', ')), 48)[0] || '', cols[2], ctx.y + 3.5);
      doc.setTextColor(...(p === 'O' ? [47, 143, 91] : p === 'N' ? [194, 65, 12] : p === 'R' ? [190, 130, 10] : [110, 110, 110])); doc.setFont('helvetica', 'bold'); doc.text(p || '-', cols[3], ctx.y + 3.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); if (p) doc.text(pdfTxt(st), cols[3] + 4, ctx.y + 3.5);
      doc.setFontSize(9); doc.setTextColor(...(cv ? [30, 30, 30] : [150, 150, 150])); doc.text(cv ? 'Oui' : 'Non', cols[4], ctx.y + 3.5);
      ctx.y += 5.2; doc.setDrawColor(230); doc.line(M, ctx.y, W - M, ctx.y); }
    ctx.y += 3; }
  if (v.autres) ctx.text('Autres participants : ' + v.autres, { size: 9.5, gap: 3 });
  if (v.prochaine) { ctx.rule(); ctx.text('Prochaine réunion : ' + v.prochaine, { size: 10.5, bold: true, gap: 1 }); const conv = ents.filter(e => convNext(v, e)).map(e => e.nom); if (conv.length) ctx.text('Convoqués : ' + conv.join(', '), { size: 9, color: [80, 80, 80], gap: 2 }); }
  const qs = v.observations || [], cnt = s => qs.filter(o => qSect(v, o) === s).length;
  ctx.rule(); ctx.text(`Questions : ${cnt('jour')} du jour, ${cnt('encours')} en cours, ${cnt('reglees')} réglée(s) à cette réunion. Numérotation : C03.04 = 4e question posée au compte-rendu n° 3.`, { size: 8.5, color: [100, 100, 100] });
  // questions : du jour, en cours, réglées ; par lot
  doc.addPage(); ctx.y = M + 4;
  const lotKey = k => lotById(k) ? lotById(k).code : '~'; let nph = 1;
  for (const [sk, st] of Q_SECT) {
    const list = qs.filter(o => qSect(v, o) === sk).sort((a, b) => lotKey(a.lotId).localeCompare(lotKey(b.lotId)) || (a.cr - b.cr) || (a.seq - b.seq));
    ctx.need(22); doc.setFillColor(122, 79, 176); doc.rect(M, ctx.y, W - 2 * M, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255); doc.text(pdfTxt(`${st} (${list.length})`), M + 2.5, ctx.y + 5.5); ctx.y += 11;
    if (!list.length) { ctx.text(sk === 'jour' ? 'Aucune question posée à cette réunion.' : sk === 'encours' ? 'Aucune question en cours.' : 'Aucune question réglée à cette réunion.', { size: 9, color: [120, 120, 120], gap: 3 }); continue; }
    let last = null;
    for (const o of list) {
      if (o.lotId !== last) { last = o.lotId; const l = lotById(o.lotId), ent = l && entById(l.entrepriseId); ctx.need(18); doc.setFillColor(240, 235, 247); doc.rect(M, ctx.y, W - 2 * M, 6.5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(90, 55, 140);
        doc.text(pdfTxt(l ? `Lot ${l.code} - ${l.nom}` : 'Généralités'), M + 2, ctx.y + 4.5); if (ent) { doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(pdfTxt(ent.nom), W - M - 2, ctx.y + 4.5, { align: 'right' }); } ctx.y += 8.5; }
      const col = o.statut === 'fait' ? [47, 143, 91] : o.statut === 'info' ? [47, 111, 181] : [194, 65, 12];
      ctx.need(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...col); doc.text(qNum(o), M, ctx.y + 3.6);
      if (o.localisation) ctx.text(o.localisation, { size: 8.5, bold: true, color: [90, 55, 140], indent: 19, gap: .2 });
      ctx.text(o.texte || '(sans texte)', { size: 10, indent: 19, gap: .4 });
      ctx.text(`De : ${entLabel(qEm(o)) || '-'}   >   À : ${qDestLabel(o)}`, { size: 8, color: [70, 70, 70], indent: 19, gap: .3 });
      ctx.text([OBS_ST[o.statut], o.statut === 'fait' && o.regleeAu ? 'au ' + crName(o.regleeAu) : '', o.echeance && o.statut !== 'fait' ? 'échéance : ' + fmtD(o.echeance) : '', o.cr && o.cr < v.numero ? 'posée au ' + crName(o.cr) : '', o.photosCR && !(o.photoIds || []).length ? 'photos au ' + crName(o.photosCR) : ''].filter(Boolean).join(' · '), { size: 8, color: col, indent: 19, gap: 1.4 });
      if ((o.photoIds || []).length) { await pdfPhotos(ctx, o.photoIds, nph, qNum(o)); nph += o.photoIds.length; ctx.y += 1; }
      doc.setDrawColor(232); doc.line(M + 19, ctx.y, W - M, ctx.y); ctx.y += 2.5;
    }
    ctx.y += 3;
  }
  ctx.rule(); const dest = intervenants().filter(e => e.convoque !== false).map(e => e.nom + (e.contact ? ' (' + e.contact + ')' : '')); if (dest.length || v.diffusion) ctx.text('Diffusion : ' + [dest.join(', '), v.diffusion].filter(Boolean).join(' ; '), { size: 9, color: [90, 90, 90] });
  ctx.finish(`${S.ch.code || S.ch.nom} - ${crName(v.numero)} du ${v.date}`);
  v.diffuseLe = v.diffuseLe || today(); await save('visites', v);
}
async function exportReserves(list, F = {}) {
  if (!list.length) return toast('Aucune réserve à exporter'); toast('Préparation du PDF…');
  const ctx = pdfDoc('Liste des réserves'), { doc, M, W } = ctx, groups = new Map();
  for (const r of list) { const k = r.lotId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  await pdfHeader(ctx, 'Liste des réserves', [`Édition du ${fmtDL(today())} · ${list.length} réserve(s)${F.statut ? ' · ' + RES_ST[F.statut].toLowerCase() + 's' : ''}${F.phase ? ' · ' + PHASES[F.phase] : ''}`]);
  const keys = [...groups.keys()].sort((a, b) => (lotById(a) ? lotById(a).code : '~').localeCompare(lotById(b) ? lotById(b).code : '~'));
  for (const k of keys) {
    const l = lotById(k), ent = l && entById(l.entrepriseId); ctx.need(16); doc.setFillColor(240, 235, 247); doc.rect(M, ctx.y, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(90, 55, 140);
    doc.text(pdfTxt(l ? `Lot ${l.code} - ${l.nom}` : 'Sans lot'), M + 2, ctx.y + 4.9); if (ent) { doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(pdfTxt(ent.nom), W - M - 2, ctx.y + 4.9, { align: 'right' }); } ctx.y += 10;
    for (const r of groups.get(k)) {
      const ph = (r.photoIds || []).map(photoById).filter(Boolean)[0], plan = planById(r.planId), bw = (W - 2 * M - 4) / 2, bh = 48;
      ctx.need(14 + (ph || plan ? bh : 0));
      const col = r.statut === 'levee' ? [47, 143, 91] : r.statut === 'refusee' ? [91, 59, 138] : [194, 65, 12];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30); doc.text(`N° ${r.numero}`, M, ctx.y + 4); doc.setTextColor(...col); doc.setFontSize(9); doc.text(pdfTxt(RES_ST[r.statut] + (r.statut === 'levee' && r.dateLevee ? ' le ' + fmtD(r.dateLevee) : '')), W - M, ctx.y + 4, { align: 'right' }); ctx.y += 6;
      ctx.text(r.description || '(sans description)', { size: 10, gap: .4 });
      ctx.text([plan && plan.nom, r.localisation, PHASES[r.phase], r.dateConstat && 'constatée le ' + fmtD(r.dateConstat), r.echeance && 'à lever avant le ' + fmtD(r.echeance)].filter(Boolean).join(' · '), { size: 8.5, color: [100, 100, 100], gap: 1.5 });
      if (r.commentaire) ctx.text(r.commentaire, { size: 8.5, color: [80, 80, 80], gap: 1.5 });
      if (ph || plan) { ctx.need(bh + 2); let x = M;
        if (ph) { const im = await imgData(ph.blobId, 900); if (im) { const w = Math.min(bw, bh * im.w / im.h); doc.addImage(im.url, 'JPEG', x, ctx.y, w, Math.min(bh, w * im.h / im.w)); } x += bw + 4; }
        if (plan && r.x != null) { const u = await planExtract(plan, [{ x: r.x, y: r.y, label: r.numero, color: r.statut === 'levee' ? '#2f8f5b' : '#c2410c' }], 760, 470, 1100); doc.addImage(u, 'JPEG', x, ctx.y, bw, bw * 470 / 760 > bh ? bh : bw * 470 / 760); }
        ctx.y += bh + 3; }
      doc.setDrawColor(225); doc.line(M, ctx.y, W - M, ctx.y); ctx.y += 3;
    }
  }
  ctx.finish(`${S.ch.code || S.ch.nom} - réserves ${today()}`);
}
function exportReservesXlsx(list) {
  if (!list.length) return toast('Aucune réserve à exporter');
  const rows = list.map(r => { const l = lotById(r.lotId), e = l && entById(l.entrepriseId); return { 'N°': r.numero, Lot: l ? l.code : '', Intitulé: l ? l.nom : '', Entreprise: e ? e.nom : '', Description: r.description, Niveau: (planById(r.planId) || {}).nom || '', Localisation: r.localisation, Phase: PHASES[r.phase] || '', Statut: RES_ST[r.statut], 'Constatée le': r.dateConstat || '', 'À lever avant le': r.echeance || '', 'Levée le': r.dateLevee || '', Photos: (r.photoIds || []).length, Commentaire: r.commentaire || '' }; });
  const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [6, 6, 26, 24, 50, 14, 22, 18, 10, 12, 14, 12, 7, 30].map(w => ({ wch: w })); ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Réserves'); XLSX.writeFile(wb, `${S.ch.code || S.ch.nom} - réserves ${today()}.xlsx`);
}

/* photos par destinataire : une fiche par photo (texte, localisation, lot, émetteur), avec l'extrait de plan */
async function exportPhotos(list) {
  if (!list.length) return toast('Aucune photo à exporter'); toast('Préparation du PDF…');
  const groups = new Map(), none = [];
  for (const p of list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))) { const d = phDest(p); if (!d.length) none.push(p); for (const e of d) { if (!groups.has(e.id)) groups.set(e.id, []); groups.get(e.id).push(p); } }
  const ctx = pdfDoc('Photos par destinataire'), { doc, M, W } = ctx, em = emetteurOf();
  await pdfHeader(ctx, 'Photos et observations', [`Édition du ${fmtDL(today())} · ${list.length} photo(s)`, em && 'Émetteur : ' + entLabel(em)]);
  const keys = [...groups.keys()].sort((a, b) => roleRank(entById(a).role) - roleRank(entById(b).role) || entById(a).nom.localeCompare(entById(b).nom));
  const block = async p => {
    const im = await imgData(p.blobId, 1000), iw = 82, ih = im ? Math.min(62, iw * im.h / im.w) : 0, tx = M + iw + 5, tw = W - M - tx, plan = planById(p.planId);
    ctx.need(Math.max(ih, 30) + 6); const y0 = ctx.y;
    if (im) { const w = Math.min(iw, ih * im.w / im.h); doc.addImage(im.url, 'JPEG', M, y0, w, ih); }
    let y = y0 + 3.5; const line = (t, { size = 9, bold = false, color = [30, 30, 30] } = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); for (const l of doc.splitTextToSize(pdfTxt(t), tw)) { doc.text(l, tx, y); y += size * .42; } y += 1; };
    line(`${fmtDL(p.date)} à ${fmtT(p.date)}`, { size: 8, color: [110, 110, 110] });
    if (phLoc(p)) line(phLoc(p), { size: 10, bold: true, color: [90, 55, 140] });
    if (p.lotId) line('Lot ' + lotLabel(p.lotId), { size: 8.5, color: [90, 90, 90] });
    line(phTxt(p) || '(texte à compléter)', { size: 10 });
    line(['De : ' + entLabel(emetteurOf(p)), phDest(p).length ? 'À : ' + phDest(p).map(entLabel).join(', ') : ''].filter(Boolean).join('\n'), { size: 8, color: [100, 100, 100] });
    if (plan && p.x != null && y < y0 + ih - 30) { const u = await planExtract(plan, [{ x: p.x, y: p.y, dir: p.dir, label: '', color: '#2f6fb5' }], 760, 400, 1100), ph = Math.min(y0 + ih - y, tw * 400 / 760); doc.addImage(u, 'JPEG', tx, y, ph * 760 / 400, ph); y += ph + 1; }
    ctx.y = Math.max(y0 + ih, y) + 3; doc.setDrawColor(225); doc.line(M, ctx.y, W - M, ctx.y); ctx.y += 3;
  };
  const head = (t, sub) => { ctx.need(20); doc.setFillColor(240, 235, 247); doc.rect(M, ctx.y, W - 2 * M, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(90, 55, 140); doc.text(pdfTxt(t), M + 2, ctx.y + 5.4); if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100); doc.text(pdfTxt(sub), W - M - 2, ctx.y + 5.4, { align: 'right' }); } ctx.y += 11; };
  for (const k of keys) { const e = entById(k); head('À : ' + entLabel(e), [roleName(e.role), e.email, e.tel].filter(Boolean).join(' · ')); for (const p of groups.get(k)) await block(p); }
  if (none.length) { head('Sans destinataire (à compléter)'); for (const p of none) await block(p); }
  ctx.finish(`${S.ch.code || S.ch.nom} - photos ${today()}`);
}
