/**
 * Racing Lab · Asistente (rl-chat.js)
 * ===================================
 * Burbuja flotante + panel de conversación. Nunca ocupa la pantalla entera:
 * el botón "ampliar" agranda el panel dentro de la página, como una
 * conversación más grande.
 *
 * Se incluye con una línea:  <script src="rl-chat.js" defer></script>
 * Toma los colores y la tipografía de la propia página (variables CSS) y
 * cae a valores por defecto si la página no las define.
 *
 * El asistente solo responde con datos del Lab: la lógica y las
 * comprobaciones están en el servidor (functions/chat.js).
 */
(function () {
  'use strict';

  var ENDPOINT = window.RL_CHAT_ENDPOINT ||
    'https://europe-west1-racing-portuense-scouting.cloudfunctions.net/preguntarLab';
  var CORREO_ANALISTA = 'analista@racingclubportuense.es';
  /* MODO PRUEBA: mientras sea true, el asistente solo aparece en los dispositivos donde se
     activa abriendo la página con ?chat=1 (se desactiva con ?chat=0). Cuando esté desplegado
     y probado, basta cambiarlo a false para que lo vea todo el cuerpo técnico. */
  var SOLO_ACTIVADO_A_MANO = true;
  var K_HIST = 'rl_chat_hist', K_AMPLIADO = 'rl_chat_wide';

  /* ── almacenamiento tolerante a fallos ── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  (function () {
    if (!SOLO_ACTIVADO_A_MANO) return;
    var m = /[?&]chat=([01])/.exec(location.search);
    if (m) lsSet('rl_chat_on', m[1]);
  })();
  if (SOLO_ACTIVADO_A_MANO && lsGet('rl_chat_on') !== '1') return;
  if (window.__rlChat) return;
  window.__rlChat = true;
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* ── estilos ── */
  var css = '\
.rlc-fab,.rlc-panel,.rlc-panel *{box-sizing:border-box}\
.rlc-fab{position:fixed;right:20px;bottom:20px;z-index:9000;width:56px;height:56px;border-radius:50%;\
  background:var(--racing,#CC3334);color:var(--racing-ink,#fff);display:flex;align-items:center;justify-content:center;\
  border:none;cursor:pointer;box-shadow:var(--shadow-m,0 6px 20px rgba(0,0,0,.25));\
  transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}\
.rlc-fab:hover{transform:scale(1.06)}\
.rlc-fab:focus-visible,.rlc-panel button:focus-visible,.rlc-panel textarea:focus-visible,.rlc-panel input:focus-visible,.rlc-panel a:focus-visible{outline:2px solid var(--racing-text,#CC3334);outline-offset:2px}\
.rlc-fab svg{width:26px;height:26px}\
.rlc-fab[aria-expanded="true"]{transform:scale(.92)}\
.rlc-panel{position:fixed;right:20px;bottom:88px;z-index:9001;width:380px;height:min(560px,calc(100vh - 112px));\
  display:none;flex-direction:column;background:var(--surface,#fbfaf8);color:var(--ink,#14110f);\
  border:1px solid var(--line,#e2ddd5);border-radius:16px;box-shadow:var(--shadow-l,0 12px 40px rgba(0,0,0,.28));\
  font-family:var(--f-body,system-ui,-apple-system,sans-serif);font-size:14px;line-height:1.45;overflow:hidden;\
  transform-origin:bottom right;transition:width .28s cubic-bezier(.22,1,.36,1),height .28s cubic-bezier(.22,1,.36,1)}\
.rlc-panel.open{display:flex;animation:rlc-in .22s cubic-bezier(.22,1,.36,1)}\
.rlc-panel.wide{width:min(760px,calc(100vw - 40px));height:min(calc(100vh - 112px),820px)}\
@keyframes rlc-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}\
.rlc-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;background:var(--racing,#CC3334);color:var(--racing-ink,#fff)}\
.rlc-head .t{flex:1;min-width:0}\
.rlc-head .t b{display:block;font-family:var(--f-display,var(--f-body,system-ui));font-size:15px;font-weight:700;letter-spacing:.01em}\
.rlc-head .t span{display:block;font-size:11.5px;opacity:.88;margin-top:1px}\
.rlc-ib{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:inherit;\
  background:rgba(255,255,255,.14);border:none;cursor:pointer;transition:background .15s}\
.rlc-ib:hover{background:rgba(255,255,255,.26)}\
.rlc-ib svg{width:16px;height:16px}\
.rlc-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;overscroll-behavior:contain}\
.rlc-msg{max-width:88%;display:flex;flex-direction:column;gap:6px}\
.rlc-wide .rlc-msg{max-width:78%}\
.rlc-panel.wide .rlc-msg{max-width:78%}\
.rlc-msg.u{align-self:flex-end}\
.rlc-msg.u .bub{background:var(--racing,#CC3334);color:var(--racing-ink,#fff);border-radius:14px 14px 4px 14px;padding:9px 13px;white-space:pre-wrap;word-wrap:break-word}\
.rlc-msg.a .bub{background:var(--surface-2,#f0ede8);border:1px solid var(--line,#e2ddd5);border-radius:14px 14px 14px 4px;padding:10px 13px;white-space:pre-wrap;word-wrap:break-word}\
.rlc-msg.a.sin .bub{background:var(--draw-bg,rgba(168,107,18,.10));border-color:var(--draw,#a86b12)}\
.rlc-msg.a.acl .bub{border-color:var(--racing-line,rgba(204,51,52,.3))}\
.rlc-ent{font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;color:var(--ink-3,#797269);padding:0 2px}\
.rlc-src{font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;color:var(--ink-3,#797269);padding:0 2px}\
.rlc-chips{display:flex;flex-wrap:wrap;gap:6px}\
.rlc-msg>.rlc-send-an,.rlc-msg>.rlc-ok{align-self:flex-start}\
.rlc-chip{font:inherit;font-size:13px;padding:7px 12px;border-radius:999px;cursor:pointer;color:var(--ink,#14110f);\
  background:var(--surface-hi,#fff);border:1px solid var(--line-2,#cfc8be);text-align:left;transition:border-color .15s,background .15s}\
.rlc-chip:hover{border-color:var(--racing,#CC3334);background:var(--racing-soft,rgba(204,51,52,.08))}\
.rlc-chip:disabled{opacity:.5;cursor:default}\
.rlc-link{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;padding:6px 11px;border-radius:8px;text-decoration:none;\
  color:var(--racing-text,#CC3334);border:1px solid var(--racing-line,rgba(204,51,52,.3));background:var(--racing-soft,rgba(204,51,52,.08))}\
.rlc-link:hover{border-color:var(--racing,#CC3334)}\
.rlc-send-an{font:inherit;font-size:12.5px;padding:6px 11px;border-radius:8px;cursor:pointer;background:none;color:var(--ink-2,#4c4741);\
  border:1px dashed var(--line-2,#cfc8be)}\
.rlc-send-an:hover{border-color:var(--racing,#CC3334);color:var(--ink,#14110f)}\
.rlc-ok{font-size:12.5px;color:var(--win,#12734a)}\
.rlc-ok a{color:inherit}\
.rlc-hello{text-align:left;color:var(--ink-2,#4c4741)}\
.rlc-hello b{display:block;font-family:var(--f-display,var(--f-body,system-ui));font-size:17px;color:var(--ink,#14110f);margin-bottom:4px}\
.rlc-hello p{margin:0 0 10px}\
.rlc-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--surface-2,#f0ede8);border:1px solid var(--line,#e2ddd5);border-radius:14px 14px 14px 4px}\
.rlc-typing i{width:6px;height:6px;border-radius:50%;background:var(--ink-3,#797269);animation:rlc-b 1.1s infinite ease-in-out}\
.rlc-typing i:nth-child(2){animation-delay:.15s}.rlc-typing i:nth-child(3){animation-delay:.3s}\
@keyframes rlc-b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}\
.rlc-form{display:flex;gap:8px;align-items:flex-end;padding:10px 12px 12px;border-top:1px solid var(--line,#e2ddd5);background:var(--surface,#fbfaf8)}\
.rlc-form textarea{flex:1;resize:none;max-height:110px;min-height:40px;font:inherit;font-size:14px;line-height:1.4;padding:9px 12px;\
  border-radius:12px;border:1px solid var(--line-2,#cfc8be);background:var(--surface-hi,#fff);color:var(--ink,#14110f)}\
.rlc-form textarea::placeholder{color:var(--ink-4,#979087)}\
.rlc-send{width:40px;height:40px;border-radius:12px;border:none;cursor:pointer;background:var(--racing,#CC3334);color:var(--racing-ink,#fff);\
  display:flex;align-items:center;justify-content:center;flex:0 0 40px}\
.rlc-send:disabled{opacity:.45;cursor:default}\
.rlc-send svg{width:18px;height:18px}\
.rlc-foot{font-size:11px;color:var(--ink-4,#979087);text-align:center;padding:0 12px 8px;background:var(--surface,#fbfaf8)}\
.rlc-gate{padding:18px 16px;display:flex;flex-direction:column;gap:10px}\
.rlc-gate input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line-2,#cfc8be);background:var(--surface-hi,#fff);color:var(--ink,#14110f)}\
.rlc-gate button{font:inherit;font-weight:600;padding:10px 12px;border-radius:10px;border:none;cursor:pointer;background:var(--racing,#CC3334);color:var(--racing-ink,#fff)}\
.rlc-gate .err{color:var(--loss,#c02231);font-size:12.5px;min-height:1em}\
.rlc-bandeja{border:1px solid var(--line,#e2ddd5);border-radius:10px;background:var(--surface-hi,#fff);padding:9px 11px;display:flex;flex-direction:column;gap:6px}\
.rlc-bandeja small{color:var(--ink-3,#797269)}\
@media (max-width:520px){\
  .rlc-panel,.rlc-panel.wide{left:10px;right:10px;width:auto;bottom:84px;height:min(calc(100vh - 100px),640px)}\
  .rlc-fab{right:14px;bottom:14px}\
  .rlc-expand{display:none}\
  .rlc-msg,.rlc-panel.wide .rlc-msg{max-width:92%}}\
@media (prefers-reduced-motion:reduce){.rlc-panel,.rlc-fab,.rlc-typing i{transition:none;animation:none}.rlc-body{scroll-behavior:auto}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ── iconos ── */
  var I = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 9h-6V3M3 15h6v6M15 9l6-6M9 15l-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    out: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>'
  };

  /* ── DOM ── */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  var fab = el('button', 'rlc-fab');
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Abrir el asistente del Lab');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = I.chat;

  var panel = el('section', 'rlc-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Asistente del Lab');

  var head = el('div', 'rlc-head');
  var ht = el('div', 't');
  ht.appendChild(el('b', null, 'Asistente del Lab'));
  ht.appendChild(el('span', null, 'Solo responde con datos verificados · 26/27'));
  var bExp = el('button', 'rlc-ib rlc-expand');
  bExp.type = 'button'; bExp.innerHTML = I.expand;
  bExp.setAttribute('aria-label', 'Ampliar la conversación'); bExp.title = 'Ampliar';
  var bCl = el('button', 'rlc-ib');
  bCl.type = 'button'; bCl.innerHTML = I.close;
  bCl.setAttribute('aria-label', 'Cerrar el asistente'); bCl.title = 'Cerrar';
  head.appendChild(ht); head.appendChild(bExp); head.appendChild(bCl);

  var body = el('div', 'rlc-body');
  body.setAttribute('aria-live', 'polite');
  body.setAttribute('role', 'log');

  var form = el('form', 'rlc-form');
  var ta = el('textarea');
  ta.rows = 1; ta.maxLength = 500;
  ta.placeholder = 'Pregunta sobre los datos del Lab…';
  ta.setAttribute('aria-label', 'Escribe tu pregunta');
  var bSend = el('button', 'rlc-send');
  bSend.type = 'submit'; bSend.innerHTML = I.send;
  bSend.setAttribute('aria-label', 'Enviar pregunta');
  form.appendChild(ta); form.appendChild(bSend);
  var foot = el('div', 'rlc-foot', 'Si no hay dato verificado, te lo dirá y podrás enviar la pregunta al analista.');

  panel.appendChild(head); panel.appendChild(body); panel.appendChild(form); panel.appendChild(foot);

  function montar() {
    document.body.appendChild(fab);
    document.body.appendChild(panel);
  }
  /* El hub tiene su propia pantalla de acceso: mientras se muestra, el asistente no aparece. */
  function sincronizarAcceso() {
    var g = document.getElementById('login-screen');
    var bloqueado = !!g && getComputedStyle(g).display !== 'none';
    fab.style.display = bloqueado ? 'none' : '';
    if (bloqueado) { panel.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); }
  }
  function iniciar() {
    montar();
    sincronizarAcceso();
    var g = document.getElementById('login-screen');
    if (g && window.MutationObserver) new MutationObserver(sincronizarAcceso).observe(g, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);

  /* ── estado ── */
  var mensajes = [];   // {role:'user'|'assistant', text, data?}
  var ocupado = false;

  try { var h = JSON.parse(ssGet(K_HIST) || '[]'); if (Array.isArray(h)) mensajes = h.slice(-30); } catch (e) {}
  function guardarHist() { ssSet(K_HIST, JSON.stringify(mensajes.slice(-30))); }

  /* ── llamada al servidor (protocolo de funciones "callable") ── */
  function llamar(data) {
    return fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.result) return j.result;
        var e = new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        e.status = (j.error && j.error.status) || (r.status === 404 ? 'NOT_FOUND' : 'ERROR');
        throw e;
      });
    });
  }

  /* ── pintado ── */
  function bajar() { body.scrollTop = body.scrollHeight; }

  function pintarHola() {
    var h = el('div', 'rlc-hello');
    h.appendChild(el('b', null, 'Pregúntame por los datos del Lab'));
    h.appendChild(el('p', null, 'Contesto solo con lo que hay guardado: actas, calendario, entrenamientos. Si algo no está verificado, te lo digo.'));
    var chips = el('div', 'rlc-chips');
    ['¿Máximo goleador del Chiclana?', '¿Cuándo jugamos en Córdoba?', '¿Cuántos entrenamientos llevamos?', '¿Jugó Rodri la última jornada?']
      .forEach(function (q) {
        var c = el('button', 'rlc-chip', q); c.type = 'button';
        c.addEventListener('click', function () { enviar(q); });
        chips.appendChild(c);
      });
    h.appendChild(chips);
    body.appendChild(h);
  }

  function enlaceCorreo(pregunta) {
    var asunto = encodeURIComponent('Pregunta desde Racing Lab');
    var cuerpo = encodeURIComponent('Pregunta: ' + pregunta + '\n\n(26/27)');
    return 'mailto:' + CORREO_ANALISTA + '?subject=' + asunto + '&body=' + cuerpo;
  }

  function pintarMensaje(m, idx) {
    if (m.role === 'user') {
      var u = el('div', 'rlc-msg u'); u.appendChild(el('div', 'bub', m.text)); body.appendChild(u); return;
    }
    var d = m.data || {};
    var clase = 'rlc-msg a' + (d.estado === 'sin_dato' ? ' sin' : d.estado === 'aclarar' ? ' acl' : '');
    var a = el('div', clase);
    if (d.entendido) a.appendChild(el('div', 'rlc-ent', 'Entendido: ' + d.entendido));
    a.appendChild(el('div', 'bub', m.text));
    if (d.fuentes && d.fuentes.length) a.appendChild(el('div', 'rlc-src', 'Fuente: ' + d.fuentes.join(' · ')));

    if (d.opciones && d.opciones.length) {
      var ch = el('div', 'rlc-chips');
      d.opciones.forEach(function (o) {
        var c = el('button', 'rlc-chip', o); c.type = 'button';
        c.addEventListener('click', function () {
          ch.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          enviar(o);
        });
        ch.appendChild(c);
      });
      a.appendChild(ch);
    }
    if (d.modulos && d.modulos.length) {
      var lk = el('div', 'rlc-chips');
      d.modulos.forEach(function (mo) {
        var l = el('a', 'rlc-link'); l.href = mo.url; l.target = '_blank'; l.rel = 'noopener';
        l.appendChild(document.createTextNode(mo.nombre + ' '));
        l.insertAdjacentHTML('beforeend', I.out);
        lk.appendChild(l);
      });
      a.appendChild(lk);
    }
    if (d.estado === 'sin_dato' && d.pendienteSugerido && m.pregunta) {
      if (m.enviada) {
        var ok = el('div', 'rlc-ok', '✓ Enviada al analista. ');
        var lm = el('a', null, 'También por correo'); lm.href = enlaceCorreo(m.pregunta);
        ok.appendChild(lm); a.appendChild(ok);
      } else {
        var b = el('button', 'rlc-send-an', 'Enviar esta pregunta al analista'); b.type = 'button';
        b.addEventListener('click', function () { enviarAlAnalista(idx, b); });
        a.appendChild(b);
      }
    }
    body.appendChild(a);
  }

  function pintar() {
    body.textContent = '';
    if (!mensajes.length) pintarHola();
    mensajes.forEach(pintarMensaje);
    if (ocupado) { var t = el('div', 'rlc-typing'); t.setAttribute('aria-label', 'Consultando los datos'); t.innerHTML = '<i></i><i></i><i></i>'; body.appendChild(t); }
    bajar();
  }

  /* ── bandeja del analista (/bandeja) ── */
  function mostrarBandeja() {
    llamar({ accion: 'bandeja' }).then(function (r) {
      var items = r.items || [];
      var w = el('div', 'rlc-msg a');
      w.appendChild(el('div', 'bub', items.length ? 'Preguntas pendientes (' + items.length + '):' : 'No hay preguntas pendientes.'));
      items.forEach(function (it) {
        var c = el('div', 'rlc-bandeja');
        c.appendChild(el('div', null, it.pregunta));
        var f = it.creadaEn ? new Date(it.creadaEn).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        c.appendChild(el('small', null, f));
        var b = el('button', 'rlc-chip', 'Marcar como resuelta'); b.type = 'button';
        b.addEventListener('click', function () {
          b.disabled = true;
          llamar({ accion: 'resolver', id: it.id }).then(function () { c.remove(); }).catch(function () { b.disabled = false; });
        });
        c.appendChild(b); w.appendChild(c);
      });
      body.appendChild(w); bajar();
    }).catch(function () { avisoError('No he podido leer la bandeja.'); });
  }

  function avisoError(txt) {
    var a = el('div', 'rlc-msg a sin'); a.appendChild(el('div', 'bub', txt)); body.appendChild(a); bajar();
  }

  /* ── enviar pregunta ── */
  function historialServidor() {
    return mensajes.slice(-8).map(function (m) {
      var t = m.text;
      if (m.role === 'assistant' && m.data && m.data.opciones && m.data.opciones.length) t += '\nOpciones: ' + m.data.opciones.join(' | ');
      return { role: m.role, text: t };
    });
  }

  function enviar(texto) {
    texto = (texto || '').trim();
    if (!texto || ocupado) return;
    if (texto.toLowerCase() === '/bandeja') { ta.value = ''; autoAlto(); mostrarBandeja(); return; }
    var hist = historialServidor();
    mensajes.push({ role: 'user', text: texto });
    ta.value = ''; autoAlto();
    ocupado = true; bSend.disabled = true; pintar();
    llamar({ accion: 'preguntar', pregunta: texto, historial: hist }).then(function (r) {
      mensajes.push({ role: 'assistant', text: r.respuesta || '', pregunta: texto, data: r });
    }).catch(function (e) {
      var txt = e.status === 'PERMISSION_DENIED' ? 'El asistente solo funciona desde la web del Lab.'
        : e.status === 'RESOURCE_EXHAUSTED' ? 'Se ha alcanzado el límite diario de preguntas. Mañana volverá a funcionar; mientras, puedes enviar la pregunta al analista.'
        : e.status === 'NOT_FOUND' ? 'El asistente todavía no está activado en el servidor.'
        : 'No he podido consultar los datos ahora mismo. Inténtalo de nuevo en un momento.';
      mensajes.push({ role: 'assistant', text: txt, pregunta: texto, data: { estado: 'sin_dato', pendienteSugerido: e.status !== 'NOT_FOUND' } });
    }).then(function () {
      ocupado = false; bSend.disabled = false; guardarHist(); pintar();
      ta.focus();
    });
  }

  function enviarAlAnalista(idx, boton) {
    var m = mensajes[idx]; if (!m) return;
    boton.disabled = true; boton.textContent = 'Enviando…';
    var ctx = mensajes.slice(Math.max(0, idx - 3), idx + 1).map(function (x) { return (x.role === 'user' ? 'Q: ' : 'A: ') + x.text; });
    llamar({ accion: 'pendiente', pregunta: m.pregunta, contexto: ctx }).then(function () {
      m.enviada = true; guardarHist(); pintar();
    }).catch(function () {
      boton.disabled = false; boton.textContent = 'No se pudo enviar. Reintentar';
    });
  }

  /* ── interacción ── */
  function autoAlto() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; }
  ta.addEventListener('input', autoAlto);
  ta.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(ta.value); }
  });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); enviar(ta.value); });

  function abrir(v) {
    var abierto = v === undefined ? !panel.classList.contains('open') : v;
    panel.classList.toggle('open', abierto);
    fab.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    fab.setAttribute('aria-label', abierto ? 'Cerrar el asistente del Lab' : 'Abrir el asistente del Lab');
    if (abierto) { pintar(); setTimeout(function () { ta.focus(); }, 60); }
  }
  function ampliar(v) {
    var a = v === undefined ? !panel.classList.contains('wide') : v;
    panel.classList.toggle('wide', a);
    bExp.innerHTML = a ? I.shrink : I.expand;
    bExp.setAttribute('aria-label', a ? 'Reducir la conversación' : 'Ampliar la conversación');
    bExp.title = a ? 'Reducir' : 'Ampliar';
    lsSet(K_AMPLIADO, a ? '1' : '0');
    setTimeout(bajar, 300);
  }
  fab.addEventListener('click', function () { abrir(); });
  bCl.addEventListener('click', function () { abrir(false); fab.focus(); });
  bExp.addEventListener('click', function () { ampliar(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && panel.classList.contains('open')) { abrir(false); fab.focus(); }
  });
  if (lsGet(K_AMPLIADO) === '1') ampliar(true);

  window.rlChat = { abrir: abrir, ampliar: ampliar };
})();
