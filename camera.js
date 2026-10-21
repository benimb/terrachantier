/* TerraChantier : appareil photo intégré.
   Sur téléphone et tablette Android ou iOS, le sélecteur du système ouvre directement l'appareil photo.
   Sur un ordinateur ou une tablette sous Linux ou Windows, ce sélecteur n'ouvre qu'un explorateur de fichiers :
   l'application affiche alors sa propre prise de vue (caméra arrière de préférence), à pleine résolution. */
const isMobileOS = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || !!(navigator.userAgentData && navigator.userAgentData.mobile);
const camMode = () => S.camMode || 'auto'; // auto | integre | systeme
const useBuiltInCam = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (camMode() === 'integre' || (camMode() === 'auto' && !isMobileOS()));
/* prise de vue : rend un tableau de fichiers à cb (au moins une photo), rien si annulé */
function shoot(cb) {
  if (!useBuiltInCam()) { const inp = $('#camIn'); inp.value = ''; inp.onchange = () => { if (inp.files[0]) cb([...inp.files]); }; inp.click(); return; }
  cameraSheet().then(files => { if (files && files.length) cb(files); });
}
function cameraSheet() {
  return new Promise(async res => {
    let stream = null, devs = [], di = 0, out = null;
    const sh = sheet('Prendre une photo', `<div class="camwrap"><video id="cvV" autoplay playsinline muted></video><div class="camflash" id="cvF"></div><div class="hint" id="cvMsg" style="position:absolute;left:10px;bottom:10px;color:#fff;text-shadow:0 1px 3px #000"></div></div>`,
      `<button class="btn" id="cvFile">Choisir un fichier</button><button class="btn" id="cvSw" hidden>Changer de caméra</button><span class="grow"></span><button class="btn" data-close>Annuler</button><button class="btn pri camshot" id="cvShot" aria-label="Déclencher">● Photo</button>`, { wide: true });
    const v = $('#cvV', sh.el), msg = t => { $('#cvMsg', sh.el).textContent = t; };
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const start = async () => {
      stop(); msg('Ouverture de la caméra…');
      const want = devs[di] ? { deviceId: { exact: devs[di].deviceId } } : { facingMode: { ideal: 'environment' } };
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { ...want, width: { ideal: 4096 }, height: { ideal: 3072 } }, audio: false }); }
      catch (e) { msg(''); const n = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === 'videoinput').length, linux = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
        const why = e.name === 'NotAllowedError' ? "L'accès à la caméra est refusé : autorisez-le pour cette application (icône à gauche de l'adresse, ou réglages du navigateur et du système)."
          : e.name === 'NotFoundError' || !n ? 'Le navigateur ne voit aucune caméra.' + (linux ? " Sous Linux, les caméras des tablettes récentes (Intel IPU6, Surface…) passent par libcamera et PipeWire : dans Chromium ou Chrome, activez chrome://flags/#enable-webrtc-pipewire-camera puis relancez le navigateur ; vérifiez d'abord que l'application Caméra du système (Snapshot) fonctionne." : '')
          : e.name === 'NotReadableError' ? 'La caméra est occupée par une autre application, ou son pilote ne répond pas : fermez les autres applications qui l\'utilisent, puis réessayez.' : esc(e.message || e.name);
        $('.camwrap', sh.el).innerHTML = `<div class="empty" style="color:#fff;max-width:640px"><b>Caméra inaccessible</b>${why}<div class="small" style="opacity:.7;margin-top:8px">${esc(e.name)} · ${n} caméra(s) détectée(s)</div><br>Vous pouvez aussi choisir une photo déjà prise (« Choisir un fichier »).</div>`; $('#cvShot', sh.el).disabled = true; return; }
      v.srcObject = stream; await v.play().catch(() => {});
      const s = stream.getVideoTracks()[0].getSettings(); msg(`${s.width || v.videoWidth}×${s.height || v.videoHeight}`);
      if (!devs.length) { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); const cur = s.deviceId; di = Math.max(0, devs.findIndex(d => d.deviceId === cur)); }
      $('#cvSw', sh.el).hidden = devs.length < 2;
    };
    $('#cvSw', sh.el).onclick = () => { di = (di + 1) % devs.length; start(); };
    $('#cvFile', sh.el).onclick = () => { const inp = $('#galIn'); inp.value = ''; inp.onchange = () => { if (inp.files.length) { out = [...inp.files]; sh.close(); } }; inp.click(); };
    $('#cvShot', sh.el).onclick = async () => {
      if (!stream) return; const tr = stream.getVideoTracks()[0]; let blob = null;
      $('#cvF', sh.el).classList.remove('on'); void $('#cvF', sh.el).offsetWidth; $('#cvF', sh.el).classList.add('on');
      try { if (window.ImageCapture) blob = await new ImageCapture(tr).takePhoto(); } catch (e) { blob = null; } // pleine résolution du capteur quand c'est possible
      if (!blob) { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92)); }
      out = [new File([blob], `photo-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })]; sh.close();
    };
    sh.bg.addEventListener('closed', () => { stop(); res(out); });
    start();
  });
}
