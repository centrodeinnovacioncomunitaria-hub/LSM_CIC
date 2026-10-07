// Foro de la comunidad del CIC. Usa la misma sesión de la página principal (Firebase Authentication)
// y la Cloud Function «cicAcceso» (acciones foro-*). Sin sesión, muestra cómo ingresar.
(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const parrafos = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    const CFG = window.CIC_CONFIG || {};
    const FB = CFG.firebase || {};
    const FUNCION = CFG.funcionUrl || (FB.projectId ? `https://us-central1-${FB.projectId}.cloudfunctions.net/cicAcceso` : '');
    const app = $('#foro-app');
    const INICIO = '../';
    let auth = null;
    let categorias = {};
    let filtro = '';
    let moderar = false;

    const hace = (f) => {
        const s = Math.floor((Date.now() - new Date(f)) / 1000);
        if (s < 60) return 'hace un momento';
        if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
        if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
        const d = Math.floor(s / 86400);
        return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const inicial = (n) => String(n || '?').trim().charAt(0).toUpperCase();
    const COLOR_ROL = { Emprendedora: 'bg-durazno', Dinamizadora: 'bg-menta', 'Secretaría Técnica': 'bg-lavanda', 'Administración': 'bg-mantequilla' };

    let temporizador;
    function aviso(t) {
        let a = $('#aviso-foro');
        if (!a) { a = document.createElement('div'); a.id = 'aviso-foro'; a.className = 'aviso'; a.setAttribute('role', 'status'); document.body.appendChild(a); }
        a.textContent = t; a.hidden = false;
        clearTimeout(temporizador); temporizador = setTimeout(() => { a.hidden = true; }, 5000);
    }

    const cargar = (src) => new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo conectar. Revisa tu internet.')); document.head.appendChild(s); });
    async function conectar() {
        if (auth) return auth;
        await cargar('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
        await cargar('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
        const fb = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FB);
        auth = fb.auth();
        return auth;
    }
    async function llamar(accion, datos = {}) {
        const t = auth && auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const direcciones = [FUNCION, CFG.funcionAlterna].filter(Boolean);
        let r;
        for (let i = 0; i < 4 && !r; i++) {
            try { r = await fetch(direcciones[i % direcciones.length], { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ accion, ...datos }) }); }
            catch (e) { await new Promise((ok) => setTimeout(ok, 1200)); }
        }
        if (!r) throw new Error('No pudimos comunicarnos con el servidor del CIC. Intenta de nuevo en un momento.');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(j.mensaje || 'No pudimos completar la solicitud.'); e.estado = r.status; throw e; }
        return j;
    }

    // ---------- Sin sesión ----------
    function pintarPuerta(demo) {
        app.innerHTML = `<div class="foro-puerta">
            <span class="puerta-candado" aria-hidden="true"><svg><use href="#candado"/></svg></span>
            <h2>${demo ? 'El foro se activa con la plataforma' : 'Ingresa para ver y participar en el foro'}</h2>
            <p class="texto-suave">${demo ? 'Cuando la plataforma esté conectada, aquí verás las conversaciones de la comunidad.' : 'El foro es solo para la comunidad del CIC: emprendedoras inscritas, dinamizadoras y Secretaría Técnica. Así cuidamos lo que cada una comparte.'}</p>
            <div class="botones" style="display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;margin-top:1rem">
                <a class="btn btn-primario" href="${INICIO}#ingresar">Ingresar</a>
                <a class="btn btn-borde" href="${INICIO}#crear-cuenta">Inscribirme como emprendedora</a>
            </div>
        </div>`;
    }

    // ---------- Lista de conversaciones ----------
    async function pintarLista() {
        app.innerHTML = '<p class="vista-intro" role="status">Cargando conversaciones…</p>';
        let r;
        try { r = await llamar('foro-temas', filtro ? { categoria: filtro } : {}); } catch (e) { if (e.estado === 401) return pintarPuerta(); app.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        categorias = r.categorias; moderar = r.puede_moderar;
        app.innerHTML = `<div class="foro-rejilla">
            <aside class="foro-lateral">
                <button type="button" class="btn btn-primario ancho" data-nuevo>+ Nueva conversación</button>
                <nav aria-label="Temas del foro"><ul class="lista-limpia foro-categorias">
                    <li><button type="button" data-cat="" class="${filtro ? '' : 'activa'}">Todas las conversaciones</button></li>
                    ${Object.entries(categorias).map(([k, n]) => `<li><button type="button" data-cat="${esc(k)}" class="${filtro === k ? 'activa' : ''}">${esc(n)}</button></li>`).join('')}
                </ul></nav>
            </aside>
            <div class="foro-lista">
                <div class="foro-lista-cab"><h2>${esc(filtro ? categorias[filtro] : 'Todas las conversaciones')}</h2><span class="texto-suave">${r.temas.length} ${r.temas.length === 1 ? 'conversación' : 'conversaciones'}</span></div>
                ${r.temas.length ? r.temas.map((t) => `<article class="tema aparece visible">
                    <span class="avatar ${COLOR_ROL[t.autor_rol] || 'bg-menta'}" aria-hidden="true">${esc(inicial(t.autor))}</span>
                    <div class="tema-cuerpo">
                        <p class="tema-meta">${t.fijado ? '<span class="chip bg-mantequilla">📌 Fijada</span> ' : ''}<span class="chip">${esc(categorias[t.categoria] || t.categoria)}</span></p>
                        <h3><button type="button" class="tema-titulo" data-tema="${esc(t.id)}">${esc(t.titulo)}</button></h3>
                        <p class="tema-extracto">${esc(t.extracto)}${t.extracto.length >= 180 ? '…' : ''}</p>
                        <p class="tema-pie"><b>${esc(t.autor)}</b> · ${esc(t.autor_rol)} · ${esc(hace(t.creado_en))}</p>
                    </div>
                    <span class="tema-respuestas" aria-label="${t.respuestas} respuestas"><b>${t.respuestas}</b><small>${t.respuestas === 1 ? 'respuesta' : 'respuestas'}</small></span>
                </article>`).join('') : `<div class="tarjeta vacio"><p><b>Todavía no hay conversaciones${filtro ? ' en este tema' : ''}.</b></p><p class="texto-suave">¡Abre la primera! Cuéntanos una duda o algo que te haya funcionado en tu negocio.</p></div>`}
            </div>
        </div>`;
    }

    // ---------- Una conversación ----------
    async function pintarTema(id) {
        app.innerHTML = '<p class="vista-intro" role="status">Cargando la conversación…</p>';
        let r;
        try { r = await llamar('foro-tema', { id }); } catch (e) { aviso(e.message); return pintarLista(); }
        moderar = r.puede_moderar;
        const t = r.tema;
        const borrar = (tipo, x) => (x.mio || moderar) ? `<button type="button" class="boton-texto" data-borrar="${tipo}" data-id="${esc(x.id)}">Quitar</button>` : '';
        app.innerHTML = `<div class="foro-tema">
            <button type="button" class="boton-texto" data-volver>← Todas las conversaciones</button>
            <article class="mensaje-foro mensaje-principal">
                <p class="tema-meta">${t.fijado ? '<span class="chip bg-mantequilla">📌 Fijada</span> ' : ''}<span class="chip">${esc(t.categoria_nombre)}</span></p>
                <h2>${esc(t.titulo)}</h2>
                <div class="mensaje-autor"><span class="avatar ${COLOR_ROL[t.autor_rol] || 'bg-menta'}" aria-hidden="true">${esc(inicial(t.autor))}</span><span><b>${esc(t.autor)}</b><small>${esc(t.autor_rol)} · ${esc(hace(t.creado_en))}</small></span></div>
                <div class="mensaje-texto">${parrafos(t.texto)}</div>
                <p class="mensaje-acciones">${borrar('tema', t)}${moderar ? `<button type="button" class="boton-texto" data-fijar="${t.fijado ? '0' : '1'}" data-id="${esc(t.id)}">${t.fijado ? 'Desfijar' : 'Fijar arriba'}</button>` : ''}</p>
            </article>
            <h3 class="subtitulo-seccion">${r.respuestas.length} ${r.respuestas.length === 1 ? 'respuesta' : 'respuestas'}</h3>
            ${r.respuestas.map((x) => `<article class="mensaje-foro">
                <div class="mensaje-autor"><span class="avatar ${COLOR_ROL[x.autor_rol] || 'bg-menta'}" aria-hidden="true">${esc(inicial(x.autor))}</span><span><b>${esc(x.autor)}</b><small>${esc(x.autor_rol)} · ${esc(hace(x.creado_en))}</small></span></div>
                <div class="mensaje-texto">${parrafos(x.texto)}</div>
                <p class="mensaje-acciones">${borrar('respuesta', x)}</p>
            </article>`).join('')}
            <form class="tarjeta form-responder" novalidate>
                <label class="etiqueta" for="foro-resp">Tu respuesta</label>
                <textarea class="campo" id="foro-resp" name="texto" rows="4" maxlength="3000" required></textarea>
                <button type="submit" class="btn btn-primario" style="margin-top:.8rem">Responder</button>
            </form>
        </div>`;
        app.dataset.tema = id;
    }

    // ---------- Nueva conversación ----------
    function pintarNueva() {
        app.innerHTML = `<form class="tarjeta form-nuevo" novalidate>
            <button type="button" class="boton-texto" data-volver>← Volver</button>
            <h2 style="margin:.6rem 0 1rem">Nueva conversación</h2>
            <label class="etiqueta" for="foro-cat">Tema</label>
            <select class="campo" id="foro-cat" name="categoria">${Object.entries(categorias).map(([k, n]) => `<option value="${esc(k)}" ${filtro === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            <label class="etiqueta" for="foro-tit">Título</label>
            <input class="campo" id="foro-tit" name="titulo" maxlength="140" placeholder="Ej.: ¿Cómo calculan el precio de un producto nuevo?" required>
            <label class="etiqueta" for="foro-txt">Cuéntanos</label>
            <textarea class="campo" id="foro-txt" name="texto" rows="6" maxlength="5000" required></textarea>
            <small class="ayuda-campo">No publiques cédulas, teléfonos ni datos de otras personas.</small>
            <button type="submit" class="btn btn-primario" style="margin-top:1rem">Publicar</button>
        </form>`;
        $('#foro-tit').focus();
    }

    // ---------- Eventos ----------
    app.addEventListener('click', async (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.cat !== undefined) { filtro = b.dataset.cat; return pintarLista(); }
        if (b.hasAttribute('data-nuevo')) return pintarNueva();
        if (b.hasAttribute('data-volver')) return pintarLista();
        if (b.dataset.tema) { pintarTema(b.dataset.tema); window.scrollTo({ top: app.getBoundingClientRect().top + scrollY - 100 }); return; }
        if (b.dataset.borrar) {
            if (!confirm('¿Quitar este mensaje del foro?')) return;
            try { await llamar('foro-borrar', { tipo: b.dataset.borrar, id: b.dataset.id }); aviso('Mensaje quitado.'); b.dataset.borrar === 'tema' ? pintarLista() : pintarTema(app.dataset.tema); } catch (e) { aviso(e.message); }
            return;
        }
        if (b.dataset.fijar) {
            try { await llamar('foro-fijar', { id: b.dataset.id, fijado: b.dataset.fijar === '1' }); pintarTema(b.dataset.id); } catch (e) { aviso(e.message); }
        }
    });
    app.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target, b = $('button[type="submit"]', f);
        b.disabled = true;
        try {
            if (f.classList.contains('form-nuevo')) {
                const r = await llamar('foro-publicar', { categoria: f.categoria.value, titulo: f.titulo.value.trim(), texto: f.texto.value.trim() });
                aviso('¡Conversación publicada!');
                pintarTema(r.id);
            } else {
                await llamar('foro-responder', { id: app.dataset.tema, texto: f.texto.value.trim() });
                pintarTema(app.dataset.tema);
            }
        } catch (e) { aviso(e.message); b.disabled = false; }
    });

    // ---------- Arranque ----------
    (async () => {
        if (!(FB.apiKey && FB.projectId)) return pintarPuerta(true);
        try {
            await conectar();
            const u = await new Promise((ok) => { const fin = auth.onAuthStateChanged((x) => { fin(); ok(x); }); });
            if (!u) return pintarPuerta();
            await pintarLista();
        } catch (e) { app.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
    })();
})();
