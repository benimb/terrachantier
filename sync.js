/* TerraChantier : synchronisation entre appareils (Supabase : base partagée + stockage des photos et des plans).
   Hors réseau, tout reste enregistré sur l'appareil ; l'envoi et la réception reprennent dès que le réseau revient.
   En cas de modification d'une même fiche sur deux appareils, la plus récente l'emporte. */
const SYNC_SQL = `-- TerraChantier : à exécuter une fois dans Supabase (SQL Editor)
create table if not exists public.tc_items (
  id uuid primary key, store text not null, chantier_id uuid, data jsonb not null,
  updated_at timestamptz not null, deleted boolean not null default false, server_at timestamptz not null default now());
create index if not exists tc_items_server_at on public.tc_items (server_at);
create or replace function public.tc_touch() returns trigger language plpgsql as $$ begin new.server_at := clock_timestamp(); return new; end $$;
drop trigger if exists tc_touch on public.tc_items;
create trigger tc_touch before insert or update on public.tc_items for each row execute function public.tc_touch();
alter table public.tc_items enable row level security;
drop policy if exists tc_team on public.tc_items;
create policy tc_team on public.tc_items for all to authenticated using (true) with check (true);
insert into storage.buckets (id, name, public) values ('tc-blobs', 'tc-blobs', false) on conflict (id) do nothing;
drop policy if exists tc_blobs_team on storage.objects;
create policy tc_blobs_team on storage.objects for all to authenticated using (bucket_id = 'tc-blobs') with check (bucket_id = 'tc-blobs');`;

const Sync = (() => {
  let sb = null, cfg = null, state = 'off', msg = 'Synchronisation non configurée', timer = null, busy = false, again = false;
  const set = (s, m) => { state = s; msg = m; paint(); };
  function paint() { const el = document.getElementById('syncSt'); if (!el) return; el.className = 'sync ' + ({ ok: 'ok', run: 'wait', wait: 'wait', err: 'err' }[state] || ''); el.title = msg; }
  async function config() { if (!cfg) cfg = (await DB.meta('sync')) || {}; return cfg; }
  async function client() {
    await config(); if (!cfg.url || !cfg.key || !window.supabase) return null;
    if (!sb) sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tc-auth' } });
    return sb;
  }
  async function session() { const c = await client(); if (!c) return null; const { data } = await c.auth.getSession(); return data.session; }
  /* envoi des fiches modifiées, puis des images, puis réception */
  async function run() {
    if (busy) { again = true; return; } const c = await client(); if (!c) return set('off', 'Synchronisation non configurée (Réglages)');
    if (!navigator.onLine) return set('wait', 'Hors réseau : les modifications seront envoyées au retour du réseau');
    const ses = await session(); if (!ses) return set('err', 'Connectez-vous dans les réglages pour synchroniser');
    busy = true; set('run', 'Synchronisation…');
    try {
      let sent = 0, got = 0;
      for (const s of DB.STORES) {
        const rows = await DB.dirty(s); if (!rows.length) continue;
        for (let i = 0; i < rows.length; i += 200) {
          const part = rows.slice(i, i + 200), up = part.map(o => { const { dirty, ...data } = o; return { id: o.id, store: s, chantier_id: o.chantierId || null, data, updated_at: o.updatedAt, deleted: !!o.deleted }; });
          const { error } = await c.from('tc_items').upsert(up); if (error) throw error;
          for (const o of part) { const cur = await DB.get(s, o.id); if (cur && cur.updatedAt === o.updatedAt) await DB.put(s, cur, { remote: true }); } sent += part.length;
        }
      }
      // images : envoyées une fois (identifiant unique, jamais modifiées)
      for (const id of await DB.allBlobIds()) { const r = await DB.blobRec(id); if (!r || r.synced) continue; const { error } = await c.storage.from('tc-blobs').upload(id, r.blob, { contentType: r.type || 'image/jpeg', upsert: true }); if (error && !/exists|Duplicate/i.test(error.message)) throw error; await DB.markBlob(id, 1); }
      // réception : tout ce qui a changé sur le serveur depuis la dernière fois
      let since = (await DB.meta('syncSince')) || '1970-01-01T00:00:00Z';
      for (;;) {
        const { data, error } = await c.from('tc_items').select('*').gt('server_at', since).order('server_at').limit(500); if (error) throw error; if (!data.length) break;
        for (const row of data) { if (!DB.STORES.includes(row.store)) continue; const cur = await DB.get(row.store, row.id);
          if (!cur || (!cur.dirty && row.updated_at >= (cur.updatedAt || '')) || (cur.dirty && row.updated_at > (cur.updatedAt || ''))) { await DB.put(row.store, { ...row.data, updatedAt: row.updated_at, deleted: row.deleted }, { remote: true }); got++; } }
        since = data[data.length - 1].server_at; await DB.meta('syncSince', since); if (data.length < 500) break;
      }
      await DB.meta('syncAt', new Date().toISOString());
      set('ok', `Synchronisé à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${sent || got ? ` (${sent} envoyée(s), ${got} reçue(s))` : ''}`);
      if (got && typeof render === 'function' && !document.querySelector('.sheet-bg') && !/\/v\/|\/r\//.test(location.hash)) { S._fresh = false; render(); } else if (got) S._fresh = false;
    } catch (e) { console.warn('sync', e); set('err', 'Synchronisation interrompue : ' + (e.message || e)); }
    finally { busy = false; if (again) { again = false; setTimeout(run, 500); } }
  }
  /* image absente de l'appareil : téléchargée à la demande */
  async function fetchBlob(id) { const c = await client(); if (!c || !(await session())) return null; const { data, error } = await c.storage.from('tc-blobs').download(id); if (error || !data) return null; await DB.putBlob(data, id); await DB.markBlob(id, 1); return data; }
  function soon() { clearTimeout(timer); timer = setTimeout(run, 2500); }
  function start() { run(); setInterval(run, 60000); addEventListener('online', run); document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); }); }
  function formHTML(c) {
    return `<div class="grid2"><label class="f">Adresse du projet Supabase<input type="url" id="syU" value="${esc(c.url || '')}" placeholder="https://xxxx.supabase.co"></label><label class="f">Clé publique (anon)<input type="text" id="syK" value="${esc(c.key || '')}" placeholder="eyJ…"></label></div>
      <div class="grid2" style="margin-top:8px"><label class="f">E-mail<input type="email" id="syE" value="${esc(c.email || '')}" autocomplete="username"></label><label class="f">Mot de passe<input type="password" id="syP" autocomplete="current-password"></label></div>
      <div class="row" style="flex-wrap:wrap;margin-top:8px"><button class="btn pri" id="syIn">Se connecter</button><button class="btn" id="syUp">Créer mon compte</button><button class="btn" id="syOut">Se déconnecter</button><button class="btn" id="syNow">Synchroniser maintenant</button></div>
      <div class="hint" id="syMsg" style="margin-top:6px">${esc(msg)}</div>
      <details style="margin-top:6px"><summary class="hint" style="cursor:pointer">Préparation du projet Supabase (une seule fois)</summary><div class="hint" style="margin:6px 0">Dans Supabase, ouvrez « SQL Editor », collez ce texte et lancez-le.</div><textarea readonly rows="6" style="font:11px monospace">${esc(SYNC_SQL)}</textarea><button class="btn sm" id="syCopy" style="margin-top:4px">Copier</button></details>`;
  }
  function bindForm(el) {
    const q = id => el.querySelector('#' + id), note = m => { q('syMsg').textContent = m; };
    const keep = async () => { const url = q('syU').value.trim().replace(/\/$/, ''), key = q('syK').value.trim(), email = q('syE').value.trim(); if (url !== cfg.url || key !== cfg.key) sb = null; cfg = { url, key, email }; await DB.meta('sync', cfg); return client(); };
    q('syIn').onclick = async () => { const c = await keep(); if (!c) return note('Renseignez l\'adresse et la clé du projet.'); const { error } = await c.auth.signInWithPassword({ email: q('syE').value.trim(), password: q('syP').value }); note(error ? 'Connexion refusée : ' + error.message : 'Connecté. Synchronisation en cours…'); if (!error) run(); };
    q('syUp').onclick = async () => { const c = await keep(); if (!c) return note('Renseignez l\'adresse et la clé du projet.'); const { data, error } = await c.auth.signUp({ email: q('syE').value.trim(), password: q('syP').value }); note(error ? 'Création refusée : ' + error.message : data.session ? 'Compte créé et connecté.' : 'Compte créé : confirmez-le avec le lien reçu par e-mail, puis connectez-vous.'); if (data && data.session) run(); };
    q('syOut').onclick = async () => { const c = await client(); if (c) await c.auth.signOut(); note('Déconnecté. Les données restent sur cet appareil.'); set('err', 'Déconnecté'); };
    q('syNow').onclick = async () => { await keep(); await run(); note(msg); };
    q('syCopy').onclick = () => { navigator.clipboard.writeText(SYNC_SQL).then(() => toast('Texte copié')); };
  }
  return { run, soon, start, paint, config, formHTML, bindForm, fetchBlob, SQL: SYNC_SQL };
})();
