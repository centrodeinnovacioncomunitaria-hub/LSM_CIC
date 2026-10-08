// Emprendimientos: la Secretaría Técnica asigna cada emprendimiento a una dinamizadora de su satélite y la
// dinamizadora chulea si cada actividad (6 semanas HACER y 4 talleres SER) se ejecutó; si se ejecutó, sube el
// acta de la sesión y la herramienta diligenciada. Lo usa la vista «Seguimiento» de index.html.
(() => {
    'use strict';
    let C = null; // contexto de la página: perfil, llamar, aviso, esc, satelite, SATELITES, DEMO
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (v) => C.esc(v);
    const MAX_BYTES = 5 * 1024 * 1024;
    const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const nombreSat = (id) => { const s = C.satelite(id); return s ? s.nombre : ''; };
    const whatsapp = (cel) => { const d = String(cel || '').replace(/\D/g, ''); return d.length >= 10 ? `https://wa.me/57${d.slice(-10)}` : null; };

    function barraAvance(a) {
        const pct = Math.round((a.ejecutadas / a.total) * 100);
        return `<div class="emp-avance" title="${a.ejecutadas} de ${a.total} actividades ejecutadas">
            <span class="emp-barra"><span style="width:${pct}%"></span></span>
            <small>${a.ejecutadas}/${a.total} ejecutadas · ${a.con_documentos} con documentos${a.no_ejecutadas ? ` · ${a.no_ejecutadas} no ejecutada${a.no_ejecutadas > 1 ? 's' : ''}` : ''}</small>
        </div>`;
    }
    const enDemo = (cont) => { cont.innerHTML = '<p class="tarjeta vacio">En la demostración no hay emprendimientos reales: en la plataforma aquí se asignan y se les hace seguimiento.</p>'; };

    // ================================================================ Secretaría: asignación
    let estadoS = { datos: null, sat: '', filtro: '', texto: '', sel: new Set() };
    async function secretaria(cont, ctx) {
        C = ctx;
        cont.onclick = null; cont.onchange = null;
        if (C.DEMO) return enDemo(cont);
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando emprendimientos…</p>';
        try { estadoS.datos = await C.llamar('emprendimientos', {}, true); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        estadoS.sel = new Set();
        pintarSecretaria(cont);
    }
    const dinDe = (sat) => estadoS.datos.dinamizadoras.filter((d) => d.satelite === sat);
    function opcionesDin(sat, actual) {
        return `<option value="">Sin asignar</option>${dinDe(sat).map((d) => `<option value="${esc(d.cedula)}" ${d.cedula === actual ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}`;
    }
    function filtrados() {
        const t = estadoS.texto.toLowerCase();
        return estadoS.datos.emprendimientos.filter((x) => (!estadoS.sat || x.satelite === estadoS.sat)
            && (!estadoS.filtro || (estadoS.filtro === 'sin' ? !x.dinamizadora : !!x.dinamizadora))
            && [x.nombre, x.cedula, x.negocio, x.municipio].join(' ').toLowerCase().includes(t));
    }
    function pintarSecretaria(cont) {
        const emp = estadoS.datos.emprendimientos;
        const sin = emp.filter((x) => !x.dinamizadora).length;
        const sats = C.SATELITES.filter((s) => emp.some((x) => x.satelite === s.id) || estadoS.datos.dinamizadoras.some((d) => d.satelite === s.id));
        cont.innerHTML = `
            <div class="emp-cabeza">
                <div><h3>Emprendimientos y dinamizadoras</h3>
                <p class="vista-intro">Asigna cada emprendimiento a una dinamizadora de su mismo satélite. Ella marcará si cada actividad se ejecutó y subirá el acta y la herramienta diligenciada.</p></div>
                <div class="emp-kpis"><span><b>${emp.length}</b> emprendimientos</span><span class="${sin ? 'emp-alerta' : ''}"><b>${sin}</b> sin asignar</span></div>
            </div>
            ${estadoS.datos.drive && estadoS.datos.drive.activo ? `<p class="emp-drive-barra">📁 Los documentos se guardan también en Google Drive, en la carpeta «CIC · Documentos de seguimiento», ordenados por satélite, emprendimiento y semana.${estadoS.datos.drive.pendientes ? ` <button type="button" class="btn btn-borde btn-pequeno" data-sincronizar>Enviar a Drive ${estadoS.datos.drive.pendientes} pendiente${estadoS.datos.drive.pendientes > 1 ? 's' : ''}</button>` : ''}</p>` : ''}
            <div class="controles">
                <div style="flex:0 1 13rem"><label class="etiqueta" for="emp-sat">Satélite</label><select id="emp-sat" class="campo"><option value="">Todos</option>${sats.map((s) => `<option value="${esc(s.id)}" ${estadoS.sat === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></div>
                <div style="flex:0 1 12rem"><label class="etiqueta" for="emp-filtro">Mostrar</label><select id="emp-filtro" class="campo"><option value="">Todos</option><option value="sin" ${estadoS.filtro === 'sin' ? 'selected' : ''}>Sin asignar</option><option value="con" ${estadoS.filtro === 'con' ? 'selected' : ''}>Asignados</option></select></div>
                <div><label class="etiqueta" for="emp-buscar">Buscar</label><input id="emp-buscar" class="campo" type="search" placeholder="Nombre, cédula, negocio…" value="${esc(estadoS.texto)}"></div>
            </div>
            <div id="emp-lote" class="emp-lote" hidden></div>
            <div id="emp-tabla"></div>`;
        pintarTabla(cont);
        $('#emp-sat', cont).addEventListener('change', (e) => { estadoS.sat = e.target.value; estadoS.sel.clear(); pintarTabla(cont); });
        const sinc = $('[data-sincronizar]', cont);
        if (sinc) sinc.addEventListener('click', async () => {
            sinc.disabled = true; sinc.textContent = 'Enviando…';
            try {
                const r = await C.llamar('sincronizar-drive', {}, true);
                C.aviso(r.pendientes ? `Se enviaron ${r.enviados}. Quedan ${r.pendientes}: vuelve a tocar el botón.` : `Listo: se enviaron ${r.enviados} documentos a Google Drive.`);
                estadoS.datos = await C.llamar('emprendimientos', {}, true);
                pintarSecretaria(cont);
            } catch (e) { C.aviso(e.message); sinc.disabled = false; sinc.textContent = 'Enviar a Drive'; }
        });
        $('#emp-filtro', cont).addEventListener('change', (e) => { estadoS.filtro = e.target.value; pintarTabla(cont); });
        $('#emp-buscar', cont).addEventListener('input', (e) => { estadoS.texto = e.target.value; pintarTabla(cont); });
    }
    function pintarTabla(cont) {
        const lista = filtrados();
        const caja = $('#emp-tabla', cont);
        if (!lista.length) { caja.innerHTML = '<p class="tarjeta vacio">No hay emprendimientos con ese filtro.</p>'; pintarLote(cont); return; }
        const todos = lista.every((x) => estadoS.sel.has(x.cedula));
        caja.innerHTML = `<div class="tabla-caja"><table class="emp-tabla">
            <thead><tr>
                <th scope="col" class="emp-check"><input type="checkbox" id="emp-todos" aria-label="Seleccionar todos" ${todos ? 'checked' : ''}></th>
                <th scope="col">Emprendimiento</th><th scope="col">Satélite</th><th scope="col">Dinamizadora</th><th scope="col">Seguimiento</th><th scope="col"><span class="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody>${lista.map((x) => `<tr>
                <td class="emp-check"><input type="checkbox" data-sel="${esc(x.cedula)}" aria-label="Seleccionar ${esc(x.nombre)}" ${estadoS.sel.has(x.cedula) ? 'checked' : ''}></td>
                <td><b>${esc(x.nombre)}</b><small>${esc(x.negocio || 'Sin nombre de negocio')} · CC ${esc(x.cedula)}</small></td>
                <td>${esc(nombreSat(x.satelite))}<small>${esc(x.municipio || '')}</small></td>
                <td><label class="sr-only" for="din-${esc(x.cedula)}">Dinamizadora de ${esc(x.nombre)}</label>
                    <select id="din-${esc(x.cedula)}" class="campo campo-mini" data-asignar="${esc(x.cedula)}">${opcionesDin(x.satelite, x.dinamizadora)}</select>
                    ${dinDe(x.satelite).length ? '' : '<small class="emp-alerta">Este satélite aún no tiene dinamizadoras en el directorio</small>'}</td>
                <td>${barraAvance(x.avance)}</td>
                <td><button type="button" class="boton-texto" data-ver="${esc(x.cedula)}">Ver seguimiento</button></td>
            </tr>`).join('')}</tbody></table></div>`;
        $('#emp-todos', caja).addEventListener('change', (e) => { lista.forEach((x) => (e.target.checked ? estadoS.sel.add(x.cedula) : estadoS.sel.delete(x.cedula))); pintarTabla(cont); });
        caja.onchange = async (e) => {
            const s = e.target.closest('[data-sel]');
            if (s) { s.checked ? estadoS.sel.add(s.dataset.sel) : estadoS.sel.delete(s.dataset.sel); pintarLote(cont); return; }
            const a = e.target.closest('[data-asignar]');
            if (a) await asignar(cont, [a.dataset.asignar], a.value);
        };
        caja.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, () => secretaria(cont, C)); };
        pintarLote(cont);
    }
    function pintarLote(cont) {
        const lote = $('#emp-lote', cont);
        const elegidos = estadoS.datos.emprendimientos.filter((x) => estadoS.sel.has(x.cedula));
        if (!elegidos.length) { lote.hidden = true; return; }
        const sats = [...new Set(elegidos.map((x) => x.satelite))];
        lote.hidden = false;
        lote.innerHTML = sats.length > 1
            ? `<span><b>${elegidos.length}</b> seleccionados de ${sats.length} satélites distintos. Para asignar en grupo, filtra por un solo satélite.</span>`
            : `<span><b>${elegidos.length}</b> seleccionado${elegidos.length > 1 ? 's' : ''} de ${esc(nombreSat(sats[0]))}</span>
               <label class="sr-only" for="emp-lote-din">Dinamizadora</label>
               <select id="emp-lote-din" class="campo campo-mini"><option value="" disabled selected>Elige una dinamizadora</option>${dinDe(sats[0]).map((d) => `<option value="${esc(d.cedula)}">${esc(d.nombre)}</option>`).join('')}<option value="quitar">Quitar asignación</option></select>
               <button type="button" class="btn btn-primario btn-pequeno" id="emp-lote-btn">Asignar</button>`;
        const b = $('#emp-lote-btn', lote);
        if (b) b.addEventListener('click', () => {
            const v = $('#emp-lote-din', lote).value;
            if (!v) { C.aviso('Elige primero la dinamizadora.'); return; }
            asignar(cont, elegidos.map((x) => x.cedula), v === 'quitar' ? null : v);
        });
    }
    async function asignar(cont, cedulas, dinamizadora) {
        try {
            const r = await C.llamar('asignar', { cedulas, dinamizadora: dinamizadora || null }, true);
            C.aviso(r.dinamizadora ? `Listo: ${r.asignados} emprendimiento${r.asignados > 1 ? 's' : ''} asignado${r.asignados > 1 ? 's' : ''} a ${r.dinamizadora}.` : 'Listo: se quitó la asignación.');
            estadoS.datos = await C.llamar('emprendimientos', {}, true);
            estadoS.sel.clear();
            pintarTabla(cont);
            const kpis = cont.querySelector('.emp-kpis');
            if (kpis) { const sin = estadoS.datos.emprendimientos.filter((x) => !x.dinamizadora).length; kpis.innerHTML = `<span><b>${estadoS.datos.emprendimientos.length}</b> emprendimientos</span><span class="${sin ? 'emp-alerta' : ''}"><b>${sin}</b> sin asignar</span>`; }
        } catch (e) { C.aviso(e.message); pintarTabla(cont); }
    }

    // ================================================================ Dinamizadora: sus emprendimientos
    async function dinamizadora(cont, ctx) {
        C = ctx;
        cont.onclick = null; cont.onchange = null;
        if (C.DEMO) return enDemo(cont);
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando tus emprendimientos…</p>';
        let r;
        try { r = await C.llamar('mis-emprendimientos', {}, true); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        const lista = r.emprendimientos;
        cont.innerHTML = `
            <div class="emp-cabeza"><div><h3>Mis emprendimientos</h3>
            <p class="vista-intro">Estos son los emprendimientos que la Secretaría Técnica te asignó. Después de cada sesión, marca si se ejecutó y sube el acta y la herramienta diligenciada.</p></div>
            <div class="emp-kpis"><span><b>${lista.length}</b> asignados</span></div></div>
            ${lista.length ? `<ul class="emp-tarjetas lista-limpia">${lista.map((x) => `<li class="emp-tarjeta">
                <div><b>${esc(x.nombre)}</b><small>${esc(x.negocio || 'Sin nombre de negocio')} · ${esc(x.municipio || '')}</small></div>
                ${barraAvance(x.avance)}
                <button type="button" class="btn btn-primario btn-pequeno" data-ver="${esc(x.cedula)}">Hacer seguimiento</button>
            </li>`).join('')}</ul>` : '<p class="tarjeta vacio">Todavía no tienes emprendimientos asignados. Cuando la Secretaría Técnica te los asigne, aparecerán aquí.</p>'}`;
        cont.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, () => dinamizadora(cont, C)); };
    }

    // ================================================================ Seguimiento de un emprendimiento
    async function abrirSeguimiento(cont, cedula, volver) {
        cont.onclick = null; cont.onchange = null;
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando el seguimiento…</p>';
        let s;
        try { s = await C.llamar('seguimiento', { cedula }, true); } catch (e) { C.aviso(e.message); volver(); return; }
        pintarSeguimiento(cont, s, volver);
        cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function estadoChip(a) {
        if (a.ejecutada === true) { const completos = a.requeridos.every((d) => a.documentos[d.tipo]); return completos ? '<span class="chip emp-ok">Ejecutada · documentos completos</span>' : '<span class="chip emp-pend">Ejecutada · faltan documentos</span>'; }
        if (a.ejecutada === false) return '<span class="chip emp-no">No se ejecutó</span>';
        return '<span class="chip">Pendiente</span>';
    }
    function tarjetaActividad(a) {
        const clave = `${a.ruta}-${a.n}`;
        return `<li class="emp-act ${a.ejecutada === true ? 'es-si' : a.ejecutada === false ? 'es-no' : ''}" data-act="${clave}">
            <div class="emp-act-cabeza"><h5>${esc(a.ruta === 'hacer' ? `Semana ${a.n}` : `Taller ${a.n}`)}</h5>${estadoChip(a)}</div>
            <p class="emp-pregunta">¿Se ejecutó la actividad?</p>
            <div class="emp-sino" role="group" aria-label="¿Se ejecutó ${esc(a.nombre)}?">
                <button type="button" class="emp-si" data-marcar="si" aria-pressed="${a.ejecutada === true}">✓ Sí</button>
                <button type="button" class="emp-no-btn" data-marcar="no" aria-pressed="${a.ejecutada === false}">✕ No</button>
            </div>
            ${a.ejecutada === true ? `
                <label class="etiqueta" for="fecha-${clave}">Fecha de la sesión</label>
                <input type="date" id="fecha-${clave}" class="campo campo-mini" data-fecha value="${esc(a.fecha || '')}">
                <p class="emp-pregunta">Documentos que debes subir</p>
                <ul class="emp-docs lista-limpia">${a.requeridos.map((d) => {
                    const m = a.documentos[d.tipo];
                    return `<li class="emp-doc ${m ? 'subido' : ''}">
                        <span class="emp-doc-icono" aria-hidden="true">${m ? '✓' : d.tipo === 'acta' ? '📝' : '🧰'}</span>
                        <div class="emp-doc-texto"><b>${esc(d.nombre)}</b><small>${m ? `${esc(m.nombre)} · ${kb(m.bytes)}` : esc(d.detalle)}</small>${m && m.drive_url && C.perfil.rol === 'secretaria' ? `<a class="emp-drive" href="${esc(m.drive_url)}" target="_blank" rel="noopener">Abrir en Google Drive</a>` : m && m.drive_url ? '<small class="emp-drive-ok">✓ Copia guardada en Google Drive</small>' : m && m.drive_pendiente ? '<small class="emp-drive-pend">Copia en Google Drive pendiente</small>' : ''}</div>
                        <div class="emp-doc-acciones">
                            ${m ? `<button type="button" class="boton-texto" data-ver-doc="${d.tipo}">Ver</button>` : ''}
                            <label class="btn ${m ? 'btn-borde' : 'btn-primario'} btn-pequeno emp-subir">${m ? 'Reemplazar' : 'Subir foto o PDF'}<input type="file" accept="image/*,application/pdf" data-subir="${d.tipo}" hidden></label>
                            ${m ? `<button type="button" class="boton-texto emp-quitar" data-quitar-doc="${d.tipo}">Quitar</button>` : ''}
                        </div>
                    </li>`;
                }).join('')}</ul>` : ''}
            ${a.ejecutada === false ? `
                <label class="etiqueta" for="motivo-${clave}">¿Por qué no se ejecutó? (opcional)</label>
                <textarea id="motivo-${clave}" class="campo" rows="2" maxlength="300" data-motivo placeholder="Por ejemplo: la emprendedora no estaba disponible">${esc(a.motivo || '')}</textarea>
                <button type="button" class="btn btn-borde btn-pequeno" data-guardar-motivo>Guardar motivo</button>` : ''}
        </li>`;
    }
    function pintarSeguimiento(cont, s, volver) {
        const e = s.emprendimiento;
        const wa = whatsapp(e.celular);
        const grupo = (ruta, titulo) => `<section class="emp-grupo"><h4>${titulo}</h4><ol class="emp-actividades lista-limpia">${s.actividades.filter((a) => a.ruta === ruta).map(tarjetaActividad).join('')}</ol></section>`;
        cont.innerHTML = `
            <button type="button" class="boton-texto emp-volver" data-volver>← Volver a la lista</button>
            <div class="emp-ficha">
                <div><h3>${esc(e.nombre)}</h3><p class="texto-suave">${esc(e.negocio || 'Sin nombre de negocio')} · ${esc(e.municipio || '')} · ${esc(nombreSat(e.satelite))}${e.dinamizadora_nombre ? ` · Dinamizadora: ${esc(e.dinamizadora_nombre)}` : ''}</p></div>
                <div class="emp-ficha-lado">${barraAvance(s.avance)}${wa ? `<a class="enlace" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}</div>
            </div>
            ${grupo('hacer', 'Ruta HACER · sesiones semanales en el negocio')}
            ${grupo('ser', 'Ruta SER · talleres en grupo')}`;
        const actividad = (el) => { const [ruta, n] = el.closest('[data-act]').dataset.act.split('-'); return { cedula: e.cedula, ruta, n: Number(n) }; };
        const actualizar = (nuevo) => { const y = scrollY; pintarSeguimiento(cont, nuevo, volver); scrollTo(0, y); };
        cont.onclick = async (ev) => {
            const t = ev.target;
            if (t.closest('[data-volver]')) { volver(); return; }
            const m = t.closest('[data-marcar]');
            if (m) {
                const a = actividad(m);
                const fecha = m.dataset.marcar === 'si' ? new Date().toLocaleDateString('en-CA') : undefined;
                try { actualizar(await C.llamar('marcar-actividad', { ...a, ejecutada: m.dataset.marcar === 'si', fecha }, true)); } catch (err) { C.aviso(err.message); }
                return;
            }
            const g = t.closest('[data-guardar-motivo]');
            if (g) {
                const li = g.closest('[data-act]');
                try { actualizar(await C.llamar('marcar-actividad', { ...actividad(g), ejecutada: false, motivo: $('[data-motivo]', li).value }, true)); C.aviso('Motivo guardado.'); } catch (err) { C.aviso(err.message); }
                return;
            }
            const v = t.closest('[data-ver-doc]');
            if (v) {
                const ventana = window.open('', '_blank');
                if (ventana) ventana.document.write('<p style="font-family:sans-serif;padding:2rem">Abriendo el documento…</p>');
                try { abrirDocumento(await C.llamar('ver-documento', { ...actividad(v), tipo: v.dataset.verDoc }, true), ventana); } catch (err) { if (ventana) ventana.close(); C.aviso(err.message); }
                return;
            }
            const q = t.closest('[data-quitar-doc]');
            if (q) {
                if (!confirm('¿Quitar este documento? Tendrás que subirlo de nuevo.')) return;
                try { actualizar(await C.llamar('quitar-documento', { ...actividad(q), tipo: q.dataset.quitarDoc }, true)); } catch (err) { C.aviso(err.message); }
            }
        };
        cont.onchange = async (ev) => {
            const t = ev.target;
            if (t.matches('[data-fecha]')) {
                try { actualizar(await C.llamar('marcar-actividad', { ...actividad(t), ejecutada: true, fecha: t.value }, true)); C.aviso('Fecha guardada.'); } catch (err) { C.aviso(err.message); }
                return;
            }
            if (t.matches('[data-subir]') && t.files && t.files[0]) {
                const etiqueta = t.closest('.emp-subir');
                etiqueta.classList.add('cargando');
                etiqueta.firstChild.textContent = 'Subiendo…';
                try {
                    const archivo = await prepararArchivo(t.files[0]);
                    actualizar(await C.llamar('subir-documento', { ...actividad(t), tipo: t.dataset.subir, ...archivo }, true));
                    C.aviso('Documento subido.');
                } catch (err) { C.aviso(err.message); etiqueta.classList.remove('cargando'); etiqueta.firstChild.textContent = 'Subir foto o PDF'; }
            }
        };
    }

    // ---------- Archivos: las fotos se reducen antes de subir; los PDF van tal cual (máximo 5 MB) ----------
    const leerComoBase64 = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(new Error('No pudimos leer el archivo.')); r.readAsDataURL(blob); });
    async function prepararArchivo(f) {
        if (f.type === 'application/pdf') {
            if (f.size > MAX_BYTES) throw new Error('El PDF pesa más de 5 MB. Comprímelo o súbelo en fotos.');
            return { nombre: f.name, mime: f.type, base64: await leerComoBase64(f) };
        }
        if (!f.type.startsWith('image/')) throw new Error('Sube una foto (JPG o PNG) o un PDF.');
        const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No pudimos abrir la foto. Intenta con otra o en formato JPG.')); i.src = URL.createObjectURL(f); });
        const escala = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.naturalWidth * escala); lienzo.height = Math.round(img.naturalHeight * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(img.src);
        const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
        if (!blob || blob.size > MAX_BYTES) throw new Error('La foto es demasiado grande. Intenta con otra.');
        return { nombre: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', base64: await leerComoBase64(blob) };
    }
    function abrirDocumento(r, ventana) {
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
        if (ventana) ventana.location.href = url;
        else { const a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    window.CICEmprendimientos = { secretaria, dinamizadora };
})();
