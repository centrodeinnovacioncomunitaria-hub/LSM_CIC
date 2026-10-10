// Botón flotante de soporte técnico (esquina inferior derecha de todas las páginas del portal).
// Abre un cuestionario predeterminado. Si la persona ingresó a la plataforma (index.html deja window.CICSesion),
// la solicitud queda en su cuenta y la sigue en la pestaña «Soporte»; si no, se envía con su cédula y un contacto.
// Lleva sus propios estilos para verse igual en cualquier página.
(() => {
    'use strict';
    if (document.getElementById('sop-flotante')) return;
    const CFG = window.CIC_CONFIG || {};
    const FB = CFG.firebase || {};
    const FUNCIONES = [CFG.funcionUrl || (FB.projectId ? `https://us-central1-${FB.projectId}.cloudfunctions.net/cicAcceso` : 'https://us-central1-cic-caribe.cloudfunctions.net/cicAcceso'), CFG.funcionAlterna || 'https://cicacceso-fg3c52ar6q-uc.a.run.app'];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
    const TEMAS = [['acceso', 'No puedo entrar / contraseña'], ['videos', 'Los videos no cargan o no se ven'], ['cursos', 'Cursos y evaluaciones'], ['talleres', 'Talleres y guías para descargar'], ['seguimiento', 'Seguimiento y subir documentos'], ['otro', 'Otra cosa']];
    const QUIEN = [['emprendedora', 'Emprendedora'], ['dinamizadora', 'Dinamizadora'], ['secretaria', 'Secretaría'], ['otra', 'Otra persona']];
    const DISPOSITIVOS = ['Celular', 'Computador', 'Tablet'];
    const sesion = () => (window.CICSesion && window.CICSesion.perfil ? window.CICSesion : null);

    const estilo = document.createElement('style');
    estilo.textContent = `
.sopf-btn { position: fixed; right: 1.1rem; bottom: var(--sopf-abajo, 1.1rem); z-index: 60; display: flex; align-items: center; gap: .5rem; padding: .75rem 1.1rem .75rem .85rem; border: 0; border-radius: 999px; background: #B04A36; color: #fff; font: 700 .95rem 'Nunito Sans', system-ui, sans-serif; box-shadow: 0 14px 30px -12px rgba(46, 74, 62, .55); cursor: pointer; transition: transform .25s, box-shadow .25s; }
.sopf-btn:hover { transform: translateY(-3px); box-shadow: 0 18px 34px -12px rgba(46, 74, 62, .65); }
.sopf-btn svg { width: 1.4rem; height: 1.4rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sopf-btn:focus-visible { outline: 3px solid #F4E1A1; outline-offset: 3px; }
@media (max-width: 640px) { .sopf-btn span { display: none; } .sopf-btn { padding: .85rem; } }
.sopf-panel { position: fixed; right: 1.1rem; bottom: calc(var(--sopf-abajo, 1.1rem) + 4.2rem); z-index: 61; width: min(25rem, calc(100vw - 2.2rem)); max-height: min(78vh, 44rem); overflow: auto; background: #fff; color: #2E4A3E; border-radius: 1.4rem; box-shadow: 0 30px 60px -20px rgba(46, 74, 62, .55); border: 1px solid rgba(46, 74, 62, .13); font-family: 'Nunito Sans', system-ui, sans-serif; }
.sopf-panel[hidden] { display: none; }
.sopf-cabeza { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: .6rem; padding: 1rem 1.2rem .8rem; background: #2E4A3E; color: #fff; }
.sopf-cabeza b { display: block; font: 700 1.1rem Quicksand, system-ui, sans-serif; }
.sopf-cabeza small { opacity: .85; font-size: .82rem; }
.sopf-cerrar { border: 0; background: rgba(255,255,255,.15); color: #fff; width: 2rem; height: 2rem; border-radius: 50%; font-size: 1.2rem; cursor: pointer; flex-shrink: 0; }
.sopf-cuerpo { padding: 1rem 1.2rem 1.2rem; display: grid; gap: .25rem; }
.sopf-cuerpo fieldset { border: 0; margin: 0 0 .5rem; padding: 0; }
.sopf-cuerpo legend, .sopf-cuerpo label.sopf-etq { font-weight: 700; font-size: .9rem; margin: .4rem 0 .35rem; display: block; }
.sopf-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.sopf-chips label { cursor: pointer; }
.sopf-chips input { position: absolute; opacity: 0; pointer-events: none; }
.sopf-chips span { display: inline-block; padding: .4rem .8rem; border-radius: 999px; border: 1.5px solid rgba(46, 74, 62, .18); background: #FFF6EE; font-size: .86rem; }
.sopf-chips input:checked + span { background: #2E4A3E; color: #fff; border-color: #2E4A3E; }
.sopf-chips input:focus-visible + span { outline: 2px solid #B04A36; outline-offset: 2px; }
.sopf-campo { width: 100%; box-sizing: border-box; padding: .6rem .75rem; border-radius: .7rem; border: 1.5px solid rgba(46, 74, 62, .2); font: inherit; font-size: .92rem; background: #fff; color: inherit; }
.sopf-campo:focus { outline: 2px solid #9ED0B7; border-color: #2E4A3E; }
textarea.sopf-campo { resize: vertical; min-height: 4rem; }
.sopf-nota { margin: .3rem 0 .4rem; padding: .6rem .8rem; border-radius: .8rem; background: rgba(158, 208, 183, .3); font-size: .85rem; }
.sopf-error { color: #963D2C; font-size: .86rem; font-weight: 700; margin: .3rem 0 0; }
.sopf-enviar { margin-top: .8rem; width: 100%; padding: .8rem; border: 0; border-radius: 999px; background: #B04A36; color: #fff; font: 700 1rem inherit; cursor: pointer; }
.sopf-enviar:disabled { opacity: .6; cursor: progress; }
.sopf-trampa { position: absolute; left: -9999px; }
.sopf-ok { text-align: center; padding: 1.4rem 1.2rem 1.6rem; }
.sopf-ok b { display: block; font: 700 1.2rem Quicksand, system-ui, sans-serif; margin: .5rem 0; }
.sopf-ok .sopf-numero { display: inline-block; margin: .4rem 0 .8rem; padding: .35rem .9rem; border-radius: 999px; background: #F4E1A1; font-weight: 700; }
.sopf-enlace { background: none; border: 0; color: #B04A36; font-weight: 700; text-decoration: underline; cursor: pointer; font-size: .92rem; }
@media (prefers-reduced-motion: reduce) { .sopf-btn { transition: none; } }`;
    if (document.documentElement.dataset.soporteLado === 'izquierda') estilo.textContent += '.sopf-btn, .sopf-panel { right: auto; left: 1.1rem; }';
    document.head.appendChild(estilo);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sop-flotante';
    btn.className = 'sopf-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'sopf-panel');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-1a8 8 0 0116 0v1"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/><path d="M19.5 19a4 4 0 01-4 3h-2"/></svg><span>Soporte</span>';
    btn.setAttribute('aria-label', 'Soporte técnico: pide ayuda');
    const panel = document.createElement('section');
    panel.id = 'sopf-panel';
    panel.className = 'sopf-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Soporte técnico');
    document.body.append(panel, btn);

    const chips = (nombre, opciones, valor) => `<div class="sopf-chips">${opciones.map(([v, t]) => `<label><input type="radio" name="${nombre}" value="${esc(v)}" ${v === valor ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
    function formulario() {
        const s = sesion();
        const rolSesion = s ? (s.perfil.rol === 'administradora' ? 'secretaria' : s.perfil.rol) : null;
        panel.innerHTML = `
            <div class="sopf-cabeza"><div><b>¿Necesitas ayuda?</b><small>Responde estas preguntas y la Secretaría Técnica te contacta.</small></div><button type="button" class="sopf-cerrar" data-cerrar aria-label="Cerrar">×</button></div>
            <form class="sopf-cuerpo" novalidate>
                ${s ? '' : `<fieldset><legend>1. ¿Quién eres?</legend>${chips('rol', QUIEN, null)}</fieldset>`}
                <label class="sopf-etq" for="sopf-tema">${s ? '1' : '2'}. ¿Con qué necesitas ayuda?</label>
                <select id="sopf-tema" name="categoria" class="sopf-campo">${TEMAS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>
                <fieldset><legend>${s ? '2' : '3'}. ¿Desde dónde entras?</legend>${chips('dispositivo', DISPOSITIVOS.map((d) => [d, d]), null)}</fieldset>
                <label class="sopf-etq" for="sopf-hacer">${s ? '3' : '4'}. ¿Qué estabas intentando hacer?</label>
                <textarea id="sopf-hacer" name="hacer" class="sopf-campo" maxlength="600" placeholder="Por ejemplo: ver el video del módulo 2"></textarea>
                <label class="sopf-etq" for="sopf-paso">${s ? '4' : '5'}. ¿Qué pasó? Si salió un mensaje, cópialo aquí.</label>
                <textarea id="sopf-paso" name="paso" class="sopf-campo" maxlength="1200" placeholder="Por ejemplo: la pantalla se queda en negro"></textarea>
                ${s ? `<p class="sopf-nota">Enviarás la solicitud como <b>${esc(s.perfil.nombre)}</b>. La respuesta te llega en la pestaña «Soporte» de tu cuenta.</p>
                    <label class="sopf-etq" for="sopf-adj">5. Captura de pantalla o foto (opcional)</label>
                    <input id="sopf-adj" name="adjunto" type="file" class="sopf-campo" accept="image/*,application/pdf">`
                : `<label class="sopf-etq" for="sopf-ced">6. Tus datos para responderte</label>
                    <input id="sopf-ced" name="cedula" class="sopf-campo" inputmode="numeric" maxlength="15" placeholder="Número de cédula">
                    <input name="nombre" class="sopf-campo" maxlength="90" autocomplete="name" placeholder="Nombre y apellido" aria-label="Nombre y apellido" style="margin-top:.4rem">
                    <input name="contacto" class="sopf-campo" maxlength="120" placeholder="Celular / WhatsApp o correo" aria-label="Celular, WhatsApp o correo" style="margin-top:.4rem">
                    <input name="sitio" class="sopf-trampa" tabindex="-1" autocomplete="off" aria-hidden="true">`}
                <p class="sopf-error" role="alert" hidden></p>
                <button type="submit" class="sopf-enviar">Enviar solicitud</button>
            </form>`;
        const form = panel.querySelector('form');
        const error = (t) => { const e = panel.querySelector('.sopf-error'); e.hidden = !t; e.textContent = t || ''; };
        if (form.cedula) form.cedula.addEventListener('input', () => { form.cedula.value = soloDigitos(form.cedula.value); });
        form.addEventListener('input', () => error(''));
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const v = (n) => (form[n] ? (form[n].value || '').trim() : '');
            const rol = s ? rolSesion : (form.querySelector('input[name="rol"]:checked') || {}).value;
            const dispositivo = (form.querySelector('input[name="dispositivo"]:checked') || {}).value || '';
            if (!s && !rol) return error('Elige quién eres.');
            if (!dispositivo) return error('Cuéntanos desde dónde entras.');
            if (v('paso').length < 10) return error('Cuéntanos qué pasó (al menos unas palabras).');
            if (!s) {
                if (soloDigitos(v('cedula')).length < 5) return error('Escribe tu número de cédula.');
                if (v('nombre').length < 5 || !v('nombre').includes(' ')) return error('Escribe tu nombre y apellido.');
                if (soloDigitos(v('contacto')).length < 7 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('contacto'))) return error('Escribe un celular, WhatsApp o correo para responderte.');
            }
            const tema = TEMAS.find(([k]) => k === form.categoria.value);
            const descripcion = [`Quién es: ${(QUIEN.find(([k]) => k === rol) || [, rol])[1]}`, `Dispositivo: ${dispositivo}`, `Página: ${location.pathname}`, v('hacer') ? `Qué intentaba hacer: ${v('hacer')}` : '', `Qué pasó: ${v('paso')}`].filter(Boolean).join('\n');
            const b = form.querySelector('.sopf-enviar');
            b.disabled = true; b.textContent = 'Enviando…';
            try {
                let numero;
                if (s) {
                    const adjunto = form.adjunto && form.adjunto.files[0] ? await prepararArchivo(form.adjunto.files[0]) : null;
                    numero = (await s.pedir('ticket-crear', { categoria: form.categoria.value, asunto: tema[1], descripcion, adjunto })).ticket.numero;
                } else {
                    numero = (await publico({ accion: 'ticket-publico', cedula: soloDigitos(v('cedula')), nombre: v('nombre'), contacto: v('contacto'), categoria: form.categoria.value, asunto: tema[1], rol, dispositivo, descripcion, sitio: v('sitio') })).numero;
                }
                listo(numero, !!s);
            } catch (e) { error(e.message); b.disabled = false; b.textContent = 'Enviar solicitud'; }
        });
        panel.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    }
    function listo(numero, conCuenta) {
        panel.innerHTML = `
            <div class="sopf-cabeza"><div><b>Soporte técnico</b></div><button type="button" class="sopf-cerrar" data-cerrar aria-label="Cerrar">×</button></div>
            <div class="sopf-ok"><span style="font-size:2rem" aria-hidden="true">✅</span><b>¡Recibimos tu solicitud!</b>
            ${numero ? `<span class="sopf-numero">${esc(numero)}</span>` : ''}
            <p>${conCuenta ? 'La Secretaría Técnica te responderá en la pestaña «Soporte» de tu cuenta.' : 'La Secretaría Técnica te contactará por el celular, WhatsApp o correo que escribiste.'}</p>
            ${conCuenta && window.CICSesion.irSoporte ? '<button type="button" class="sopf-enlace" data-ver>Ver mis solicitudes</button>' : ''}</div>`;
        panel.querySelector('[data-cerrar]').addEventListener('click', cerrar);
        const ver = panel.querySelector('[data-ver]');
        if (ver) ver.addEventListener('click', () => { cerrar(); window.CICSesion.irSoporte(); });
    }
    async function publico(cuerpo) {
        let r;
        for (let i = 0; i < 4; i++) {
            try { r = await fetch(FUNCIONES[i % FUNCIONES.length], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); break; }
            catch (e) { if (i === 3) throw new Error('No pudimos enviar la solicitud. Revisa tu conexión e intenta de nuevo.'); await new Promise((ok) => setTimeout(ok, 1200 * (i + 1))); }
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.mensaje || 'No pudimos enviar la solicitud. Intenta de nuevo.');
        return j;
    }
    const leerComoBase64 = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(new Error('No pudimos leer el archivo.')); r.readAsDataURL(blob); });
    async function prepararArchivo(f) {
        if (f.type === 'application/pdf') { if (f.size > 3 * 1024 * 1024) throw new Error('El PDF pesa más de 3 MB.'); return { nombre: f.name, mime: f.type, base64: await leerComoBase64(f) }; }
        if (!f.type.startsWith('image/')) throw new Error('El adjunto debe ser una foto o un PDF.');
        const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No pudimos abrir la imagen.')); i.src = URL.createObjectURL(f); });
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        return { nombre: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', base64: await leerComoBase64(await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82))) };
    }
    function abrir() { formulario(); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); setTimeout(() => { const p = panel.querySelector('input, select, textarea'); if (p) p.focus(); }, 30); }
    function cerrar() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    btn.addEventListener('click', () => (panel.hidden ? abrir() : cerrar()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) cerrar(); });
    window.CICSoporteFlotante = { abrir };
})();
