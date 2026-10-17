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
            <small>${a.aprobadas || 0} aprobada${a.aprobadas === 1 ? '' : 's'} por la Secretaría${a.por_revisar ? ` · <b class="emp-alerta">${a.por_revisar} por revisar</b>` : ''}${a.devueltas ? ` · ${a.devueltas} devuelta${a.devueltas > 1 ? 's' : ''}` : ''}</small>
        </div>`;
    }
    const REVISION = {
        enviada: ['En revisión de la Secretaría Técnica', 'emp-pend'],
        aprobada: ['✓ Aprobada por la Secretaría Técnica', 'emp-ok'],
        devuelta: ['Devuelta: corrige y vuelve a enviar', 'emp-no'],
    };
    const fechaCorta = (f) => new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const enDemo = (cont) => { cont.innerHTML = '<p class="tarjeta vacio">En la demostración no hay emprendimientos reales: en la plataforma aquí se asignan y se les hace seguimiento.</p>'; };

    // ================================================================ Tabla de seguimiento (tipo hoja de cálculo)
    // Una fila por emprendimiento y una celda por actividad (6 semanas HACER y 4 talleres SER), con filtros.
    // La Secretaría ve todos y asigna dinamizadora; la dinamizadora ve los suyos. Tocar una celda abre esa actividad.
    const COLUMNAS = [...[1, 2, 3, 4, 5, 6].map((n) => ['hacer', n, `S${n}`]), ...[1, 2, 3, 4].map((n) => ['ser', n, `T${n}`])];
    const ESTADO_CELDA = {
        pendiente: ['·', 'c-pendiente', 'Pendiente'],
        sin_docs: ['◐', 'c-sin-docs', 'Ejecutada · faltan documentos'],
        lista: ['E', 'c-lista', 'Ejecutada · lista para enviar'],
        revision: ['…', 'c-revision', 'En revisión de la Secretaría'],
        aprobada: ['✓', 'c-aprobada', 'Aprobada'],
        devuelta: ['!', 'c-devuelta', 'Devuelta para corregir'],
        no: ['✕', 'c-no', 'No se ejecutó'],
    };
    function estadoCelda(c) {
        if (!c || c.e === null) return 'pendiente';
        if (c.r === 'aprobada') return 'aprobada';
        if (c.r === 'devuelta') return 'devuelta';
        if (c.r === 'enviada') return 'revision';
        if (c.e === false) return 'no';
        return c.d ? 'lista' : 'sin_docs';
    }
    const FILTROS = {
        '': 'Todos',
        sin: 'Sin dinamizadora asignada',
        revisar: 'Con actividades por revisar',
        devueltas: 'Con actividades devueltas',
        pendientes_envio: 'Con actividades sin enviar',
        sin_avance: 'Sin ninguna actividad registrada',
        cuestionario: 'Cuestionario habilitado sin responder',
    };
    let H = { datos: null, rol: '', sat: '', din: '', filtro: '', texto: '', sel: new Set() };
    const filas = () => H.datos.emprendimientos;
    function cumpleFiltro(x) {
        const estados = COLUMNAS.map(([r, n]) => estadoCelda(x.celdas[`${r}_${n}`]));
        switch (H.filtro) {
            case 'sin': return !x.dinamizadora;
            case 'revisar': return estados.includes('revision');
            case 'devueltas': return estados.includes('devuelta');
            case 'pendientes_envio': return estados.includes('lista') || estados.includes('sin_docs');
            case 'sin_avance': return estados.every((e) => e === 'pendiente');
            case 'cuestionario': return x.aprendizaje.habilitadas.some((s) => !x.aprendizaje.respondidas.includes(s));
            default: return true;
        }
    }
    function filtrados() {
        const t = H.texto.toLowerCase();
        return filas().filter((x) => (!H.sat || x.satelite === H.sat) && (!H.din || x.dinamizadora === H.din) && cumpleFiltro(x)
            && [x.nombre, x.cedula, x.negocio, x.municipio, x.dinamizadora_nombre].join(' ').toLowerCase().includes(t));
    }
    const dinDe = (sat) => (H.datos.dinamizadoras || []).filter((d) => d.satelite === sat);
    function opcionesDin(sat, actual) {
        return `<option value="">Sin asignar</option>${dinDe(sat).map((d) => `<option value="${esc(d.cedula)}" ${d.cedula === actual ? 'selected' : ''}>${esc(d.nombre)} · CC ${esc(d.cedula)}</option>`).join('')}`;
    }

    async function secretaria(cont, ctx) { C = ctx; await cargarHoja(cont, 'secretaria'); }
    async function dinamizadora(cont, ctx) { C = ctx; await cargarHoja(cont, 'dinamizadora'); }
    async function cargarHoja(cont, rol) {
        cont.onclick = null; cont.onchange = null;
        if (C.DEMO) return enDemo(cont);
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando el seguimiento…</p>';
        try { H.datos = await C.llamar(rol === 'secretaria' ? 'emprendimientos' : 'mis-emprendimientos', {}, true); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        if (H.rol !== rol) H = { datos: H.datos, rol, sat: '', din: '', filtro: '', texto: '', sel: new Set() };
        H.sel = new Set();
        pintarHoja(cont);
    }
    const recargarHoja = (cont) => cargarHoja(cont, H.rol);

    function pintarHoja(cont) {
        const sec = H.rol === 'secretaria';
        const emp = filas();
        const cuenta = (f) => emp.filter((x) => { const g = H.filtro; H.filtro = f; const r = cumpleFiltro(x); H.filtro = g; return r; }).length;
        const sats = C.SATELITES.filter((s) => emp.some((x) => x.satelite === s.id) || (H.datos.dinamizadoras || []).some((d) => d.satelite === s.id));
        const dins = sec ? (H.datos.dinamizadoras || []).filter((d) => !H.sat || d.satelite === H.sat) : [];
        cont.innerHTML = `
            <div class="emp-cabeza">
                <div><h3>${sec ? 'Seguimiento de los emprendimientos' : 'Mis emprendimientos'}</h3>
                <p class="vista-intro">${sec ? 'Cada fila es un emprendimiento y cada casilla una actividad. Asigna la dinamizadora en la columna «Dinamizadora» y toca una casilla para revisar esa actividad.' : 'Cada fila es un emprendimiento que te asignó la Secretaría Técnica. Toca una casilla para marcar la actividad, subir el acta y la herramienta y enviarla a la Secretaría.'}</p></div>
                <div class="emp-kpis"><span><b>${emp.length}</b> emprendimientos</span>${sec ? `<span class="${cuenta('sin') ? 'emp-alerta' : ''}"><b>${cuenta('sin')}</b> sin asignar</span>` : ''}<span class="${cuenta('revisar') ? 'emp-alerta' : ''}"><b>${cuenta('revisar')}</b> con actividades por revisar</span></div>
            </div>
            ${sec && H.datos.drive && H.datos.drive.activo ? `<p class="emp-drive-barra">📁 Los documentos se guardan también en Google Drive, en la carpeta «CIC · Documentos de seguimiento».${H.datos.drive.pendientes ? ` <button type="button" class="btn btn-borde btn-pequeno" data-sincronizar>Enviar a Drive ${H.datos.drive.pendientes} pendiente${H.datos.drive.pendientes > 1 ? 's' : ''}</button>` : ''}</p>` : ''}
            <div class="hoja-controles">
                ${sec ? `<div><label class="etiqueta" for="h-sat">Satélite</label><select id="h-sat" class="campo"><option value="">Todos</option>${sats.map((s) => `<option value="${esc(s.id)}" ${H.sat === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></div>
                <div><label class="etiqueta" for="h-din">Dinamizadora</label><select id="h-din" class="campo"><option value="">Todas</option>${dins.map((d) => `<option value="${esc(d.cedula)}" ${H.din === d.cedula ? 'selected' : ''}>${esc(d.nombre)} · CC ${esc(d.cedula)}</option>`).join('')}</select></div>` : ''}
                <div><label class="etiqueta" for="h-filtro">Mostrar</label><select id="h-filtro" class="campo">${Object.entries(FILTROS).filter(([k]) => sec || k !== 'sin').map(([k, t]) => `<option value="${k}" ${H.filtro === k ? 'selected' : ''}>${esc(t)}${k ? ` (${cuenta(k)})` : ''}</option>`).join('')}</select></div>
                <div class="hoja-buscar"><label class="etiqueta" for="h-buscar">Buscar</label><input id="h-buscar" class="campo" type="search" placeholder="Nombre, cédula, negocio, municipio…" value="${esc(H.texto)}"></div>
                <div><button type="button" class="btn btn-borde btn-pequeno" data-excel>⬇ Descargar en Excel</button></div>
            </div>
            <div class="hoja-leyenda" aria-label="Convenciones">
                <p class="hoja-leyenda-titulo"><b>S1 a S6:</b> semanas de la ruta HACER · <b>T1 a T4:</b> talleres de la ruta SER. Toca cualquier casilla o el botón «Abrir tarjetas» para ver y registrar cada sesión.</p>
                <ul class="lista-limpia hoja-leyenda-lista">${Object.values(ESTADO_CELDA).map(([s, c, t]) => `<li><span class="celda celda-muestra ${c}" aria-hidden="true">${s}</span><span>${esc(t)}</span></li>`).join('')}</ul>
            </div>
            ${sec ? '<div id="emp-lote" class="emp-lote" hidden></div>' : ''}
            <div id="emp-tabla"></div>`;
        pintarFilas(cont);
        const cambiar = (id, k) => { const el = $(id, cont); if (el) el.addEventListener('change', (e) => { H[k] = e.target.value; if (k === 'sat') { H.din = ''; H.sel.clear(); pintarHoja(cont); } else pintarFilas(cont); }); };
        cambiar('#h-sat', 'sat'); cambiar('#h-din', 'din'); cambiar('#h-filtro', 'filtro');
        $('#h-buscar', cont).addEventListener('input', (e) => { H.texto = e.target.value; pintarFilas(cont); });
        $('[data-excel]', cont).addEventListener('click', descargarExcel);
        const sinc = $('[data-sincronizar]', cont);
        if (sinc) sinc.addEventListener('click', async () => {
            sinc.disabled = true; sinc.textContent = 'Enviando…';
            try {
                const r = await C.llamar('sincronizar-drive', {}, true);
                C.aviso(r.pendientes ? `Se enviaron ${r.enviados}. Quedan ${r.pendientes}: vuelve a tocar el botón.` : `Listo: se enviaron ${r.enviados} documentos a Google Drive.`);
                recargarHoja(cont);
            } catch (e) { C.aviso(e.message); sinc.disabled = false; sinc.textContent = 'Enviar a Drive'; }
        });
    }
    function pintarFilas(cont) {
        const sec = H.rol === 'secretaria';
        const lista = filtrados();
        const caja = $('#emp-tabla', cont);
        if (!lista.length) { caja.innerHTML = `<p class="tarjeta vacio">${filas().length ? 'No hay emprendimientos con ese filtro.' : sec ? 'Todavía no hay emprendimientos inscritos.' : 'Todavía no tienes emprendimientos asignados. Cuando la Secretaría Técnica te los asigne, aparecerán aquí.'}</p>`; if (sec) pintarLote(cont); return; }
        const todos = lista.every((x) => H.sel.has(x.cedula));
        caja.innerHTML = `<div class="hoja-caja"><table class="hoja-calculo">
            <thead><tr>${sec ? '<th class="td-sel"><input type="checkbox" id="emp-todos" aria-label="Seleccionar todos" ' + (todos ? 'checked' : '') + '></th>' : ''}
                <th class="col-fija" scope="col">Emprendimiento</th>${sec ? '<th scope="col" class="td-din">Dinamizadora</th>' : ''}
                ${COLUMNAS.map(([r, n, t]) => `<th scope="col" class="td-act" title="${r === 'hacer' ? 'Ruta HACER · semana ' : 'Ruta SER · taller '}${n}">${t}</th>`).join('')}
                <th scope="col" class="td-avance">Avance</th></tr>
            </thead>
            <tbody>${lista.map((x) => `<tr>
                ${sec ? `<td class="td-sel"><input type="checkbox" data-sel="${esc(x.cedula)}" aria-label="Seleccionar ${esc(x.nombre)}" ${H.sel.has(x.cedula) ? 'checked' : ''}></td>` : ''}
                <td class="col-fija"><button type="button" class="boton-texto hoja-nombre" data-ver="${esc(x.cedula)}"><b>${esc(x.nombre)}</b></button>
                    <small>${esc(x.negocio || 'Sin nombre de negocio')} · CC ${esc(x.cedula)}</small>
                    <small>${esc(nombreSat(x.satelite))}${x.municipio ? ` · ${esc(x.municipio)}` : ''} · va en la semana ${esc(x.semana_actual || 1)}</small>
                    <button type="button" class="btn btn-borde btn-pequeno hoja-abrir" data-ver="${esc(x.cedula)}">Abrir tarjetas ›</button></td>
                ${sec ? `<td class="td-din"><label class="sr-only" for="din-${esc(x.cedula)}">Dinamizadora de ${esc(x.nombre)}</label><select id="din-${esc(x.cedula)}" class="campo campo-mini" data-asignar="${esc(x.cedula)}">${opcionesDin(x.satelite, x.dinamizadora)}</select></td>` : ''}
                ${COLUMNAS.map(([r, n, t]) => { const c = x.celdas[`${r}_${n}`]; const [s, cl, txt] = ESTADO_CELDA[estadoCelda(c)]; return `<td class="td-act" data-col="${t}"><button type="button" class="celda ${cl}" data-ver="${esc(x.cedula)}" data-foco="${r}-${n}" title="${esc(`${t} · ${txt}${c && c.f ? ` · ${c.f}` : ''}${c && c.c ? ` · ${c.c} comentario(s)` : ''}`)}" aria-label="${esc(`${x.nombre}, ${r === 'hacer' ? 'semana' : 'taller'} ${n}: ${txt}`)}">${s}</button></td>`; }).join('')}
                <td class="td-avance"><b>${x.avance.aprobadas || 0} de ${x.avance.total}</b> aprobadas<small>Cuestionario: ${x.aprendizaje.respondidas.length} de ${x.aprendizaje.habilitadas.length || 0} respondidos${x.aprendizaje.habilitadas.some((s) => !x.aprendizaje.respondidas.includes(s)) ? ' · <span class="emp-alerta">pendiente</span>' : ''}</small></td>
            </tr>`).join('')}</tbody></table></div>
            <div class="hoja-pie"><span>${lista.length} de ${filas().length} emprendimientos</span><span class="texto-suave">Toca una casilla o «Abrir tarjetas» para ver cada sesión.</span></div>`;
        const todosChk = $('#emp-todos', caja);
        if (todosChk) todosChk.addEventListener('change', (e) => { lista.forEach((x) => (e.target.checked ? H.sel.add(x.cedula) : H.sel.delete(x.cedula))); pintarFilas(cont); });
        caja.onchange = async (e) => {
            const s = e.target.closest('[data-sel]');
            if (s) { s.checked ? H.sel.add(s.dataset.sel) : H.sel.delete(s.dataset.sel); pintarLote(cont); return; }
            const a = e.target.closest('[data-asignar]');
            if (a) await asignar(cont, [a.dataset.asignar], a.value);
        };
        caja.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, () => recargarHoja(cont), b.dataset.foco); };
        if (sec) pintarLote(cont);
    }
    function pintarLote(cont) {
        const lote = $('#emp-lote', cont);
        if (!lote) return;
        const elegidos = filas().filter((x) => H.sel.has(x.cedula));
        if (!elegidos.length) { lote.hidden = true; return; }
        const sats = [...new Set(elegidos.map((x) => x.satelite))];
        lote.hidden = false;
        lote.innerHTML = sats.length > 1
            ? `<span><b>${elegidos.length}</b> seleccionados de ${sats.length} satélites distintos. Para asignar en grupo, filtra por un solo satélite.</span>`
            : `<span><b>${elegidos.length}</b> seleccionado${elegidos.length > 1 ? 's' : ''} de ${esc(nombreSat(sats[0]))}</span>
               <label class="sr-only" for="emp-lote-din">Dinamizadora</label>
               <select id="emp-lote-din" class="campo campo-mini"><option value="" disabled selected>Elige una dinamizadora</option>${dinDe(sats[0]).map((d) => `<option value="${esc(d.cedula)}">${esc(d.nombre)} · CC ${esc(d.cedula)}</option>`).join('')}<option value="quitar">Quitar asignación</option></select>
               <button type="button" class="btn btn-primario btn-pequeno" id="emp-lote-btn">Asignar</button>`;
        const b = $('#emp-lote-btn', lote);
        if (b) b.addEventListener('click', () => {
            const v = $('#emp-lote-din', lote).value;
            if (!v) { C.aviso('Elige primero la dinamizadora.'); return; }
            asignar(cont, elegidos.map((x) => x.cedula), v === 'quitar' ? null : v);
        });
    }
    async function asignar(cont, cedulas, din) {
        try {
            const r = await C.llamar('asignar', { cedulas, dinamizadora: din || null }, true);
            C.aviso(r.dinamizadora ? `Listo: ${r.asignados} emprendimiento${r.asignados > 1 ? 's' : ''} asignado${r.asignados > 1 ? 's' : ''} a ${r.dinamizadora}.` : 'Listo: se quitó la asignación.');
            H.datos = await C.llamar('emprendimientos', {}, true);
            H.sel.clear();
            pintarHoja(cont);
        } catch (e) { C.aviso(e.message); pintarFilas(cont); }
    }
    // Descarga lo que se ve (con los filtros) en un archivo que abre Excel (CSV separado por punto y coma)
    function descargarExcel() {
        const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const cab = ['Emprendimiento', 'Cédula', 'Negocio', 'Municipio', 'Satélite', 'Dinamizadora', 'Semana actual', ...COLUMNAS.map(([r, n]) => (r === 'hacer' ? `HACER semana ${n}` : `SER taller ${n}`)), 'Aprobadas', 'Cuestionarios respondidos', 'Cuestionarios habilitados'];
        const filasCsv = filtrados().map((x) => [x.nombre, x.cedula, x.negocio, x.municipio, nombreSat(x.satelite), x.dinamizadora_nombre, x.semana_actual || 1,
            ...COLUMNAS.map(([r, n]) => ESTADO_CELDA[estadoCelda(x.celdas[`${r}_${n}`])][2]), x.avance.aprobadas || 0, x.aprendizaje.respondidas.length, x.aprendizaje.habilitadas.length]);
        const csv = '﻿' + [cab, ...filasCsv].map((f) => f.map(celda).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `CIC_seguimiento_${new Date().toLocaleDateString('en-CA')}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }

    // ================================================================ Seguimiento de un emprendimiento
    async function abrirSeguimiento(cont, cedula, volver, foco) {
        cont.onclick = null; cont.onchange = null;
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando el seguimiento…</p>';
        let s;
        try { s = await C.llamar('seguimiento', { cedula }, true); } catch (e) { C.aviso(e.message); volver(); return; }
        pintarSeguimiento(cont, s, volver);
        // Si se tocó una casilla de la tabla, se va directo a esa actividad
        const destino = foco && cont.querySelector(`[data-act="${foco}"]`);
        (destino || cont).scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (destino) { destino.classList.add('resaltada'); setTimeout(() => destino.classList.remove('resaltada'), 2500); }
    }
    // Cuestionario de aprendizaje semanal: la Secretaría o la dinamizadora habilitan cada semana y ven las respuestas
    function bloqueAprendizaje(s) {
        const preguntas = s.preguntas_aprendizaje || [];
        const semanas = s.aprendizaje || [];
        return `<section class="emp-grupo" id="aprendizaje"><h4>Cuestionario de aprendizaje semanal</h4>
            <p class="texto-suave">Al terminar cada semana, habilítale el cuestionario a la emprendedora: lo verá en «Mi semana» y sus respuestas aparecen aquí.</p>
            <ul class="lista-limpia aprendizaje-semanas">${semanas.map((w) => `<li class="aprendizaje-semana" data-semana="${w.semana}">
                <b>Semana ${w.semana}</b>
                ${w.respondida_en ? `<span class="chip emp-ok">✓ Respondido · ${esc(fechaCorta(w.respondida_en))}</span>`
                    : w.habilitada ? `<span><span class="chip emp-pend">Habilitado · esperando respuesta</span> <button type="button" class="boton-texto" data-apr="quitar">Deshabilitar</button></span>`
                    : '<button type="button" class="btn btn-borde btn-pequeno" data-apr="habilitar">Habilitar cuestionario</button>'}
                ${w.respuestas ? `<dl class="aprendizaje-respuestas">${preguntas.map((q) => `<dt>${esc(q.texto)}</dt><dd>${w.respuestas[q.id] == null || w.respuestas[q.id] === '' ? '—' : q.tipo === 'escala' ? `${esc(w.respuestas[q.id])} de 5` : esc(w.respuestas[q.id])}</dd>`).join('')}</dl>` : ''}
            </li>`).join('')}</ul></section>`;
    }
    function estadoChip(a) {
        if (a.ejecutada === true) { const completos = a.requeridos.every((d) => a.documentos[d.tipo]); return completos ? '<span class="chip emp-ok">Ejecutada · documentos completos</span>' : '<span class="chip emp-pend">Ejecutada · faltan documentos</span>'; }
        if (a.ejecutada === false) return '<span class="chip emp-no">No se ejecutó</span>';
        return '<span class="chip">Pendiente</span>';
    }
    // Tarjeta de cada sesión. Dinamizadora: marca si se hizo, sube acta y herramienta y la envía a la Secretaría.
    // Secretaría: ve lo mismo y responde «¿Se aprueban los documentos?» con Sí o No, con sus comentarios.
    let fichaActual = null;
    function tarjetaActividad(a) {
        const clave = `${a.ruta}-${a.n}`;
        const rev = a.revision ? a.revision.estado : null;
        const esDin = C.perfil.rol === 'dinamizadora';
        const esSec = C.perfil.rol === 'secretaria';
        // La Secretaría solo registra la sesión cuando el emprendimiento no tiene dinamizadora asignada
        const registra = esDin || (esSec && !(fichaActual && fichaActual.dinamizadora));
        const fija = !registra || (esDin && (rev === 'enviada' || rev === 'aprobada'));
        const completa = a.ejecutada === true ? a.requeridos.every((d) => a.documentos[d.tipo]) : a.ejecutada === false && !!a.motivo;
        const comentarios = a.comentarios || [];
        const devolucion = rev === 'devuelta' ? [...comentarios].reverse().find((c) => c.estado === 'devuelta') : null;
        return `<li class="emp-act ${a.ejecutada === true ? 'es-si' : a.ejecutada === false ? 'es-no' : ''} ${rev ? 'rev-' + rev : ''}" data-act="${clave}">
            <div class="emp-act-cabeza">
                <div class="emp-act-titulo"><span class="emp-act-num">${esc(a.ruta === 'hacer' ? `Semana ${a.n}` : `Taller ${a.n}`)}</span><h5>${esc(a.titulo || a.nombre)}</h5></div>
                <div class="emp-act-chips">${rev ? `<span class="chip ${REVISION[rev][1]}">${esc(REVISION[rev][0])}</span>` : estadoChip(a)}</div>
            </div>
            ${esSec && rev === 'enviada' ? bloqueAprobar(a, clave) : ''}
            ${devolucion && esDin ? `<div class="emp-devuelta" role="note"><b>La Secretaría pidió corregir:</b><p>${esc(devolucion.texto)}</p><small>${esc(devolucion.autor)} · ${esc(fechaCorta(devolucion.en))}</small></div>` : ''}
            ${registra && !fija ? `<p class="emp-pregunta">¿Se hizo la sesión?</p>
            <div class="emp-sino" role="group" aria-label="¿Se hizo la sesión ${esc(a.titulo || a.nombre)}?">
                <button type="button" class="emp-si" data-marcar="si" aria-pressed="${a.ejecutada === true}">✓ Sí</button>
                <button type="button" class="emp-no-btn" data-marcar="no" aria-pressed="${a.ejecutada === false}">✕ No</button>
            </div>` : a.ejecutada === null ? '<p class="texto-suave emp-espera">La dinamizadora todavía no ha registrado esta sesión.</p>'
                : `<p class="emp-resumen-sesion">${a.ejecutada ? '✓ La sesión se hizo' : '✕ La sesión no se hizo'}</p>`}
            ${a.ejecutada === true ? `
                <label class="etiqueta" for="fecha-${clave}">Fecha de la sesión</label>
                <input type="date" id="fecha-${clave}" class="campo campo-mini" data-fecha value="${esc(a.fecha || '')}" ${fija ? 'disabled' : ''}>
                <p class="emp-pregunta">${fija ? 'Documentos' : 'Documentos que debes subir'}</p>
                <ul class="emp-docs lista-limpia">${a.requeridos.map((d) => {
                    const m = a.documentos[d.tipo];
                    return `<li class="emp-doc ${m ? 'subido' : ''}">
                        <span class="emp-doc-icono" aria-hidden="true">${m ? '✓' : d.tipo === 'acta' ? '📝' : '🧰'}</span>
                        <div class="emp-doc-texto"><b>${esc(d.nombre)}</b><small>${m ? `${esc(m.nombre)} · ${kb(m.bytes)}` : fija ? 'No se subió' : esc(d.detalle)}</small>${m && m.drive_url && esSec ? `<a class="emp-drive" href="${esc(m.drive_url)}" target="_blank" rel="noopener">Abrir en Google Drive</a>` : m && m.drive_url ? '<small class="emp-drive-ok">✓ Copia guardada en Google Drive</small>' : m && m.drive_pendiente ? '<small class="emp-drive-pend">Copia en Google Drive pendiente</small>' : ''}</div>
                        <div class="emp-doc-acciones">
                            ${m ? `<button type="button" class="btn btn-borde btn-pequeno" data-ver-doc="${d.tipo}">Ver</button>` : ''}
                            ${fija ? '' : `<label class="btn ${m ? 'btn-borde' : 'btn-primario'} btn-pequeno emp-subir">${m ? 'Reemplazar' : 'Subir foto o PDF'}<input type="file" accept="image/*,application/pdf" data-subir="${d.tipo}" hidden></label>
                            ${m ? `<button type="button" class="boton-texto emp-quitar" data-quitar-doc="${d.tipo}">Quitar</button>` : ''}`}
                        </div>
                    </li>`;
                }).join('')}</ul>` : ''}
            ${a.ejecutada === false ? `
                <label class="etiqueta" for="motivo-${clave}">¿Por qué no se hizo?</label>
                <textarea id="motivo-${clave}" class="campo" rows="2" maxlength="300" data-motivo placeholder="Por ejemplo: la emprendedora no estaba disponible" ${fija ? 'disabled' : ''}>${esc(a.motivo || '')}</textarea>
                ${fija ? '' : '<button type="button" class="btn btn-borde btn-pequeno" data-guardar-motivo>Guardar motivo</button>'}` : ''}
            ${bloqueRevision(a, rev, esDin, completa)}
            ${esSec && rev === 'enviada' ? `<div class="emp-comentario-sec">
                <label class="etiqueta" for="rev-${clave}">Comentarios de la Secretaría <small>(obligatorio si respondes No)</small></label>
                <textarea id="rev-${clave}" class="campo" rows="3" maxlength="1000" data-comentario-revision placeholder="Escribe aquí qué está bien o qué debe corregir la dinamizadora"></textarea>
            </div>` : ''}
            <details class="emp-comentarios">
                <summary>Historial de comentarios${comentarios.length ? ` (${comentarios.length})` : ''}</summary>
                ${comentarios.length ? `<ol class="lista-limpia emp-com-lista">${comentarios.map((c) => `<li class="${c.estado ? 'com-' + c.estado : ''}"><p class="emp-com-meta"><b>${esc(c.autor)}</b> · ${esc(c.rol)} · ${esc(fechaCorta(c.en))}${c.estado ? ` · <span class="chip ${(REVISION[c.estado] || ['', ''])[1]}">${c.estado === 'enviada' ? 'Envió a revisión' : c.estado === 'aprobada' ? 'Aprobó' : 'Pidió corregir'}</span>` : ''}</p><p>${esc(c.texto)}</p></li>`).join('')}</ol>` : '<p class="texto-suave">Todavía no hay comentarios.</p>'}
                <label class="etiqueta" for="com-${clave}">${esSec ? 'Escribe una nota a la dinamizadora' : 'Escribe a la Secretaría Técnica'}</label>
                <textarea id="com-${clave}" class="campo" rows="2" maxlength="1000" data-comentario></textarea>
                <button type="button" class="btn btn-borde btn-pequeno" data-comentar>Guardar nota</button>
            </details>
        </li>`;
    }
    // Secretaría: la pregunta va arriba de la tarjeta, como en la hoja de la sesión
    const bloqueAprobar = (a, clave) => `<div class="emp-aprobar">
        <p class="emp-pregunta">¿Se aprueban los documentos?</p>
        <p class="texto-suave">La dinamizadora los envió (${esc(fechaCorta(a.revision.enviada_en))}). Revísalos abajo antes de responder.</p>
        <div class="emp-sino" role="group" aria-label="¿Se aprueban los documentos de ${esc(a.titulo || a.nombre)}?">
            <button type="button" class="emp-si" data-revisar-act="aprobada">✓ Sí</button>
            <button type="button" class="emp-no-btn" data-revisar-act="devuelta">✕ No</button>
        </div>
    </div>`;
    // Envío a la Secretaría Técnica (dinamizadora) y estado de la revisión
    function bloqueRevision(a, rev, esDin, completa) {
        if (a.ejecutada === null) return '';
        if (esDin) {
            if (rev === 'enviada') return `<p class="emp-revision emp-estado-envio">📨 Enviada a la Secretaría Técnica (${esc(fechaCorta(a.revision.enviada_en))}). Le llegó un correo y te avisaremos aquí cuando la revise.</p>`;
            if (rev === 'aprobada') return `<p class="emp-revision paso-ok">✓ Aprobada${a.revision.revisada_por_nombre ? ` por ${esc(a.revision.revisada_por_nombre)}` : ''} el ${esc(fechaCorta(a.revision.revisada_en))}</p>`;
            return `<div class="emp-revision">
                ${completa ? '' : `<p class="ayuda-campo">${a.ejecutada ? 'Sube el acta y la herramienta para poder enviarla.' : 'Escribe y guarda el motivo para poder enviarla.'}</p>`}
                <button type="button" class="btn btn-primario emp-enviar" data-enviar-act ${completa ? '' : 'disabled'}>${rev === 'devuelta' ? 'Volver a enviar a la Secretaría Técnica' : 'Enviar a la Secretaría Técnica'}</button>
            </div>`;
        }
        if (C.perfil.rol !== 'secretaria' || rev === 'enviada') return '';
        return `<p class="emp-revision texto-suave">${rev === 'aprobada' ? `✓ Aprobaste estos documentos el ${esc(fechaCorta(a.revision.revisada_en))}.` : rev === 'devuelta' ? 'Le pediste correcciones a la dinamizadora: cuando las haga, te llegará un correo.' : 'La dinamizadora todavía no la ha enviado para aprobación.'}</p>`;
    }
    function pintarSeguimiento(cont, s, volver) {
        const e = s.emprendimiento;
        fichaActual = e;
        const wa = whatsapp(e.celular);
        const grupo = (ruta, titulo) => `<section class="emp-grupo"><h4>${titulo}</h4><ol class="emp-actividades lista-limpia">${s.actividades.filter((a) => a.ruta === ruta).map(tarjetaActividad).join('')}</ol></section>`;
        cont.innerHTML = `
            <button type="button" class="boton-texto emp-volver" data-volver>← Volver a la tabla</button>
            <div class="emp-ficha">
                <div><h3>${esc(e.nombre)}</h3><p class="texto-suave">${esc(e.negocio || 'Sin nombre de negocio')} · ${esc(e.municipio || '')} · ${esc(nombreSat(e.satelite))}${e.dinamizadora_nombre ? ` · Dinamizadora: ${esc(e.dinamizadora_nombre)}` : ''}</p></div>
                <div class="emp-ficha-lado">${barraAvance(s.avance)}${wa ? `<a class="enlace" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}</div>
            </div>
            ${grupo('hacer', 'Ruta HACER · sesiones semanales en el negocio')}
            ${grupo('ser', 'Ruta SER · talleres en grupo')}
            ${bloqueAprendizaje(s)}`;
        const actividad = (el) => { const [ruta, n] = el.closest('[data-act]').dataset.act.split('-'); return { cedula: e.cedula, ruta, n: Number(n) }; };
        const actualizar = (nuevo) => { const y = scrollY; pintarSeguimiento(cont, nuevo, volver); scrollTo(0, y); };
        cont.onclick = async (ev) => {
            const t = ev.target;
            if (t.closest('[data-volver]')) { volver(); return; }
            const ap = t.closest('[data-apr]');
            if (ap) {
                const semana = Number(ap.closest('[data-semana]').dataset.semana);
                ap.disabled = true;
                try { actualizar(await C.llamar('habilitar-aprendizaje', { cedula: e.cedula, semana, habilitada: ap.dataset.apr === 'habilitar' }, true)); C.aviso(ap.dataset.apr === 'habilitar' ? `Cuestionario de la semana ${semana} habilitado: ya lo ve en «Mi semana».` : 'Cuestionario deshabilitado.'); }
                catch (err) { C.aviso(err.message); ap.disabled = false; }
                return;
            }
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
            const env = t.closest('[data-enviar-act]');
            if (env) {
                env.disabled = true;
                try { actualizar(await C.llamar('enviar-actividad', actividad(env), true)); C.aviso('Listo: se envió a la Secretaría Técnica y le llegó un correo para que la revise.'); } catch (err) { C.aviso(err.message); env.disabled = false; }
                return;
            }
            const rv = t.closest('[data-revisar-act]');
            if (rv) {
                const li = rv.closest('[data-act]');
                const comentario = $('[data-comentario-revision]', li).value.trim();
                if (rv.dataset.revisarAct === 'devuelta' && comentario.length < 5) { C.aviso('Escribe en «Comentarios de la Secretaría» qué debe corregir la dinamizadora y vuelve a tocar «No».'); $('[data-comentario-revision]', li).focus(); return; }
                rv.disabled = true;
                try { actualizar(await C.llamar('revisar-actividad', { ...actividad(rv), estado: rv.dataset.revisarAct, comentario }, true)); C.aviso(rv.dataset.revisarAct === 'aprobada' ? 'Documentos aprobados.' : 'Se le devolvió a la dinamizadora con tus comentarios.'); } catch (err) { C.aviso(err.message); rv.disabled = false; }
                return;
            }
            const cm = t.closest('[data-comentar]');
            if (cm) {
                const li = cm.closest('[data-act]');
                const txt = $('[data-comentario]', li).value.trim();
                if (txt.length < 2) { C.aviso('Escribe el comentario.'); return; }
                cm.disabled = true;
                try { actualizar(await C.llamar('comentar-actividad', { ...actividad(cm), texto: txt }, true)); C.aviso('Comentario guardado.'); } catch (err) { C.aviso(err.message); cm.disabled = false; }
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
