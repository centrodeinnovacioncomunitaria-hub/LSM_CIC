// Emprendimientos: la Secretaría Técnica asigna cada emprendimiento a una dinamizadora de su satélite y la
// dinamizadora chulea si cada actividad (6 semanas HACER y 4 talleres SER) se ejecutó; si se ejecutó, sube el
// los documentos de la sesión (acta, informe, fotos, asistencia…) y la herramienta diligenciada, uno por uno. Lo usa la vista «Seguimiento» de index.html.
(() => {
    'use strict';
    let C = null; // contexto de la página: perfil, llamar, aviso, esc, satelite, SATELITES, DEMO
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (v) => C.esc(v);
    const MAX_BYTES = 5 * 1024 * 1024;
    const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const nombreSat = (id) => { const s = C.satelite(id); return s ? s.nombre : ''; };
    const whatsapp = (cel) => { const d = String(cel || '').replace(/\D/g, ''); return d.length >= 10 ? `https://wa.me/57${d.slice(-10)}` : null; };

    const REVISION = {
        enviada: ['En revisión de la Secretaría Técnica', 'emp-pend'],
        aprobada: ['✓ Aprobada por la Secretaría Técnica', 'emp-ok'],
        devuelta: ['Devuelta: corrige y vuelve a enviar', 'emp-no'],
    };
    const fechaCorta = (f) => new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const enDemo = (cont) => { cont.innerHTML = '<p class="tarjeta vacio">En la demostración no hay emprendimientos reales: en la plataforma aquí se asignan y se les hace seguimiento.</p>'; };

    // ================================================================ Seguimiento por tareas
    // Pensado para personas a las que no se les da bien la tecnología: una tarea por pantalla, palabras sencillas
    // y siempre un botón claro con el siguiente paso. Las partes (revisar, asignar, tabla, mis emprendedoras) se
    // montan en sus propios recuadros y comparten los mismos datos.
    const COLUMNAS = [...[1, 2, 3, 4, 5, 6].map((n) => ['hacer', n, `S${n}`]), ...[1, 2, 3, 4].map((n) => ['ser', n, `T${n}`])];
    const nombreAct = (r, n) => (r === 'hacer' ? `Semana ${n}` : `Taller ${n}`);
    const ESTADO_CELDA = {
        pendiente: ['·', 'c-pendiente', 'Falta registrar'],
        sin_docs: ['◐', 'c-sin-docs', 'Faltan documentos'],
        lista: ['↑', 'c-lista', 'Lista para enviar'],
        revision: ['…', 'c-revision', 'En revisión de la Secretaría'],
        aprobada: ['✓', 'c-aprobada', 'Aprobada'],
        devuelta: ['!', 'c-devuelta', 'Devuelta para corregir'],
        no: ['✕', 'c-no', 'No se hizo'],
    };
    function estadoCelda(c) {
        if (!c || c.e === null || c.e === undefined) return 'pendiente';
        if (c.r === 'aprobada') return 'aprobada';
        if (c.r === 'devuelta') return 'devuelta';
        if (c.r === 'enviada') return 'revision';
        if (c.e === false) return 'no';
        return c.d ? 'lista' : 'sin_docs';
    }
    const FILTROS = {
        '': 'Todas',
        revisar: 'Con sesiones por revisar',
        devueltas: 'Con sesiones devueltas',
        pendientes_envio: 'Con sesiones sin enviar',
        sin_avance: 'Sin ninguna sesión registrada',
        sin: 'Sin dinamizadora',
        cuestionario: 'Con cuestionario sin responder',
    };
    let H = { datos: null, rol: '', sat: '', din: '', filtro: '', texto: '', verAsignadas: false, buscarDin: '' };
    let promesa = null;
    const montajes = {}; // modo → recuadro donde está pintado
    const filas = () => H.datos.emprendimientos;
    const celdasDe = (x) => COLUMNAS.map(([r, n]) => ({ r, n, estado: estadoCelda(x.celdas[`${r}_${n}`]) }));
    function cumpleFiltro(x, filtro = H.filtro) {
        const estados = celdasDe(x).map((c) => c.estado);
        switch (filtro) {
            case 'sin': return !x.dinamizadora;
            case 'revisar': return estados.includes('revision');
            case 'devueltas': return estados.includes('devuelta');
            case 'pendientes_envio': return estados.includes('lista') || estados.includes('sin_docs');
            case 'sin_avance': return estados.every((e) => e === 'pendiente');
            case 'cuestionario': return x.aprendizaje.habilitadas.some((s) => !x.aprendizaje.respondidas.includes(s));
            default: return true;
        }
    }
    const dinDe = (sat) => (H.datos.dinamizadoras || []).filter((d) => d.satelite === sat);
    function opcionesDin(sat, actual, vacio = 'Elige la dinamizadora…') {
        return `<option value="">${esc(vacio)}</option>${dinDe(sat).map((d) => `<option value="${esc(d.cedula)}" ${d.cedula === actual ? 'selected' : ''}>${esc(d.nombre)} · CC ${esc(d.cedula)}</option>`).join('')}`;
    }
    // El número de pendientes de cada parte se muestra en el submenú y en los botones de inicio
    const cuentaSeccion = (cont, n) => { const s = cont.closest('[data-seccion]'); if (s) s.dataset.seccionCuenta = n; };

    function traer(rol, forzar) {
        if (forzar || !promesa || H.rol !== rol) {
            if (H.rol !== rol) H = { datos: null, rol, sat: '', din: '', filtro: '', texto: '', verAsignadas: false, buscarDin: '' };
            promesa = C.llamar(rol === 'secretaria' ? 'emprendimientos' : 'mis-emprendimientos', {}, true).then((d) => (H.datos = d));
            promesa.catch(() => { promesa = null; });
        }
        return promesa;
    }
    const PINTAR = { revisar: pintarRevisar, asignar: pintarAsignar, tabla: pintarHoja, mias: pintarMias };
    async function montar(cont, ctx, rol, modo) {
        C = ctx;
        montajes[modo] = cont;
        cont.onclick = null; cont.onchange = null; cont.oninput = null;
        delete cont.dataset.ficha;
        if (C.DEMO) return enDemo(cont);
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando…</p>';
        try { await traer(rol); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        PINTAR[modo](cont);
    }
    // Después de un cambio (asignar, revisar, enviar) se vuelven a pintar todas las partes con datos frescos
    async function refrescarTodo() {
        try { await traer(H.rol, true); } catch (e) { C.aviso(e.message); return; }
        for (const [modo, cont] of Object.entries(montajes)) if (cont.isConnected && !cont.dataset.ficha) PINTAR[modo](cont);
    }
    const volverA = (cont) => () => { delete cont.dataset.ficha; refrescarTodo(); };
    const irA = (cont) => { const s = cont.closest('[data-seccion]') || cont; const y = s.getBoundingClientRect().top + window.scrollY - 150; if (s.getBoundingClientRect().top < 120) window.scrollTo({ top: Math.max(0, y) }); };

    // Secretaría: modo 'revisar' (sesiones enviadas), 'asignar' o 'tabla'. Dinamizadora: sus emprendedoras.
    async function secretaria(cont, ctx, modo = 'tabla') { await montar(cont, ctx, 'secretaria', modo); }
    async function dinamizadora(cont, ctx) { await montar(cont, ctx, 'dinamizadora', 'mias'); }

    // ---------- Secretaría · Revisar sesiones enviadas ----------
    function pintarRevisar(cont) {
        const items = [];
        let devueltas = 0;
        for (const x of filas()) for (const c of celdasDe(x)) {
            if (c.estado === 'revision') items.push({ x, ...c, f: x.celdas[`${c.r}_${c.n}`].f });
            if (c.estado === 'devuelta') devueltas++;
        }
        cuentaSeccion(cont, items.length);
        cont.innerHTML = `
            <h2>Revisar sesiones enviadas</h2>
            <p class="vista-intro">Las dinamizadoras enviaron estas sesiones con los documentos de la sesión y la herramienta. Toca <b>Revisar</b>, mira los documentos y responde si se aprueban.</p>
            ${items.length ? `<ul class="lista-limpia tarea-lista">${items.map(({ x, r, n, f }) => `<li class="tarea-fila">
                <span class="tarea-fila-icono c-revision" aria-hidden="true">📄</span>
                <div class="tarea-fila-texto"><b>${esc(nombreAct(r, n))} de ${esc(x.nombre)}</b><small>${esc(x.negocio || 'Sin nombre de negocio')} · enviada por ${esc(x.dinamizadora_nombre || 'la dinamizadora')}${f ? ` · sesión del ${esc(f)}` : ''}</small></div>
                <button type="button" class="btn btn-primario" data-ver="${esc(x.cedula)}" data-foco="${r}-${n}">Revisar ›</button>
            </li>`).join('')}</ul>`
            : '<div class="tarjeta vacio vacio-feliz"><p class="vacio-icono" aria-hidden="true">✓</p><p><b>¡Todo al día!</b></p><p class="texto-suave">No hay sesiones esperando tu revisión. Cuando una dinamizadora envíe una, aparecerá aquí y te llegará un correo.</p></div>'}
            ${devueltas ? `<p class="texto-suave" style="margin-top:1rem">${devueltas === 1 ? 'Una sesión está' : `${devueltas} sesiones están`} esperando que la dinamizadora haga las correcciones que pediste.</p>` : ''}`;
        cont.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, volverA(cont), b.dataset.foco, 'Volver a las sesiones por revisar'); };
    }

    // ---------- Secretaría · Asignar emprendedoras a dinamizadoras ----------
    function pintarAsignar(cont) {
        const sin = filas().filter((x) => !x.dinamizadora);
        cuentaSeccion(cont, sin.length);
        const t = H.buscarDin.toLowerCase();
        const lista = filas().filter((x) => (H.verAsignadas || !x.dinamizadora) && (!t || [x.nombre, x.cedula, x.negocio, x.municipio].join(' ').toLowerCase().includes(t)));
        const grupos = C.SATELITES.map((s) => [s.id, lista.filter((x) => x.satelite === s.id)]).filter(([, xs]) => xs.length);
        cont.innerHTML = `
            <h2>Asignar emprendedoras a dinamizadoras</h2>
            <p class="vista-intro">Cada emprendedora necesita una dinamizadora de su mismo satélite. Elige el nombre en la lista: <b>se guarda solo</b>.</p>
            <div class="asignar-controles">
                <p class="asignar-resumen"><b>${sin.length}</b> ${sin.length === 1 ? 'emprendedora sin dinamizadora' : 'emprendedoras sin dinamizadora'}</p>
                <label class="casilla"><input type="checkbox" data-ver-asignadas ${H.verAsignadas ? 'checked' : ''}><span>Mostrar también las que ya tienen dinamizadora (para cambiarla)</span></label>
                ${filas().length > 8 ? `<div><label class="etiqueta" for="asig-buscar">Buscar</label><input id="asig-buscar" class="campo" type="search" placeholder="Nombre, cédula o municipio" value="${esc(H.buscarDin)}"></div>` : ''}
            </div>
            ${grupos.length ? grupos.map(([sat, xs]) => {
                const pendientes = xs.filter((x) => !x.dinamizadora);
                return `<section class="tarjeta asignar-grupo">
                <h3>Satélite ${esc(nombreSat(sat))} <small>${xs.length} ${xs.length === 1 ? 'emprendedora' : 'emprendedoras'}</small></h3>
                ${!dinDe(sat).length ? '<p class="emp-alerta">Este satélite todavía no tiene dinamizadoras registradas. Pídele a la administración que las registre.</p>'
                    : pendientes.length > 1 ? `<div class="asignar-todas"><label for="lote-${esc(sat)}">Asignar las ${pendientes.length} sin dinamizadora a:</label>
                        <select id="lote-${esc(sat)}" class="campo" data-lote-sat="${esc(sat)}">${opcionesDin(sat, null)}</select>
                        <button type="button" class="btn btn-borde" data-lote-btn="${esc(sat)}">Asignar a todas</button></div>` : ''}
                <ul class="lista-limpia asignar-lista">${xs.map((x) => `<li class="asignar-fila ${x.dinamizadora ? 'ya-asignada' : ''}">
                    <div><b>${esc(x.nombre)}</b><small>${esc(x.negocio || 'Sin nombre de negocio')} · ${esc(x.municipio || '')} · CC ${esc(x.cedula)}</small></div>
                    <div><label class="sr-only" for="asig-${esc(x.cedula)}">Dinamizadora de ${esc(x.nombre)}</label>
                    <select id="asig-${esc(x.cedula)}" class="campo" data-asignar="${esc(x.cedula)}" ${dinDe(sat).length ? '' : 'disabled'}>${opcionesDin(sat, x.dinamizadora, x.dinamizadora ? 'Quitar la dinamizadora' : 'Elige la dinamizadora…')}</select>
                    ${x.dinamizadora ? '<small class="asignar-ok">✓ Asignada</small>' : ''}</div>
                </li>`).join('')}</ul></section>`;
            }).join('')
            : `<div class="tarjeta vacio vacio-feliz"><p class="vacio-icono" aria-hidden="true">✓</p><p><b>${filas().length ? '¡Listo! Todas las emprendedoras tienen dinamizadora.' : 'Todavía no hay emprendedoras inscritas.'}</b></p>${filas().length ? '<p class="texto-suave">Marca «Mostrar también las que ya tienen dinamizadora» si necesitas cambiar alguna.</p>' : ''}</div>`}`;
        cont.onchange = async (e) => {
            if (e.target.matches('[data-ver-asignadas]')) { H.verAsignadas = e.target.checked; pintarAsignar(cont); return; }
            const a = e.target.closest('[data-asignar]');
            if (a) { a.disabled = true; await asignar([a.dataset.asignar], a.value); }
        };
        cont.oninput = (e) => { if (e.target.id === 'asig-buscar') { H.buscarDin = e.target.value; pintarAsignar(cont); const b = $('#asig-buscar', cont); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
        cont.onclick = async (e) => {
            const b = e.target.closest('[data-lote-btn]');
            if (!b) return;
            const sat = b.dataset.loteBtn;
            const din = $(`[data-lote-sat="${sat}"]`, cont).value;
            if (!din) { C.aviso('Primero elige la dinamizadora en la lista.'); return; }
            b.disabled = true;
            await asignar(filas().filter((x) => x.satelite === sat && !x.dinamizadora).map((x) => x.cedula), din);
        };
    }
    async function asignar(cedulas, din) {
        try {
            const r = await C.llamar('asignar', { cedulas, dinamizadora: din || null }, true);
            C.aviso(r.dinamizadora ? `Listo: ${r.asignados === 1 ? 'quedó asignada' : `${r.asignados} quedaron asignadas`} a ${r.dinamizadora}.` : 'Listo: se quitó la dinamizadora.');
        } catch (e) { C.aviso(e.message); }
        await refrescarTodo();
    }

    // ---------- Secretaría · Ver el avance de todas (tabla con filtros, descargable) ----------
    function pintarHoja(cont) {
        const emp = filas();
        const sats = C.SATELITES.filter((s) => emp.some((x) => x.satelite === s.id));
        const dins = (H.datos.dinamizadoras || []).filter((d) => (!H.sat || d.satelite === H.sat) && emp.some((x) => x.dinamizadora === d.cedula));
        cont.innerHTML = `
            <h2>Avance de todas las emprendedoras</h2>
            <p class="vista-intro">Una fila por emprendedora y un cuadrito por sesión. Toca un cuadrito para abrir esa sesión. Puedes descargar la tabla para Excel.</p>
            ${H.datos.drive && H.datos.drive.activo && H.datos.drive.pendientes ? `<p class="emp-drive-barra">📁 Hay ${H.datos.drive.pendientes} documento${H.datos.drive.pendientes > 1 ? 's' : ''} sin copia en Google Drive. <button type="button" class="btn btn-borde btn-pequeno" data-sincronizar>Copiar a Drive</button></p>` : ''}
            <div class="hoja-controles">
                <div><label class="etiqueta" for="h-sat">Satélite</label><select id="h-sat" class="campo"><option value="">Todos</option>${sats.map((s) => `<option value="${esc(s.id)}" ${H.sat === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></div>
                <div><label class="etiqueta" for="h-din">Dinamizadora</label><select id="h-din" class="campo"><option value="">Todas</option>${dins.map((d) => `<option value="${esc(d.cedula)}" ${H.din === d.cedula ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select></div>
                <div><label class="etiqueta" for="h-filtro">Mostrar</label><select id="h-filtro" class="campo">${Object.entries(FILTROS).map(([k, t]) => `<option value="${k}" ${H.filtro === k ? 'selected' : ''}>${esc(t)}${k ? ` (${emp.filter((x) => cumpleFiltro(x, k)).length})` : ''}</option>`).join('')}</select></div>
                <div class="hoja-buscar"><label class="etiqueta" for="h-buscar">Buscar</label><input id="h-buscar" class="campo" type="search" placeholder="Nombre, cédula, negocio…" value="${esc(H.texto)}"></div>
                <div><button type="button" class="btn btn-borde" data-excel>⬇ Descargar para Excel</button></div>
            </div>
            <ul class="lista-limpia hoja-leyenda-lista" aria-label="Qué significa cada color">${Object.values(ESTADO_CELDA).map(([s, c, t]) => `<li><span class="celda celda-muestra ${c}" aria-hidden="true">${s}</span><span>${esc(t)}</span></li>`).join('')}</ul>
            <div id="emp-tabla"></div>`;
        pintarFilas(cont);
        const cambiar = (id, k) => $(id, cont).addEventListener('change', (e) => { H[k] = e.target.value; if (k === 'sat') { H.din = ''; pintarHoja(cont); } else pintarFilas(cont); });
        cambiar('#h-sat', 'sat'); cambiar('#h-din', 'din'); cambiar('#h-filtro', 'filtro');
        $('#h-buscar', cont).addEventListener('input', (e) => { H.texto = e.target.value; pintarFilas(cont); });
        $('[data-excel]', cont).addEventListener('click', descargarExcel);
        const sinc = $('[data-sincronizar]', cont);
        if (sinc) sinc.addEventListener('click', async () => {
            sinc.disabled = true; sinc.textContent = 'Copiando…';
            try {
                const r = await C.llamar('sincronizar-drive', {}, true);
                C.aviso(r.pendientes ? `Se copiaron ${r.enviados}. Quedan ${r.pendientes}: vuelve a tocar el botón.` : `Listo: se copiaron ${r.enviados} documentos a Google Drive.`);
                refrescarTodo();
            } catch (e) { C.aviso(e.message); sinc.disabled = false; sinc.textContent = 'Copiar a Drive'; }
        });
    }
    function filtrados() {
        const t = H.texto.toLowerCase();
        return filas().filter((x) => (!H.sat || x.satelite === H.sat) && (!H.din || x.dinamizadora === H.din) && cumpleFiltro(x)
            && [x.nombre, x.cedula, x.negocio, x.municipio, x.dinamizadora_nombre].join(' ').toLowerCase().includes(t));
    }
    function pintarFilas(cont) {
        const lista = filtrados();
        const caja = $('#emp-tabla', cont);
        if (!lista.length) { caja.innerHTML = `<p class="tarjeta vacio">${filas().length ? 'Ninguna emprendedora cumple ese filtro.' : 'Todavía no hay emprendedoras inscritas.'}</p>`; return; }
        caja.innerHTML = `<div class="hoja-caja"><table class="hoja-calculo">
            <thead><tr><th class="col-fija" scope="col">Emprendedora</th><th scope="col" class="td-din">Dinamizadora</th>
                ${COLUMNAS.map(([r, n, t]) => `<th scope="col" class="td-act" title="${esc(nombreAct(r, n))}">${esc(nombreAct(r, n).replace('Semana', 'Sem.').replace('Taller', 'Tall.'))}</th>`).join('')}
                <th scope="col" class="td-avance">Aprobadas</th></tr></thead>
            <tbody>${lista.map((x) => `<tr>
                <td class="col-fija"><button type="button" class="boton-texto hoja-nombre" data-ver="${esc(x.cedula)}"><b>${esc(x.nombre)}</b></button>
                    <small>${esc(x.negocio || 'Sin nombre de negocio')} · ${esc(nombreSat(x.satelite))}</small></td>
                <td class="td-din">${x.dinamizadora_nombre ? esc(x.dinamizadora_nombre) : '<span class="emp-alerta">Sin asignar</span>'}</td>
                ${COLUMNAS.map(([r, n]) => { const c = x.celdas[`${r}_${n}`]; const [s, cl, txt] = ESTADO_CELDA[estadoCelda(c)]; return `<td class="td-act"><button type="button" class="celda ${cl}" data-ver="${esc(x.cedula)}" data-foco="${r}-${n}" title="${esc(`${nombreAct(r, n)} · ${txt}`)}" aria-label="${esc(`${x.nombre}, ${nombreAct(r, n)}: ${txt}`)}">${s}</button></td>`; }).join('')}
                <td class="td-avance"><b>${x.avance.aprobadas || 0} de ${x.avance.total}</b></td>
            </tr>`).join('')}</tbody></table></div>
            <p class="hoja-pie">${lista.length} de ${filas().length} emprendedoras · desliza la tabla hacia los lados para ver todas las sesiones.</p>`;
        caja.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, volverA(cont), b.dataset.foco, 'Volver a la tabla'); };
    }
    // Descarga lo que se ve (con los filtros) en un archivo que abre Excel (CSV separado por punto y coma)
    function descargarExcel() {
        const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const cab = ['Emprendedora', 'Cédula', 'Negocio', 'Municipio', 'Satélite', 'Dinamizadora', 'Semana actual', ...COLUMNAS.map(([r, n]) => (r === 'hacer' ? `HACER semana ${n}` : `SER taller ${n}`)), 'Aprobadas', 'Cuestionarios respondidos', 'Cuestionarios habilitados'];
        const filasCsv = filtrados().map((x) => [x.nombre, x.cedula, x.negocio, x.municipio, nombreSat(x.satelite), x.dinamizadora_nombre, x.semana_actual || 1,
            ...COLUMNAS.map(([r, n]) => ESTADO_CELDA[estadoCelda(x.celdas[`${r}_${n}`])][2]), x.avance.aprobadas || 0, x.aprendizaje.respondidas.length, x.aprendizaje.habilitadas.length]);
        const csv = '﻿' + [cab, ...filasCsv].map((f) => f.map(celda).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `CIC_seguimiento_${new Date().toLocaleDateString('en-CA')}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }

    // ---------- Dinamizadora · Mis emprendedoras (una tarjeta por emprendedora con su siguiente paso) ----------
    // 'no' = marcó que no se hizo pero aún no la envía (si ya la envió, el estado es «en revisión» o «aprobada»)
    const PRIORIDAD = ['devuelta', 'lista', 'no', 'sin_docs', 'pendiente'];
    const VERBO = { devuelta: 'Corregir', lista: 'Enviar', sin_docs: 'Subir documentos de', pendiente: 'Registrar', no: 'Enviar' };
    function siguientePaso(x) {
        const cs = celdasDe(x);
        for (const p of PRIORIDAD) { const c = cs.find((y) => y.estado === p); if (c) return c; }
        return null;
    }
    function pintarMias(cont) {
        const lista = filas();
        const devueltas = [];
        for (const x of lista) for (const c of celdasDe(x)) if (c.estado === 'devuelta') devueltas.push({ x, ...c });
        cuentaSeccion(cont, devueltas.length);
        const t = (H.texto || '').toLowerCase();
        const visibles = lista.filter((x) => !t || [x.nombre, x.negocio, x.municipio].join(' ').toLowerCase().includes(t));
        cont.innerHTML = `
            <h2>Mis emprendedoras</h2>
            <p class="vista-intro">Después de cada sesión, toca el botón rojo de la emprendedora y sigue los pasos: <b>¿se hizo?</b> → <b>sube los documentos de la sesión y la herramienta</b> → <b>envía a la Secretaría</b>.</p>
            ${devueltas.length ? `<div class="aviso-correcciones" role="alert"><p><b>⚠ La Secretaría te pidió corregir ${devueltas.length === 1 ? 'una sesión' : `${devueltas.length} sesiones`}</b></p>
                <ul class="lista-limpia">${devueltas.map(({ x, r, n }) => `<li><span>${esc(nombreAct(r, n))} de ${esc(x.nombre)}</span><button type="button" class="btn btn-primario btn-pequeno" data-ver="${esc(x.cedula)}" data-foco="${r}-${n}">Corregir ›</button></li>`).join('')}</ul></div>` : ''}
            ${lista.length > 6 ? `<div class="controles" style="margin-top:0"><div><label class="etiqueta" for="mias-buscar">Buscar emprendedora</label><input id="mias-buscar" class="campo" type="search" value="${esc(H.texto || '')}"></div></div>` : ''}
            ${visibles.length ? `<ul class="lista-limpia emp-tarjetas-mias">${visibles.map((x) => {
                const sig = siguientePaso(x);
                const cs = celdasDe(x);
                const wa = whatsapp(x.celular);
                return `<li class="tarjeta emp-mia">
                    <div class="emp-mia-cab"><h3>${esc(x.nombre)}</h3><p class="texto-suave">${esc(x.negocio || 'Sin nombre de negocio')}${x.municipio ? ` · ${esc(x.municipio)}` : ''}</p></div>
                    <ol class="lista-limpia emp-mia-puntos" aria-label="Sesiones de ${esc(x.nombre)}">${cs.map((c) => `<li class="${ESTADO_CELDA[c.estado][1]}" title="${esc(`${nombreAct(c.r, c.n)}: ${ESTADO_CELDA[c.estado][2]}`)}"><span class="sr-only">${esc(`${nombreAct(c.r, c.n)}: ${ESTADO_CELDA[c.estado][2]}`)}</span></li>`).join('')}</ol>
                    <p class="emp-mia-avance"><b>${x.avance.aprobadas || 0} de ${x.avance.total}</b> sesiones aprobadas</p>
                    <p class="emp-mia-siguiente">${sig ? (sig.estado === 'devuelta' ? `Corrige la <b>${esc(nombreAct(sig.r, sig.n))}</b>: la Secretaría te dejó un comentario.` : sig.estado === 'no' ? `La <b>${esc(nombreAct(sig.r, sig.n))}</b> no se hizo: envíala a la Secretaría con el motivo.` : sig.estado === 'lista' ? `La <b>${esc(nombreAct(sig.r, sig.n))}</b> está lista: solo falta enviarla.` : sig.estado === 'sin_docs' ? `A la <b>${esc(nombreAct(sig.r, sig.n))}</b> le faltan documentos.` : `Siguiente: <b>${esc(nombreAct(sig.r, sig.n))}</b>.`) : '✓ No tiene nada pendiente por ahora.'}</p>
                    <div class="emp-mia-botones">
                        ${sig ? `<button type="button" class="btn btn-primario" data-ver="${esc(x.cedula)}" data-foco="${sig.r}-${sig.n}">${esc(VERBO[sig.estado])} ${esc(nombreAct(sig.r, sig.n))}</button>` : ''}
                        <button type="button" class="btn btn-borde" data-ver="${esc(x.cedula)}">Ver todas sus sesiones</button>
                        ${wa ? `<a class="enlace" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                    </div>
                </li>`;
            }).join('')}</ul>` : `<div class="tarjeta vacio"><p><b>${lista.length ? 'Ninguna emprendedora coincide con la búsqueda.' : 'Todavía no tienes emprendedoras asignadas.'}</b></p>${lista.length ? '' : '<p class="texto-suave">Cuando la Secretaría Técnica te las asigne, aparecerán aquí.</p>'}</div>`}`;
        cont.onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) abrirSeguimiento(cont, b.dataset.ver, volverA(cont), b.dataset.foco, 'Volver a mis emprendedoras'); };
        cont.oninput = (e) => { if (e.target.id === 'mias-buscar') { H.texto = e.target.value; pintarMias(cont); const b = $('#mias-buscar', cont); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
    }

    // ================================================================ Seguimiento de un emprendimiento
    // Página de una emprendedora: sus 10 sesiones como una lista; solo la sesión en la que se trabaja está abierta.
    let abierta = null;      // sesión abierta («hacer-2»)
    let textoVolver = '';    // a dónde lleva el botón «Volver»
    async function abrirSeguimiento(cont, cedula, volver, foco, etiquetaVolver) {
        cont.onclick = null; cont.onchange = null; cont.oninput = null;
        cont.dataset.ficha = '1';
        textoVolver = etiquetaVolver || 'Volver';
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando las sesiones…</p>';
        irA(cont);
        let s;
        try { s = await C.llamar('seguimiento', { cedula }, true); } catch (e) { C.aviso(e.message); volver(); return; }
        abierta = foco || sesionPorDefecto(s);
        pintarSeguimiento(cont, s, volver);
        const destino = abierta && cont.querySelector(`.act-fila[data-fila="${abierta}"]`);
        (destino || cont).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Estado de una sesión en palabras, según quién mira
    function estadoSesion(a) {
        const rev = a.revision ? a.revision.estado : null;
        const docs = a.requeridos.every((d) => (a.documentos[d.tipo] || []).length);
        const din = C.perfil.rol === 'dinamizadora';
        if (rev === 'aprobada') return ['aprobada', 'Aprobada'];
        if (rev === 'enviada') return ['revision', din ? 'Enviada · esperando a la Secretaría' : 'Por revisar'];
        if (rev === 'devuelta') return ['devuelta', din ? 'Hay que corregirla' : 'Devuelta · esperando la corrección'];
        if (a.ejecutada === false) return ['no', a.motivo ? 'No se hizo · falta enviarla' : 'No se hizo · falta el motivo'];
        if (a.ejecutada === true) return docs ? ['lista', 'Lista para enviar'] : ['sin_docs', 'Faltan documentos'];
        return ['pendiente', 'Falta registrar'];
    }
    // La sesión que se abre sola: la Secretaría, la primera por revisar; la dinamizadora, la primera con algo por hacer
    function sesionPorDefecto(s) {
        const clave = (a) => `${a.ruta}-${a.n}`;
        const est = (a) => estadoSesion(a)[0];
        const orden = C.perfil.rol === 'secretaria' ? ['revision'] : ['devuelta', 'lista', 'no', 'sin_docs', 'pendiente'];
        for (const o of orden) { const a = s.actividades.find((x) => est(x) === o); if (a) return clave(a); }
        return null;
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
        if (a.ejecutada === true) { const completos = a.requeridos.every((d) => (a.documentos[d.tipo] || []).length); return completos ? '<span class="chip emp-ok">Ejecutada · documentos completos</span>' : '<span class="chip emp-pend">Ejecutada · faltan documentos</span>'; }
        if (a.ejecutada === false) return '<span class="chip emp-no">No se ejecutó</span>';
        return '<span class="chip">Pendiente</span>';
    }
    // Tarjeta de cada sesión. Dinamizadora: marca si se hizo, sube los documentos y la herramienta y la envía a la Secretaría.
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
        const completa = a.ejecutada === true ? a.requeridos.every((d) => (a.documentos[d.tipo] || []).length) : a.ejecutada === false && !!a.motivo;
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
                    const lista = a.documentos[d.tipo] || [];
                    return `<li class="emp-doc emp-doc-grupo ${lista.length ? 'subido' : ''}">
                        <div class="emp-doc-cabeza">
                            <span class="emp-doc-icono" aria-hidden="true">${lista.length ? '✓' : d.tipo === 'acta' ? '📝' : '🧰'}</span>
                            <div class="emp-doc-texto"><b>${esc(d.nombre)}${lista.length ? ` <span class="emp-doc-cuenta">(${lista.length})</span>` : ''}</b><small>${fija && !lista.length ? 'No se subió' : esc(d.detalle)}</small></div>
                        </div>
                        ${lista.length ? `<ul class="lista-limpia emp-archivos">${lista.map((m) => `<li class="emp-archivo">
                            <span class="emp-archivo-nombre">📄 ${esc(m.nombre)} <small>· ${kb(m.bytes)}</small>${m.drive_url && esSec ? ` <a class="emp-drive" href="${esc(m.drive_url)}" target="_blank" rel="noopener">Abrir en Google Drive</a>` : m.drive_url ? ' <small class="emp-drive-ok">✓ copia en Google Drive</small>' : m.drive_pendiente ? ' <small class="emp-drive-pend">copia en Google Drive pendiente</small>' : ''}</span>
                            <span class="emp-archivo-acciones"><button type="button" class="btn btn-borde btn-pequeno" data-ver-doc="${esc(m.clave)}">Ver</button>${fija ? '' : `<button type="button" class="boton-texto emp-quitar" data-quitar-doc="${esc(m.clave)}">Quitar</button>`}</span>
                        </li>`).join('')}</ul>` : ''}
                        ${fija ? '' : `<label class="btn ${lista.length ? 'btn-borde' : 'btn-primario'} btn-pequeno emp-subir">${lista.length ? '+ Agregar otro documento' : 'Subir foto o PDF'}<input type="file" accept="image/*,application/pdf" data-subir="${d.tipo}" multiple hidden></label>`}
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
            <details class="emp-comentarios" ${comentarios.length ? 'open' : ''}>
                <summary>Historial de comentarios${comentarios.length ? ` (${comentarios.length})` : ''}</summary>
                ${comentarios.length ? `<ol class="lista-limpia emp-com-lista">${comentarios.map((c) => `<li class="${c.estado ? 'com-' + c.estado : ''}"><p class="emp-com-meta"><b>${esc(c.autor)}</b> · ${esc(c.rol)} · ${esc(fechaCorta(c.en))}${c.estado ? ` · <span class="chip ${(REVISION[c.estado] || ['', ''])[1]}">${c.estado === 'enviada' ? 'Envió a revisión' : c.estado === 'aprobada' ? 'Aprobó' : 'Pidió corregir'}</span>` : ''}</p><p>${esc(c.texto)}</p></li>`).join('')}</ol>` : '<p class="texto-suave">Todavía no hay comentarios.</p>'}
                <label class="etiqueta" for="com-${clave}">${esSec ? 'Escribe una nota a la dinamizadora' : 'Escribe a la Secretaría Técnica'}</label>
                <textarea id="com-${clave}" class="campo" rows="2" maxlength="1000" data-comentario></textarea>
                <button type="button" class="btn btn-borde btn-pequeno" data-comentar>Guardar nota</button>
            </details>
        </li>`;
    }
    // Secretaría: la pregunta va arriba de la tarjeta, como en la hoja de la sesión
    const bloqueAprobar = (a, clave) => { const msj = [...(a.comentarios || [])].reverse().find((c) => c.estado === 'enviada'); return `<div class="emp-aprobar">
        ${msj ? `<div class="emp-mensaje-din"><b>Mensaje de ${esc(msj.autor)}:</b><p>${esc(msj.texto)}</p></div>` : ''}
        <p class="emp-pregunta">¿Se aprueban los documentos?</p>
        <p class="texto-suave">La dinamizadora los envió (${esc(fechaCorta(a.revision.enviada_en))}). Revísalos abajo antes de responder.</p>
        <div class="emp-sino" role="group" aria-label="¿Se aprueban los documentos de ${esc(a.titulo || a.nombre)}?">
            <button type="button" class="emp-si" data-revisar-act="aprobada">✓ Sí</button>
            <button type="button" class="emp-no-btn" data-revisar-act="devuelta">✕ No</button>
        </div>
    </div>`; };
    // Envío a la Secretaría Técnica (dinamizadora) y estado de la revisión
    function bloqueRevision(a, rev, esDin, completa) {
        if (a.ejecutada === null) return '';
        if (esDin) {
            if (rev === 'enviada') return `<p class="emp-revision emp-estado-envio">📨 Enviada a la Secretaría Técnica (${esc(fechaCorta(a.revision.enviada_en))}). Le llegó un correo y te avisaremos aquí cuando la revise.</p>`;
            if (rev === 'aprobada') return `<p class="emp-revision paso-ok">✓ Aprobada${a.revision.revisada_por_nombre ? ` por ${esc(a.revision.revisada_por_nombre)}` : ''} el ${esc(fechaCorta(a.revision.revisada_en))}</p>`;
            return `<div class="emp-revision">
                ${completa ? '' : `<p class="ayuda-campo">${a.ejecutada ? 'Sube al menos un documento de la sesión y la herramienta para poder enviarla.' : 'Escribe y guarda el motivo para poder enviarla.'}</p>`}
                <label class="etiqueta" for="nota-${a.ruta}-${a.n}">Mensaje para la Secretaría <small>(opcional)</small></label>
                <textarea id="nota-${a.ruta}-${a.n}" class="campo" rows="2" maxlength="1000" data-nota-envio placeholder="Por ejemplo: la emprendedora firmó el acta al final de la sesión"></textarea>
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
        // Cada sesión es una fila; al tocarla se abre debajo con sus pasos (solo una abierta a la vez)
        const fila = (a) => {
            const clave = `${a.ruta}-${a.n}`;
            const [est, txt] = estadoSesion(a);
            const [simbolo, clase] = ESTADO_CELDA[est];
            const esta = abierta === clave;
            return `<li class="act-fila ${esta ? 'abierta' : ''}" data-fila="${clave}">
                <button type="button" class="act-resumen" data-abrir-act="${clave}" aria-expanded="${esta}">
                    <span class="celda ${clase}" aria-hidden="true">${simbolo}</span>
                    <span class="act-nombre"><b>${esc(nombreAct(a.ruta, a.n))}</b><small>${esc(a.titulo || a.nombre)}</small></span>
                    <span class="act-estado ${clase}">${esc(txt)}</span>
                    <span class="act-flecha" aria-hidden="true">${esta ? '▴' : '▾'}</span>
                </button>
                ${esta ? tarjetaActividad(a).replace(/^\s*<li/, '<div').replace(/<\/li>\s*$/, '</div>') : ''}
            </li>`;
        };
        const grupo = (ruta, titulo) => `<section class="emp-grupo"><h4>${titulo}</h4><ol class="emp-actividades lista-limpia">${s.actividades.filter((a) => a.ruta === ruta).map(fila).join('')}</ol></section>`;
        const aprobadas = s.actividades.filter((a) => a.revision && a.revision.estado === 'aprobada').length;
        cont.innerHTML = `
            <button type="button" class="btn btn-borde emp-volver" data-volver>← ${esc(textoVolver)}</button>
            <div class="emp-ficha">
                <div><h3>${esc(e.nombre)}</h3><p class="texto-suave">${esc(e.negocio || 'Sin nombre de negocio')} · ${esc(e.municipio || '')} · ${esc(nombreSat(e.satelite))}${e.dinamizadora_nombre ? ` · Dinamizadora: ${esc(e.dinamizadora_nombre)}` : ''}</p></div>
                <div class="emp-ficha-lado"><p class="emp-mia-avance"><b>${aprobadas} de ${s.actividades.length}</b> sesiones aprobadas</p>${wa ? `<a class="enlace" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}</div>
            </div>
            <p class="vista-intro">Toca una sesión para abrirla.${C.perfil.rol === 'dinamizadora' ? ' Sigue los pasos en orden: ¿se hizo? → documentos → enviar a la Secretaría.' : ''}</p>
            ${grupo('hacer', 'Ruta HACER · sesiones semanales en el negocio')}
            ${grupo('ser', 'Ruta SER · talleres en grupo')}
            <details class="emp-grupo emp-cuestionario-plegable"><summary>Cuestionario de aprendizaje semanal</summary>${bloqueAprendizaje(s)}</details>`;
        const actividad = (el) => { const [ruta, n] = el.closest('[data-act]').dataset.act.split('-'); return { cedula: e.cedula, ruta, n: Number(n) }; };
        const actualizar = (nuevo) => { const y = scrollY; pintarSeguimiento(cont, nuevo, volver); scrollTo(0, y); };
        cont.onclick = async (ev) => {
            const t = ev.target;
            if (t.closest('[data-volver]')) { volver(); return; }
            const ab = t.closest('[data-abrir-act]');
            if (ab) {
                abierta = abierta === ab.dataset.abrirAct ? null : ab.dataset.abrirAct;
                pintarSeguimiento(cont, s, volver);
                const f2 = abierta && cont.querySelector(`.act-fila[data-fila="${abierta}"]`);
                if (f2 && f2.getBoundingClientRect().top < 120) f2.scrollIntoView({ block: 'start' });
                return;
            }
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
                // El mensaje del cuadro de envío (o lo que haya quedado escrito en las notas) viaja con el envío
                const li = env.closest('[data-act]');
                const nota = [$('[data-nota-envio]', li), $('[data-comentario]', li)].map((x) => (x ? x.value.trim() : '')).filter(Boolean).join('\n');
                try { actualizar(await C.llamar('enviar-actividad', { ...actividad(env), nota }, true)); C.aviso('Listo: se envió a la Secretaría Técnica y le llegó un correo para que la revise.'); } catch (err) { C.aviso(err.message); env.disabled = false; }
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
                try { abrirDocumento(await C.llamar('ver-documento', { ...actividad(v), clave: v.dataset.verDoc }, true), ventana); } catch (err) { if (ventana) ventana.close(); C.aviso(err.message); }
                return;
            }
            const q = t.closest('[data-quitar-doc]');
            if (q) {
                if (!confirm('¿Quitar este documento? Los demás se quedan.')) return;
                try { actualizar(await C.llamar('quitar-documento', { ...actividad(q), clave: q.dataset.quitarDoc }, true)); C.aviso('Documento quitado.'); } catch (err) { C.aviso(err.message); }
            }
        };
        cont.onchange = async (ev) => {
            const t = ev.target;
            if (t.matches('[data-fecha]')) {
                try { actualizar(await C.llamar('marcar-actividad', { ...actividad(t), ejecutada: true, fecha: t.value }, true)); C.aviso('Fecha guardada.'); } catch (err) { C.aviso(err.message); }
                return;
            }
            if (t.matches('[data-subir]') && t.files && t.files.length) {
                const etiqueta = t.closest('.emp-subir');
                const archivos = [...t.files];
                const datosAct = actividad(t), tipo = t.dataset.subir;
                etiqueta.classList.add('cargando');
                let ultimo = null, subidos = 0;
                for (const [i, f] of archivos.entries()) {
                    etiqueta.firstChild.textContent = archivos.length > 1 ? `Subiendo ${i + 1} de ${archivos.length}…` : 'Subiendo…';
                    try { ultimo = await C.llamar('subir-documento', { ...datosAct, tipo, ...(await prepararArchivo(f)) }, true); subidos++; }
                    catch (err) { C.aviso(`«${f.name}»: ${err.message}`); }
                }
                if (ultimo) actualizar(ultimo);
                else { etiqueta.classList.remove('cargando'); etiqueta.firstChild.textContent = 'Subir foto o PDF'; }
                if (subidos) C.aviso(subidos === 1 ? 'Documento subido.' : `Se subieron ${subidos} documentos.`);
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
