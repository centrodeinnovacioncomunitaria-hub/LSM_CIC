// Soporte técnico: solicitudes (tickets) de emprendedoras, dinamizadoras y secretarías.
// Quien tiene cuenta ve «Mis solicitudes» y abre nuevas; la Secretaría Técnica y la administración ven la bandeja
// completa, responden y cambian el estado. Lo usan la pestaña «Soporte» de index.html y el panel admin/.
(() => {
    'use strict';
    let C = null; // contexto: perfil, pedir(accion, datos), aviso, esc, satelite
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (v) => C.esc(v);
    const CATEGORIAS = [['acceso', 'No puedo entrar / contraseña'], ['videos', 'Videos'], ['cursos', 'Cursos y evaluaciones'], ['talleres', 'Talleres y guías'], ['seguimiento', 'Seguimiento y documentos'], ['otro', 'Otro']];
    const ESTADOS = { abierto: ['Abierta', 'sop-abierto'], en_proceso: ['En proceso', 'sop-proceso'], resuelto: ['Resuelta', 'sop-resuelto'], cerrado: ['Cerrada', 'sop-cerrado'] };
    const ROLES = { emprendedora: 'Emprendedora', dinamizadora: 'Dinamizadora', secretaria: 'Secretaría', administradora: 'Administración' };
    const esSoporte = () => C.perfil.rol === 'secretaria' || C.perfil.rol === 'administradora';
    const fecha = (f) => { const d = new Date(f); return isNaN(d) ? '' : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    const chip = (e) => `<span class="chip ${ESTADOS[e] ? ESTADOS[e][1] : ''}">${esc(ESTADOS[e] ? ESTADOS[e][0] : e)}</span>`;
    let filtro = 'pendientes';

    async function pintar(cont, ctx) {
        C = ctx;
        cont.onclick = null; cont.onsubmit = null; cont.onchange = null;
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando…</p>';
        let r;
        try { r = await C.pedir(esSoporte() ? 'tickets' : 'mis-tickets', {}); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        const todos = r.tickets;
        const lista = !esSoporte() ? todos : todos.filter((t) => filtro === 'todas' || (filtro === 'pendientes' ? (t.estado === 'abierto' || t.estado === 'en_proceso') : t.estado === filtro));
        const cuenta = (f) => todos.filter((t) => (f === 'pendientes' ? (t.estado === 'abierto' || t.estado === 'en_proceso') : t.estado === f)).length;
        cont.innerHTML = `
            <div class="sop-cabeza">
                <div><h2>${esSoporte() ? 'Bandeja de soporte' : 'Soporte técnico'}</h2>
                <p class="vista-intro">${esSoporte() ? 'Solicitudes de emprendedoras, dinamizadoras y secretarías. Responde aquí: la persona ve tu respuesta en su pestaña «Soporte».' : '¿Algo no funciona en la plataforma? Cuéntanos y la Secretaría Técnica te responde aquí mismo.'}</p></div>
                <button type="button" class="btn btn-primario" data-nueva>Nueva solicitud</button>
            </div>
            ${esSoporte() ? `<div class="sop-filtros" role="group" aria-label="Filtrar solicitudes">${[['pendientes', 'Por atender'], ['resuelto', 'Resueltas'], ['cerrado', 'Cerradas'], ['todas', 'Todas']].map(([k, t]) => `<button type="button" data-filtro="${k}" aria-pressed="${filtro === k}">${t}${k !== 'todas' ? ` <b>${cuenta(k)}</b>` : ''}</button>`).join('')}</div>` : ''}
            <div id="sop-nueva"></div>
            ${lista.length ? `<ul class="sop-lista lista-limpia">${lista.map((t) => `<li><button type="button" class="sop-fila" data-ticket="${esc(t.id)}">
                <span class="sop-fila-principal"><b>${esc(t.asunto)}</b><small>${esc(t.numero)} · ${esc(t.categoria_nombre)}${esSoporte() ? ` · ${esc(t.nombre)}${t.rol ? ` (${esc(ROLES[t.rol] || t.rol)})` : ''}${t.publico ? ' · sin cuenta' : ''}` : ''}</small></span>
                <span class="sop-fila-lado">${chip(t.estado)}<small>${esc(fecha(t.actualizado_en))}${t.ultimo_de === 'soporte' && !esSoporte() ? ' · <b class="sop-nuevo">Te respondieron</b>' : ''}${t.ultimo_de === 'usuario' && esSoporte() && t.estado !== 'cerrado' ? ' · <b class="sop-nuevo">Espera respuesta</b>' : ''}</small></span>
            </button></li>`).join('')}</ul>` : `<p class="tarjeta vacio">${esSoporte() ? 'No hay solicitudes en esta lista.' : 'Todavía no has abierto solicitudes de soporte.'}</p>`}`;
        cont.onclick = (e) => {
            const f = e.target.closest('[data-filtro]');
            if (f) { filtro = f.dataset.filtro; pintar(cont, C); return; }
            if (e.target.closest('[data-nueva]')) { formularioNuevo(cont); return; }
            const t = e.target.closest('[data-ticket]');
            if (t) abrir(cont, t.dataset.ticket);
        };
    }

    function formularioNuevo(cont) {
        const caja = $('#sop-nueva', cont);
        if (caja.innerHTML) { caja.innerHTML = ''; return; }
        caja.innerHTML = `<form class="tarjeta sop-form" novalidate>
            <h3>Nueva solicitud</h3>
            <label class="etiqueta" for="sop-cat">¿Sobre qué es?</label>
            <select id="sop-cat" name="categoria" class="campo">${CATEGORIAS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
            <label class="etiqueta" for="sop-asunto">Asunto</label>
            <input id="sop-asunto" name="asunto" class="campo" maxlength="120" placeholder="Por ejemplo: no me carga el video del módulo 2" required>
            <label class="etiqueta" for="sop-desc">Cuéntanos qué pasa</label>
            <textarea id="sop-desc" name="descripcion" class="campo" rows="4" maxlength="3000" placeholder="Qué estabas haciendo, qué esperabas y qué pasó. Si sale un mensaje de error, cópialo aquí." required></textarea>
            <label class="etiqueta" for="sop-adj">Captura de pantalla o foto (opcional)</label>
            <input id="sop-adj" name="adjunto" type="file" class="campo" accept="image/*,application/pdf">
            <div class="fila-btn"><button type="submit" class="btn btn-primario">Enviar solicitud</button><button type="button" class="btn btn-borde" data-cancelar>Cancelar</button></div>
        </form>`;
        const form = $('form', caja);
        $('[data-cancelar]', form).addEventListener('click', () => { caja.innerHTML = ''; });
        $('#sop-asunto', form).focus();
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const b = $('button[type="submit"]', form);
            b.disabled = true; b.textContent = 'Enviando…';
            try {
                const adjunto = form.adjunto.files[0] ? await prepararArchivo(form.adjunto.files[0]) : null;
                const r = await C.pedir('ticket-crear', { categoria: form.categoria.value, asunto: form.asunto.value, descripcion: form.descripcion.value, adjunto });
                C.aviso(`Listo: tu solicitud ${r.ticket.numero} quedó registrada. Te responderemos aquí.`);
                await pintar(cont, C);
            } catch (err) { C.aviso(err.message); b.disabled = false; b.textContent = 'Enviar solicitud'; }
        });
    }

    async function abrir(cont, id) {
        cont.onclick = null;
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando la solicitud…</p>';
        let t;
        try { t = (await C.pedir('ticket', { id })).ticket; } catch (e) { C.aviso(e.message); pintar(cont, C); return; }
        const sat = t.satelite && C.satelite ? C.satelite(t.satelite) : null;
        const abierta = t.estado !== 'cerrado';
        cont.innerHTML = `
            <button type="button" class="boton-texto" data-volver>← Volver a las solicitudes</button>
            <div class="sop-ficha tarjeta">
                <div class="sop-ficha-cabeza"><div><p class="eyebrow">${esc(t.numero)} · ${esc(t.categoria_nombre)}</p><h3>${esc(t.asunto)}</h3></div>${chip(t.estado)}</div>
                ${esSoporte() ? `<p class="texto-suave sop-quien"><b>${esc(t.nombre)}</b>${t.rol ? ` · ${esc(ROLES[t.rol] || t.rol)}` : ''} · CC ${esc(t.cedula)}${sat ? ` · ${esc(sat.nombre)}` : ''}${t.contacto ? ` · Contacto: ${esc(t.contacto)}` : ''}${t.dispositivo ? ` · Desde: ${esc(t.dispositivo)}` : ''}${t.publico ? ' · <span class="chip">Solicitud sin cuenta</span>' : ''}</p>` : ''}
                ${t.adjunto ? `<p><button type="button" class="boton-texto" data-adjunto>📎 Ver adjunto (${esc(t.adjunto.nombre)})</button></p>` : ''}
                <ol class="sop-mensajes lista-limpia">${t.mensajes.map((m) => `<li class="sop-msj ${m.de === 'soporte' ? 'de-soporte' : 'de-usuario'}"><div class="sop-msj-cabeza"><b>${esc(m.de === 'soporte' ? `${m.nombre} · Soporte CIC` : m.nombre)}</b><small>${esc(fecha(m.en))}</small></div><p>${esc(m.texto).replace(/\n/g, '<br>')}</p></li>`).join('')}</ol>
                ${abierta ? `<form class="sop-responder" novalidate>
                    <label class="etiqueta" for="sop-resp">${esSoporte() ? 'Tu respuesta' : 'Agregar un mensaje'}</label>
                    <textarea id="sop-resp" name="texto" class="campo" rows="3" maxlength="3000" required></textarea>
                    <div class="fila-btn"><button type="submit" class="btn btn-primario">Enviar</button>
                    ${esSoporte() ? `<label class="sr-only" for="sop-estado">Estado</label><select id="sop-estado" class="campo campo-mini" data-estado>${Object.entries(ESTADOS).map(([k, [n]]) => `<option value="${k}" ${k === t.estado ? 'selected' : ''}>${n}</option>`).join('')}</select>`
                        : `${t.estado !== 'resuelto' ? '<button type="button" class="btn btn-borde" data-marcar-estado="resuelto">Ya se solucionó</button>' : ''}<button type="button" class="boton-texto" data-marcar-estado="cerrado">Cerrar solicitud</button>`}</div>
                </form>` : '<p class="nota">Esta solicitud está cerrada. Si necesitas más ayuda, abre una nueva.</p>'}
            </div>`;
        const recargar = () => abrir(cont, id);
        cont.onclick = async (e) => {
            if (e.target.closest('[data-volver]')) { pintar(cont, C); return; }
            if (e.target.closest('[data-adjunto]')) {
                const ventana = window.open('', '_blank');
                try { abrirArchivo(await C.pedir('ticket-adjunto', { id }), ventana); } catch (err) { if (ventana) ventana.close(); C.aviso(err.message); }
                return;
            }
            const m = e.target.closest('[data-marcar-estado]');
            if (m) { try { await C.pedir('ticket-estado', { id, estado: m.dataset.marcarEstado }); C.aviso('Solicitud actualizada.'); recargar(); } catch (err) { C.aviso(err.message); } }
        };
        cont.onchange = async (e) => {
            if (!e.target.matches('[data-estado]')) return;
            try { await C.pedir('ticket-estado', { id, estado: e.target.value }); C.aviso('Estado actualizado.'); recargar(); } catch (err) { C.aviso(err.message); }
        };
        const form = $('.sop-responder', cont);
        if (form) form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (form.texto.value.trim().length < 2) { C.aviso('Escribe tu mensaje.'); return; }
            const b = $('button[type="submit"]', form);
            b.disabled = true;
            try { await C.pedir('ticket-responder', { id, texto: form.texto.value }); C.aviso('Mensaje enviado.'); recargar(); } catch (err) { C.aviso(err.message); b.disabled = false; }
        });
    }

    // ---------- Archivos: las fotos se reducen antes de enviarlas; los PDF van tal cual (máximo 3 MB) ----------
    const leerComoBase64 = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(new Error('No pudimos leer el archivo.')); r.readAsDataURL(blob); });
    async function prepararArchivo(f) {
        if (f.type === 'application/pdf') {
            if (f.size > 3 * 1024 * 1024) throw new Error('El PDF pesa más de 3 MB.');
            return { nombre: f.name, mime: f.type, base64: await leerComoBase64(f) };
        }
        if (!f.type.startsWith('image/')) throw new Error('El adjunto debe ser una foto o un PDF.');
        const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No pudimos abrir la imagen.')); i.src = URL.createObjectURL(f); });
        const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.naturalWidth * escala); lienzo.height = Math.round(img.naturalHeight * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(img.src);
        const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
        return { nombre: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', base64: await leerComoBase64(blob) };
    }
    function abrirArchivo(r, ventana) {
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
        if (ventana) ventana.location.href = url;
        else { const a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    window.CICSoporte = { pintar };
})();
