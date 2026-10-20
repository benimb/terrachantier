/* TerraChantier : exports PDF (comptes-rendus, réserves) et Excel (réserves) */
const pdfTxt = s => String(s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, '"').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[  ]/g, ' ').replace(/→/g, '->').replace(/[^\x00-\xff]/g, '');
async function imgData(blobId, max = 1100) {
  const b = await DB.getBlob(blobId); if (!b) return null; const bm = await createImageBitmap(b), k = Math.min(1, max / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', .82), w: c.width, h: c.height };
}
function pdfDoc(title) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 14, ctx = { doc, y: M, W, M, title };
  ctx.need = h => { if (ctx.y + h > 297 - 16) { doc.addPage(); ctx.y = M + 4; } };
  ctx.text = (t, { size = 10, bold = false, color = [28, 31, 34], indent = 0, gap = 1.2, width } = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfTxt(t), width || (W - 2 * M - indent)), lh = size * .42; for (const l of lines) { ctx.need(lh + .5); doc.text(l, M + indent, ctx.y + lh * .8); ctx.y += lh; } ctx.y += gap; };
  ctx.rule = (c = [200, 194, 186]) => { doc.setDrawColor(...c); doc.setLineWidth(.25); doc.line(M, ctx.y, W - M, ctx.y); ctx.y += 2; };
  ctx.finish = name => { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(pdfTxt(`${title} · TerraChantier · ${S.ch.moe || 'TERRAFORM'}`), M, 297 - 8); doc.text(`${i} / ${n}`, W - M, 297 - 8, { align: 'right' }); } doc.save(pdfTxt(name) + '.pdf'); };
  return ctx;
}
function pdfHeader(ctx, big, lines) {
  const { doc, M, W } = ctx; doc.setFillColor(122, 79, 176); doc.rect(M, ctx.y, W - 2 * M, 1.4, 'F'); ctx.y += 5;
  ctx.text(big, { size: 16, bold: true, gap: 1 }); ctx.text(S.ch.nom, { size: 12, bold: true, gap: .5 });
  ctx.text([S.ch.adresse, S.ch.moa && "Maître d'ouvrage : " + S.ch.moa, S.ch.moe && "Maître d'oeuvre : " + S.ch.moe].filter(Boolean).join(' · '), { size: 9, color: [100, 104, 108], gap: 1.5 });
  for (const l of lines.filter(Boolean)) ctx.text(l, { size: 9.5, gap: .3 }); ctx.y += 2; ctx.rule();
}
/* photos d'un bloc : trois par ligne, légende dessous ; extrait de plan quand elles sont localisées */
async function pdfPhotos(ctx, ids, numStart = 1) {
  const ph = ids.map(photoById).filter(Boolean); if (!ph.length) return;
  const { doc, M, W } = ctx, gap = 3, cw = (W - 2 * M - 2 * gap) / 3;
  for (let i = 0; i < ph.length; i += 3) {
    const row = ph.slice(i, i + 3), ims = await Promise.all(row.map(p => imgData(p.blobId))), hs = ims.map(im => im ? Math.min(cw * im.h / im.w, cw * 1.05) : 0), rh = Math.max(...hs) + 6;
    ctx.need(rh + 2);
    row.forEach((p, k) => { const im = ims[k]; if (!im) return; const w = Math.min(cw, hs[k] * im.w / im.h), x = M + k * (cw + gap) + (cw - w) / 2; doc.addImage(im.url, 'JPEG', x, ctx.y, w, hs[k]);
      doc.setFontSize(7.5); doc.setTextColor(90); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(pdfTxt(`${numStart + i + k}. ${p.legende || fmtD(p.date)}${p.planId && planById(p.planId) ? ' (' + planById(p.planId).nom + ')' : ''}`), cw)[0], M + k * (cw + gap), ctx.y + hs[k] + 3.6); });
    ctx.y += rh;
  }
  const byPlan = new Map(); ph.forEach((p, k) => { if (p.planId && planById(p.planId)) { if (!byPlan.has(p.planId)) byPlan.set(p.planId, []); byPlan.get(p.planId).push({ x: p.x, y: p.y, dir: p.dir, label: numStart + k, color: '#2f6fb5' }); } });
  for (const [pid, pts] of byPlan) { const pl = planById(pid), u = await planExtract(pl, pts, 900, 420), h = (W - 2 * M) * 420 / 900 * .62; ctx.need(h + 6); doc.addImage(u, 'JPEG', M, ctx.y, (W - 2 * M) * .62, h); doc.setFontSize(7.5); doc.setTextColor(90); doc.text(pdfTxt('Localisation : ' + pl.nom), M + (W - 2 * M) * .62 + 3, ctx.y + 4); ctx.y += h + 3; }
}
async function exportCR(v) {
  toast('Préparation du PDF…'); const ctx = pdfDoc(`CR n° ${v.numero} du ${fmtD(v.date)}`), { doc, M, W } = ctx;
  pdfHeader(ctx, `Compte-rendu de chantier n° ${v.numero}`, [`Visite du ${fmtDL(v.date)}${v.heure ? ' à ' + v.heure.replace(':', ' h ') : ''}${v.meteo ? ' · météo : ' + v.meteo : ''}`, v.redacteur && 'Rédigé par ' + v.redacteur]);
  // présences
  const ents = S.ch.entreprises || [];
  if (ents.length) { ctx.text('Présences', { size: 11.5, bold: true, gap: 1.5 }); const cols = [M, M + 62, M + 104, M + 158];
    doc.setFontSize(8); doc.setTextColor(110); doc.setFont('helvetica', 'bold'); ['Entreprise', 'Lots', 'Contact', 'Présence'].forEach((t, i) => doc.text(t, cols[i], ctx.y + 3)); ctx.y += 5;
    for (const e of ents) { ctx.need(6); const st = { P: 'Présent', A: 'Absent', E: 'Excusé' }[(v.presents || {})[e.id]] || '-'; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30);
      doc.text(doc.splitTextToSize(pdfTxt(e.nom), 58)[0], cols[0], ctx.y + 3.5); doc.text(doc.splitTextToSize(pdfTxt(lotsOf().filter(l => l.entrepriseId === e.id).map(l => l.code).join(', ')), 40)[0] || '', cols[1], ctx.y + 3.5); doc.text(doc.splitTextToSize(pdfTxt(e.contact || ''), 52)[0] || '', cols[2], ctx.y + 3.5);
      doc.setTextColor(...(st === 'Présent' ? [47, 143, 91] : st === 'Absent' ? [194, 65, 12] : [110, 110, 110])); doc.text(st, cols[3], ctx.y + 3.5); ctx.y += 5.2; doc.setDrawColor(230); doc.line(M, ctx.y, W - M, ctx.y); }
    ctx.y += 3; }
  if (v.autres) ctx.text('Autres participants : ' + v.autres, { size: 9.5, gap: 3 });
  ctx.rule();
  // observations par lot
  ctx.text('Observations', { size: 11.5, bold: true, gap: 2 });
  const groups = new Map(); for (const o of v.observations || []) { const k = o.lotId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
  const keys = [...groups.keys()].sort((a, b) => (lotById(a) ? lotById(a).code : '~').localeCompare(lotById(b) ? lotById(b).code : '~'));
  if (!keys.length) ctx.text('Aucune observation.', { size: 9.5, color: [110, 110, 110] });
  let nph = 1;
  for (const k of keys) {
    const l = lotById(k), ent = l && entById(l.entrepriseId); ctx.need(14); doc.setFillColor(240, 235, 247); doc.rect(M, ctx.y, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(90, 55, 140);
    doc.text(pdfTxt(l ? `Lot ${l.code} - ${l.nom}` : 'Généralités'), M + 2, ctx.y + 4.9); if (ent) { doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(pdfTxt(ent.nom), W - M - 2, ctx.y + 4.9, { align: 'right' }); } ctx.y += 9.5;
    for (const o of groups.get(k)) {
      const st = OBS_ST[o.statut] || '', col = o.statut === 'fait' ? [47, 143, 91] : o.statut === 'info' ? [47, 111, 181] : [194, 65, 12];
      ctx.need(10); doc.setFillColor(...col); doc.rect(M, ctx.y + .6, 1.2, 4, 'F');
      ctx.text(o.texte || '(sans texte)', { size: 10, indent: 4, gap: .4 });
      ctx.text([st, o.echeance && 'échéance : ' + fmtD(o.echeance), o.origine && 'depuis le CR n° ' + o.origine].filter(Boolean).join(' · '), { size: 8.5, color: col, indent: 4, gap: 1.6 });
      if ((o.photoIds || []).length) { await pdfPhotos(ctx, o.photoIds, nph); nph += o.photoIds.length; ctx.y += 1; }
      ctx.y += 1.5;
    }
  }
  ctx.rule(); if (v.prochaine) ctx.text('Prochaine réunion : ' + v.prochaine, { size: 10, bold: true, gap: 2 }); if (v.diffusion) ctx.text('Diffusion : ' + v.diffusion, { size: 9, color: [90, 90, 90] });
  ctx.finish(`${S.ch.code || S.ch.nom} - CR ${String(v.numero).padStart(2, '0')} du ${v.date}`);
  v.diffuseLe = v.diffuseLe || today(); await save('visites', v);
}
async function exportReserves(list, F = {}) {
  if (!list.length) return toast('Aucune réserve à exporter'); toast('Préparation du PDF…');
  const ctx = pdfDoc('Liste des réserves'), { doc, M, W } = ctx, groups = new Map();
  for (const r of list) { const k = r.lotId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  pdfHeader(ctx, 'Liste des réserves', [`Édition du ${fmtDL(today())} · ${list.length} réserve(s)${F.statut ? ' · ' + RES_ST[F.statut].toLowerCase() + 's' : ''}${F.phase ? ' · ' + PHASES[F.phase] : ''}`]);
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
