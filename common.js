/* TerraSuite : outils communs aux applications en ligne (TerraChantier, TerraContacts) */
const $ = (q, el = document) => el.querySelector(q), $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dayOf = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtD = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDL = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtT = d => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>', cam: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>', img: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>'
};
const DEFAULT_LOTS = [['00', 'Généralités'], ['01', 'Démolition, désamiantage'], ['02', 'Gros œuvre, maçonnerie'], ['03', 'Charpente, couverture'], ['04', 'Étanchéité'], ['05', 'Menuiseries extérieures'], ['06', 'Serrurerie, métallerie'], ['07', 'Plâtrerie, cloisons, faux plafonds'], ['08', 'Menuiseries intérieures'], ['09', 'Revêtements de sols et murs'], ['10', 'Peinture'], ['11', 'Électricité courants forts et faibles'], ['12', 'Plomberie, sanitaires'], ['13', 'Chauffage, ventilation, climatisation'], ['14', 'Ascenseurs'], ['15', 'VRD, espaces verts']];
const ROLES = [['MOA', "Maître d'ouvrage"], ['AMO', "Assistance à maîtrise d'ouvrage"], ['MOE', "Maîtrise d'œuvre"], ['BET', "Bureau d'études"], ['BCT', 'Bureau de contrôle'], ['CSPS', 'Coordination SPS'], ['OPC', 'OPC'], ['ENT', 'Entreprise'], ['USR', 'Utilisateur, exploitant'], ['CONC', 'Concessionnaire'], ['AUT', 'Autre']];
const roleName = k => (ROLES.find(r => r[0] === k) || ROLES[ROLES.length - 1])[1], roleRank = k => { const i = ROLES.findIndex(r => r[0] === k); return i < 0 ? 99 : i; };

function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function sheet(title, body, foot = '', { wide } = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"${wide ? ' style="max-width:1100px"' : ''} role="dialog" aria-modal="true"><header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${ICON.x}</button></header><div class="body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div>`;
  document.body.appendChild(bg); document.body.style.overflow = 'hidden';
  const close = () => { bg.remove(); if (!$('.sheet-bg')) document.body.style.overflow = ''; bg.dispatchEvent(new Event('closed')); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  return { el: bg.querySelector('.sheet'), bg, close };
}
/* enregistrement d'un service worker commun (mise à jour automatique) */
function registerSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const had = !!navigator.serviceWorker.controller; let done = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(e => console.warn('SW', e));
}
