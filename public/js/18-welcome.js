// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// First-run welcome and the administrator badge.
// === First Run and Permissions ===
// First visit: what vxtop is in a few lines, and whether to show live images of your windows (privacy: off unless you say yes).
// The badge relaunches the server with administrator rights for the extra data that needs them (Windows asks; still read-only).
function welcome() {
  let seen = null; try { seen = localStorage.getItem('vxtop.welcome'); } catch {} if (seen) return;
  const m = $('#modal');
  m.innerHTML = `<div class="mb wel"><b>Bienvenido a vxtop</b>
    <p>Un observatorio 3D de tu equipo. Cada carpeta es un cubo de 27 celdas (tipo × profundidad × antigüedad) y cada programa abierto, otro cubo encima.
    «En vivo» muestra solo lo que se está usando ahora: los puntos que viajan son archivos tocados en este momento, en ámbar si es Claude, turquesa si eres tú y gris si es otro programa.</p>
    <p><b class="k">Un clic</b> selecciona y centra · <b class="k">cursor encima</b> muestra lo que se usa ahí · <b class="k">rueda</b> acerca · <b class="k">?</b> ayuda.<br>Solo lee: nunca cambia archivos, procesos ni el sistema.</p>
    <label class="wck"><input type="checkbox" id="wel-scr"> Mostrar imágenes en vivo de mis ventanas <span>(se quedan en este equipo; cámbialo en Ajustes)</span></label>
    <div class="mbb"><button data-r="1" class="on">Empezar</button></div></div>`;
  m.style.display = 'flex';
  m.onclick = e => { if (!e.target.closest('[data-r]')) return; SET.screens = $('#wel-scr').checked ? 1 : 0; applySet(); const inp = document.querySelector('#set [data-k=screens]'); if (inp) inp.value = SET.screens; setLabels();
    try { localStorage.setItem('vxtop.welcome', '1'); } catch {} m.style.display = 'none'; };
}
document.querySelector('.badge').addEventListener('click', async () => {
  const b = document.querySelector('.badge'); if (b.dataset.admin !== 'false' || !/^win/i.test(navigator.platform)) return;
  if (!await confirmBox('Más datos con administrador', 'vxtop se reinicia con permisos de administrador para ver también la caché DNS y los archivos que tiene abiertos cada proceso. Windows te pedirá confirmación. Sigue siendo solo lectura.', 'Reiniciar con administrador')) return;
  b.textContent = 'ESPERANDO A WINDOWS…';
  try { await post('/api/elevate', {}); b.textContent = 'REINICIANDO…'; } catch { b.textContent = 'SOLO LECTURA'; feed('aviso', '#c9a26b', 'Sin permiso de administrador: se sigue igual'); }
});
welcome();
