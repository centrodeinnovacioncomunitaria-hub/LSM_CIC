// CIC · Cursos del equipo: recorrido, desbloqueo por etapas, cuestionarios, evidencias y panel de la Secretaría.
// Las reglas viven en el servidor (función cic-acceso). En modo demostración, este archivo las imita con datos
// de ejemplo guardados solo en este navegador, sin las preguntas oficiales (que nunca llegan a la página).
(() => {
    'use strict';

    const REGLAS = { preguntas: 10, nota_minima: 7, intentos: 2 }; // banco oficial de octubre 2026: 7 de 10 (70 %)
    const UNIDADES = { gestion: 4, 'formacion-secretaria': 6, 'acompanar-hacer': 6, 'facilitar-ser': 4 };
    const EVIDENCIA = { gestion: 'actividad', 'formacion-secretaria': 'actividad', 'acompanar-hacer': 'verificacion', 'facilitar-ser': 'verificacion' };
    const SIN_CUESTIONARIO = new Set(['formacion-secretaria']);
    const ROLES = { gestion: ['secretaria', 'dinamizadora'], 'formacion-secretaria': ['secretaria'], 'acompanar-hacer': ['secretaria', 'dinamizadora'], 'facilitar-ser': ['secretaria', 'dinamizadora'] };
    const PREFIJO = { gestion: 'GES-M', 'formacion-secretaria': 'STF-U', 'acompanar-hacer': 'HAC-S', 'facilitar-ser': 'SER-T' };
    const ESTADOS = {
        bloqueada: { txt: 'Bloqueado', icono: '🔒', clase: 'est-bloqueada' },
        disponible: { txt: 'Disponible', icono: '○', clase: 'est-disponible' },
        'en-curso': { txt: 'En curso', icono: '◐', clase: 'est-curso' },
        pausada: { txt: 'En pausa', icono: '⏸', clase: 'est-pausada' },
        aprobada: { txt: 'Aprobado', icono: '✓', clase: 'est-aprobada' },
    };
    const EV_TXT = { enviada: 'Enviada · por revisar', aprobada: 'Aprobada', devuelta: 'Devuelta: ajústala y vuelve a enviarla' };

    // ================================================================ Motor de demostración
    // Imita la función del servidor con preguntas de ejemplo. Nada sale de este navegador.
    const Demo = (() => {
        const SEG_DEMO = 15; // en la demostración el «video» dura 15 segundos
        const clave = (p) => `cic-demo-cursos-${p.cedula}`;
        const leer = (p) => { try { return JSON.parse(localStorage.getItem(clave(p))) || null; } catch (e) { return null; } };
        const guardar = (p, d) => { try { localStorage.setItem(clave(p), JSON.stringify(d)); } catch (e) { /* sin almacenamiento */ } };
        const base = () => ({ progreso: {}, evidencias: {}, hitos: [], constancias: [] });
        const k = (c, u) => `${c}:${u}`;
        const ahora = () => new Date().toISOString();

        function requisito(perfil, d, c, u) {
            if (!ROLES[c].includes(perfil.rol)) return 'Este curso es solo para la Secretaría Técnica.';
            if (perfil.debe_cambiar_clave) return 'Primero cambia tu contraseña en «Mi cuenta»: todavía es tu número de cédula.';
            if (u > 1) {
                if (!(d.progreso[k(c, u - 1)] || {}).aprobado_en) return `Se abre cuando apruebes el cuestionario de la unidad ${u - 1}.`;
                if (!d.evidencias[k(c, u - 1)]) return `Se abre cuando envíes la ${EVIDENCIA[c] === 'actividad' ? 'actividad' : 'verificación de la sesión'} de la unidad ${u - 1}.`;
                return null;
            }
            if (c === 'gestion') return d.hitos.includes('compromiso') ? null : 'Se abre cuando confirmes tu compromiso como parte del equipo.';
            if (!d.constancias.some((x) => x.curso === 'gestion')) return 'Se abre cuando apruebes el curso Gestión del CIC.';
            if (c === 'formacion-secretaria') return null;
            if (perfil.rol === 'secretaria') return d.constancias.some((x) => x.curso === 'formacion-secretaria') ? null : 'Se abre cuando termines la Formación de la Secretaría Técnica.';
            return d.hitos.includes(c === 'acompanar-hacer' ? 'transferencia-hacer' : 'transferencia-ser') ? null : 'Se abre cuando la Secretaría Técnica registre tu transferencia de la ruta.';
        }
        function estado(perfil, d, c, u, videos) {
            const f = d.progreso[k(c, u)] || {};
            const ev = d.evidencias[k(c, u)] || null;
            const falta = requisito(perfil, d, c, u);
            const tieneVideo = videos.has(`${PREFIJO[c]}${u}`);
            let e = 'disponible';
            if (falta) e = 'bloqueada'; else if (f.aprobado_en) e = 'aprobada'; else if (f.bloqueado_en) e = 'pausada';
            else if (f.video_en || f.material_en || f.intentos) e = 'en-curso';
            const inicio = f.video_inicio && (!f.bloqueado_en || f.video_inicio > f.bloqueado_en) ? f.video_inicio : null;
            return {
                unidad: u, estado: e, motivo: falta, tiene_video: tieneVideo, sin_cuestionario: SIN_CUESTIONARIO.has(c),
                video_visto: !!f.video_en && (!f.bloqueado_en || f.video_en > f.bloqueado_en), material_visto: !!f.material_en,
                video_iniciado: !!inicio, video_segundos: SEG_DEMO, video_faltan: inicio ? Math.max(0, SEG_DEMO - Math.floor((Date.now() - new Date(inicio)) / 1000)) : SEG_DEMO,
                intentos: f.intentos || 0, intentos_max: REGLAS.intentos, ronda: f.ronda || 1, mejor_nota: f.mejor_nota ?? null, aprobado_en: f.aprobado_en || null,
                puede_cuestionario: !SIN_CUESTIONARIO.has(c) && !falta && !f.aprobado_en && !f.bloqueado_en && (f.intentos || 0) < REGLAS.intentos && !!f.material_en && (!tieneVideo || (!!f.video_en && (!f.bloqueado_en || f.video_en > f.bloqueado_en))),
                evidencia: ev,
            };
        }
        function resumen(perfil, d, videos) {
            const cursos = {};
            Object.keys(UNIDADES).filter((c) => ROLES[c].includes(perfil.rol)).forEach((c) => { cursos[c] = Array.from({ length: UNIDADES[c] }, (_, i) => estado(perfil, d, c, i + 1, videos)); });
            return { cursos, hitos: d.hitos.map((h) => ({ hito: h })), constancias: d.constancias, reglas: REGLAS };
        }
        function emitir(perfil, d, c) {
            if (d.constancias.some((x) => x.curso === c)) return null;
            for (let u = 1; u <= UNIDADES[c]; u++) if (!(d.progreso[k(c, u)] || {}).aprobado_en || !d.evidencias[k(c, u)]) return null;
            const codigo = `CIC-${PREFIJO[c].replace('-', '')}-DEMO${String(Math.floor(Math.random() * 90) + 10)}`;
            const x = { codigo, curso: c, emitida_en: ahora() };
            d.constancias.push(x);
            return x;
        }
        // Preguntas de ejemplo: en la demostración la respuesta correcta es siempre la primera opción.
        const preguntasEjemplo = (c, u) => Array.from({ length: REGLAS.preguntas }, (_, i) => ({
            id: i, enunciado: `Pregunta de ejemplo ${i + 1} de la unidad ${u}. En la plataforma real salen las 10 preguntas oficiales.`,
            opciones: ['Respuesta correcta (en la demostración, siempre la primera)', 'Otra opción', 'Una opción más', 'Una cuarta opción'],
        }));
        let abierto = null;

        async function api(perfil, accion, datos, videos) {
            const d = leer(perfil) || base();
            const c = datos.curso, u = Number(datos.unidad);
            const exigirAbierta = () => { const f = requisito(perfil, d, c, u); if (f) throw Object.assign(new Error(f), { codigo: 'bloqueada' }); };
            const fila = () => (d.progreso[k(c, u)] = d.progreso[k(c, u)] || {});
            let r;
            switch (accion) {
                case 'mi-progreso': r = resumen(perfil, d, videos); break;
                case 'hito': if (!d.hitos.includes(datos.hito)) d.hitos.push(datos.hito); r = resumen(perfil, d, videos); break;
                case 'iniciar-video': {
                    exigirAbierta();
                    const e = estado(perfil, d, c, u, videos);
                    if (!e.video_iniciado) fila().video_inicio = ahora();
                    r = resumen(perfil, d, videos); break;
                }
                case 'marcar': {
                    exigirAbierta();
                    if (datos.que === 'video') {
                        const e = estado(perfil, d, c, u, videos);
                        if (!e.video_iniciado) throw new Error('Primero reproduce el video en la lección.');
                        if (e.video_faltan > 0) throw new Error(`Termina de ver el video: faltan ${e.video_faltan} s.`);
                    }
                    const f = fila(), t = ahora();
                    f[datos.que === 'video' ? 'video_en' : 'material_en'] = t;
                    const conVideo = estado(perfil, d, c, u, videos).tiene_video;
                    if (f.bloqueado_en && f.material_en > f.bloqueado_en && (!conVideo || (f.video_en || '') > f.bloqueado_en)) Object.assign(f, { bloqueado_en: null, intentos: 0, ronda: (f.ronda || 1) + 1 });
                    r = resumen(perfil, d, videos); break;
                }
                case 'material': exigirAbierta(); r = { archivos: [] }; break;
                case 'cuestionario': {
                    exigirAbierta();
                    const e = estado(perfil, d, c, u, videos);
                    if (!e.puede_cuestionario) throw new Error(e.estado === 'pausada' ? 'Perdiste los dos intentos. Repasa el video y el material para volver a intentarlo.' : 'Primero mira el video y repasa el material de estudio.');
                    abierto = { c, u };
                    r = { id: 'demo', intento: e.intentos + 1, de: REGLAS.intentos, nota_minima: REGLAS.nota_minima, preguntas: preguntasEjemplo(c, u) };
                    break;
                }
                case 'responder': {
                    if (!abierto) throw new Error('Vuelve a abrir el cuestionario.');
                    const { c: cc, u: uu } = abierto; abierto = null;
                    const det = datos.respuestas.map((x, i) => ({ id: i, bien: Number(x) === 0, retro: Number(x) === 0 ? null : 'Retroalimentación de ejemplo: en la plataforma real aquí aparece la explicación oficial.' }));
                    const nota = det.filter((x) => x.bien).length;
                    const f = (d.progreso[k(cc, uu)] = d.progreso[k(cc, uu)] || {});
                    f.intentos = (f.intentos || 0) + 1; f.mejor_nota = Math.max(f.mejor_nota || 0, nota);
                    const aprobado = nota >= REGLAS.nota_minima;
                    if (aprobado) f.aprobado_en = ahora(); else if (f.intentos >= REGLAS.intentos) f.bloqueado_en = ahora();
                    const constancia = aprobado ? emitir(perfil, d, cc) : null;
                    r = { nota, de: 5, aprobado, pausado: !aprobado && f.intentos >= REGLAS.intentos, intentos: f.intentos, detalle: det, constancia, progreso: resumen(perfil, d, videos) };
                    break;
                }
                case 'entregar': {
                    exigirAbierta();
                    if ((datos.texto || '').trim().length < 20 && !datos.enlace) throw new Error('Escribe tu respuesta (al menos unas líneas) o pega el enlace a tu evidencia.');
                    if (datos.enlace && !/^https:\/\/\S+$/.test(datos.enlace)) throw new Error('El enlace debe empezar por https:// (por ejemplo, un archivo de Google Drive).');
                    if (SIN_CUESTIONARIO.has(c) && !(d.progreso[k(c, u)] || {}).material_en) throw new Error('Primero repasa el material de estudio de esta unidad.');
                    d.evidencias[k(c, u)] = { estado: 'enviada', texto: datos.texto, enlace: datos.enlace, comentario: null };
                    if (SIN_CUESTIONARIO.has(c)) fila().aprobado_en = fila().aprobado_en || ahora();
                    const constancia = emitir(perfil, d, c);
                    r = { ok: true, constancia, progreso: resumen(perfil, d, videos) };
                    break;
                }
                case 'equipo': r = equipoEjemplo(); break;
                case 'revisar': case 'generar-codigo': r = { ok: true, codigo: '482913', vence_horas: 24, correoEnviado: false, nombre: 'persona de ejemplo', demo: true }; break;
                default: throw new Error('Acción no disponible en la demostración.');
            }
            guardar(perfil, d);
            return r;
        }
        function equipoEjemplo() {
            const p = (nombre, rol, satelite, activa, g, h, s, hitos = [], extra = {}) => ({ cedula: String(Math.floor(Math.random() * 1e8)), nombre, rol, satelite, activa, avance: { gestion: g, 'formacion-secretaria': extra.formacion || 0, 'acompanar-hacer': h, 'facilitar-ser': s }, hitos, constancias: g === 5 ? [{ curso: 'gestion', codigo: 'CIC-GESM-DEMO01' }] : [], pausas: 0, ultima_actividad: activa ? new Date(Date.now() - 864e5 * (extra.dias || 1)).toISOString() : null, cargo: rol === 'dinamizadora' ? 'Acompañamiento' : 'Secretaría Técnica', ...extra });
            return {
                unidades: UNIDADES,
                personas: [
                    p('Dinamizadora de ejemplo 1', 'dinamizadora', 'magdalena', true, 5, 2, 1, ['compromiso', 'transferencia-hacer', 'transferencia-ser']),
                    p('Dinamizadora de ejemplo 2', 'dinamizadora', 'atlantico', true, 3, 0, 0, ['compromiso'], { pausas: 1, dias: 9 }),
                    p('Dinamizadora de ejemplo 3', 'dinamizadora', 'sucre', true, 5, 0, 0, ['compromiso']),
                    p('Dinamizadora de ejemplo 4', 'dinamizadora', 'cordoba', false, 0, 0, 0),
                    p('Secretaría de ejemplo', 'secretaria', null, true, 5, 0, 0, ['compromiso'], { formacion: 2 }),
                ],
                pendientes: [
                    { id: 1, nombre: 'Dinamizadora de ejemplo 2', curso: 'gestion', unidad: 3, tipo: 'actividad', texto: 'Ejemplo: describí cómo opera mi satélite, quién hace cada tarea y cómo reporto cada semana a la Secretaría Técnica.', enlace: '', creado_en: new Date(Date.now() - 864e5).toISOString() },
                    { id: 2, nombre: 'Dinamizadora de ejemplo 1', curso: 'acompanar-hacer', unidad: 2, tipo: 'verificacion', texto: 'Ejemplo: sesión de la semana 2 con 8 emprendedoras; Canvas de la Esquina diligenciado y fotos autorizadas.', enlace: 'https://drive.google.com/ejemplo', creado_en: new Date().toISOString() },
                ],
            };
        }
        return { api, reiniciar: (p) => { try { localStorage.removeItem(clave(p)); } catch (e) { /* nada */ } } };
    })();


    // ================================================================ Vista «Mis cursos»
    // Dos pantallas: el resumen de los cursos (con la lista de módulos) y la lección de cada módulo,
    // que se abre en su propia página interna: video grande → material → evaluación → actividad.
    let C = null;        // contexto que entrega la página (perfil, api, esc, CURSOS…)
    let estado = null;   // último progreso recibido
    let porCodigo = {};  // videos publicados por código
    let leccion = null;  // { curso, unidad } abierta, o null en el resumen
    let reloj = null;    // cuenta regresiva del video

    const esc = (s) => C.esc(s);
    const api = (accion, datos = {}) => C.DEMO ? Demo.api(C.perfil, accion, datos, new Set(Object.keys(porCodigo))) : C.llamar(accion, datos, true);
    const nombreEvidencia = (c) => EVIDENCIA[c] === 'actividad' ? 'Actividad del módulo' : 'Verificación de la sesión';
    const nombreUnidad = (c) => ({ gestion: 'Módulo', 'formacion-secretaria': 'Unidad', 'acompanar-hacer': 'Semana', 'facilitar-ser': 'Taller' }[c] || 'Unidad');
    // De dónde salen las preguntas: el archivo de evaluación oficial (Drive «Productos Contrato»)
    const fuenteEvaluacion = (c, u) => ({
        gestion: `Banco oficial de evaluaciones (octubre 2026) · Curso de gestión, módulo ${u}`,
        'acompanar-hacer': `Banco oficial de evaluaciones (octubre 2026) · Ruta del HACER, semana ${u}`,
        'facilitar-ser': `Banco oficial de evaluaciones (octubre 2026) · Ruta del SER, taller ${u}`,
    }[c] || '');
    const minSeg = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    function recorrido() {
        const h = new Set((estado.hitos || []).map((x) => x.hito));
        const cons = new Set((estado.constancias || []).map((x) => x.curso));
        const hechos = (c) => (estado.cursos[c] || []).filter((x) => x.estado === 'aprobada').length;
        const rutas = ['Acompañar HACER y facilitar SER', cons.has('acompanar-hacer') && cons.has('facilitar-ser'), `${hechos('acompanar-hacer')}/6 semanas · ${hechos('facilitar-ser')}/4 talleres`];
        const pasos = [
            ['Activar tu cuenta', true, 'Contraseña propia'],
            ['Compromiso', h.has('compromiso'), h.has('compromiso') ? 'Confirmado' : 'Pendiente'],
            ['Gestión del CIC', cons.has('gestion'), `${hechos('gestion')} de ${UNIDADES.gestion} módulos`],
            ...(C.perfil.rol === 'secretaria'
                ? [['Formación de la Secretaría', cons.has('formacion-secretaria'), `${hechos('formacion-secretaria')} de 6 unidades`]]
                : [['Transferencia de la ruta', h.has('transferencia-hacer') || h.has('transferencia-ser'), h.has('transferencia-hacer') || h.has('transferencia-ser') ? 'Registrada' : 'La registra la Secretaría']]),
            rutas,
        ];
        const actual = pasos.findIndex(([, ok]) => !ok);
        return `<ol class="recorrido" aria-label="Tu recorrido en los cursos">${pasos.map(([t, ok, sub], i) => `
            <li class="${ok ? 'hecho' : i === actual ? 'actual' : ''}"><span class="recorrido-num" aria-hidden="true">${ok ? '✓' : i + 1}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span>${i === actual ? '<span class="sr-only">(paso actual)</span>' : ''}</li>`).join('')}</ol>`;
    }

    function tarjetaCompromiso() {
        return `<div class="tarjeta compromiso">
            <h3>Antes de empezar: tu compromiso</h3>
            <p>Como parte del equipo del CIC me comprometo a completar el curso Gestión del CIC, acompañar a las emprendedoras con respeto y sin juicios, cuidar sus datos personales y registrar cada sesión el mismo día.</p>
            <label class="casilla"><input type="checkbox" id="acepto-compromiso"><span>Leí y acepto este compromiso.</span></label>
            <button type="button" class="btn btn-primario" id="btn-compromiso" disabled>Confirmar y abrir el módulo 1</button>
        </div>`;
    }

    // ---------- Resumen: un bloque por curso con sus módulos ----------
    function tarjetaCurso(id) {
        const c = C.CURSOS[id];
        const lista = estado.cursos[id];
        const hechos = lista.filter((x) => x.estado === 'aprobada').length;
        const cons = (estado.constancias || []).find((x) => x.curso === id);
        const siguiente = lista.find((x) => x.estado !== 'aprobada' && x.estado !== 'bloqueada');
        return `<article class="curso curso-ancho" id="curso-${id}">
            <div class="curso-cab ${c.color}">
                <h3>${esc(c.titulo)}</h3>
                <p style="font-size:1rem;margin-top:.2rem">${esc(c.meta)} · ${hechos} de ${lista.length} aprobados</p>
                <div class="barra-avance" role="progressbar" aria-label="Avance en ${esc(c.titulo)}" aria-valuemin="0" aria-valuemax="${lista.length}" aria-valuenow="${hechos}"><span style="width:${(hechos / lista.length) * 100}%"></span></div>
                <div class="botones" style="margin-top:.8rem;display:flex;flex-wrap:wrap;gap:.6rem">
                    ${siguiente ? `<button type="button" class="btn btn-primario" data-abrir-leccion="${esc(id)}" data-unidad="${siguiente.unidad}">${siguiente.estado === 'disponible' && !hechos ? 'Empezar' : 'Continuar'}: ${esc(nombreUnidad(id))} ${siguiente.unidad}</button>` : ''}
                    ${cons ? `<button type="button" class="btn btn-claro" data-constancia="${esc(id)}">Descargar mi constancia</button>` : ''}
                </div>
            </div>
            <ol class="modulos-lista">
            ${c.modulos.map(([titulo, sub], i) => {
                const e = lista[i];
                const s = ESTADOS[e.estado];
                const bloq = e.estado === 'bloqueada';
                return `<li><button type="button" class="modulo-fila ${s.clase}" data-abrir-leccion="${esc(id)}" data-unidad="${i + 1}" ${bloq ? 'aria-disabled="true"' : ''}>
                    <span class="unidad-icono" aria-hidden="true">${s.icono}</span>
                    <span class="modulo-texto"><span class="codigo">${esc(C.codigoModulo(id, i))}</span> <b>${esc(titulo)}</b>
                        <small>${esc(s.txt)}${e.estado === 'aprobada' && !e.sin_cuestionario ? ` · ${e.mejor_nota} de ${REGLAS.preguntas}` : ''}${bloq ? ` · ${esc(e.motivo)}` : ''}</small></span>
                    ${porCodigo[C.codigoModulo(id, i)] ? '<span class="chip modulo-chip" aria-label="Tiene video">▶ Video</span>' : ''}
                    <span class="modulo-flecha" aria-hidden="true">${bloq ? '' : '›'}</span>
                </button></li>`;
            }).join('')}
            </ol>
        </article>`;
    }

    function pintarResumen() {
        leccion = null;
        detenerReloj();
        const v = C.vista;
        const h = new Set((estado.hitos || []).map((x) => x.hito));
        v.innerHTML = `
            <h2>Mis cursos</h2>
            <p class="vista-intro">${C.perfil.rol === 'secretaria' ? 'Avanza en orden: Gestión del CIC, luego tu Formación de la Secretaría Técnica y, al terminarla, se abren las rutas HACER y SER para que las supervises.' : 'Avanza en orden: cada módulo se abre cuando apruebas el anterior.'} Toca un módulo para abrir su lección.${C.DEMO ? ' <b>Demostración:</b> tu avance se guarda solo en este dispositivo y las preguntas son de ejemplo, no las oficiales.' : ''}</p>
            ${recorrido()}
            ${h.has('compromiso') ? '' : tarjetaCompromiso()}
            ${Object.keys(estado.cursos).map(tarjetaCurso).join('')}
            ${C.DEMO ? '<p class="privado"><button type="button" class="boton-texto" id="demo-reiniciar">Reiniciar la demostración de los cursos</button></p>' : ''}`;
        const chk = v.querySelector('#acepto-compromiso');
        if (chk) {
            chk.addEventListener('change', () => { v.querySelector('#btn-compromiso').disabled = !chk.checked; });
            v.querySelector('#btn-compromiso').addEventListener('click', async (ev) => {
                ev.currentTarget.disabled = true;
                try { estado = await api('hito', { hito: 'compromiso' }); C.aviso('Compromiso confirmado. Ya puedes empezar el módulo 1.'); abrirLeccion('gestion', 1); } catch (e) { C.aviso(e.message); }
            });
        }
        const reiniciar = v.querySelector('#demo-reiniciar');
        if (reiniciar) reiniciar.addEventListener('click', () => { Demo.reiniciar(C.perfil); refrescar().catch(() => {}); C.aviso('La demostración de los cursos volvió al inicio.'); });
        v.querySelectorAll('[data-constancia]').forEach((b) => b.addEventListener('click', () => imprimirConstancia(b.dataset.constancia)));
    }

    // ---------- Lección de un módulo ----------
    function abrirLeccion(curso, unidad, sinHistorial) {
        const e = (estado.cursos[curso] || [])[unidad - 1];
        if (!e) return;
        if (e.estado === 'bloqueada') { C.aviso(e.motivo); return; }
        leccion = { curso, unidad };
        if (!sinHistorial) history.pushState({ cicLeccion: leccion }, '', location.pathname + location.search + '#leccion');
        pintarLeccion();
        window.scrollTo(0, Math.max(0, C.vista.getBoundingClientRect().top + window.scrollY - 90)); // arriba de la lección, bajo el menú
        const t = C.vista.querySelector('#leccion-titulo');
        if (t) t.focus({ preventScroll: true });
    }
    function volverAlResumen() {
        if (history.state && history.state.cicLeccion) history.back();
        else pintarResumen();
    }

    function pintarLeccion(cuestionario) {
        detenerReloj();
        const { curso, unidad } = leccion;
        const c = C.CURSOS[curso];
        const lista = estado.cursos[curso];
        const e = lista[unidad - 1];
        const i = unidad - 1;
        const vid = porCodigo[C.codigoModulo(curso, i)];
        const pausa = e.estado === 'pausada';
        const ev = e.evidencia;
        const conVideo = !!vid;
        // Pasos y si están completos
        const pasos = e.sin_cuestionario
            ? [['material', 'Material', e.material_visto], ['actividad', 'Actividad', !!ev && ev.estado !== 'devuelta']]
            : [['video', 'Video', !conVideo || e.video_visto], ['material', 'Material', e.material_visto], ['evaluacion', 'Evaluación', !!e.aprobado_en], ['actividad', nombreEvidencia(curso).split(' ')[0], !!ev && ev.estado !== 'devuelta']];
        const siguiente = lista[unidad];
        const anterior = lista[unidad - 2];

        C.vista.innerHTML = `<div class="leccion">
            <nav class="leccion-migas" aria-label="Ruta"><button type="button" class="boton-texto" data-volver>← Mis cursos</button><span aria-hidden="true">›</span><span>${esc(c.titulo)}</span></nav>
            <div class="leccion-rejilla">
                <div class="leccion-principal">
                    <p class="eyebrow">${esc(C.codigoModulo(curso, i))} · ${esc(nombreUnidad(curso))} ${unidad} de ${lista.length}</p>
                    <h2 id="leccion-titulo" tabindex="-1">${esc(c.modulos[i][0].replace(/^[^·]+·\s*/, ''))}</h2>
                    ${pausa ? '<p class="nota nota-pausa"><b>Módulo en pausa.</b> Usaste los dos intentos de la evaluación. Vuelve a ver el video y a repasar el material: la evaluación se reabre sola con dos intentos nuevos.</p>' : ''}
                    <ol class="leccion-pasos" aria-label="Pasos de la lección">${pasos.map(([k, t, ok], n) => `<li class="${ok ? 'hecho' : ''}"><a href="#paso-${k}" data-ir-paso="${k}"><span aria-hidden="true">${ok ? '✓' : n + 1}</span> ${esc(t)}</a></li>`).join('')}</ol>

                    ${e.sin_cuestionario ? '' : `<section class="leccion-bloque" id="paso-video" aria-labelledby="t-video">
                        <h3 id="t-video"><span class="paso-n">1</span> Video de la lección</h3>
                        ${vid ? reproductorGrande(vid, e) : '<p class="tarjeta vacio">El video de este módulo todavía no está publicado. Puedes avanzar con el material de estudio: la evaluación se habilita al repasarlo.</p>'}
                    </section>`}

                    <section class="leccion-bloque" id="paso-material" aria-labelledby="t-material">
                        <h3 id="t-material"><span class="paso-n">${e.sin_cuestionario ? 1 : 2}</span> Material de estudio</h3>
                        ${e.sin_cuestionario ? `<p class="texto-suave">${esc(c.modulos[i][1])}</p>` : ''}
                        <div class="material-lista" aria-live="polite"><p class="texto-suave" role="status">Cargando el material…</p></div>
                        ${e.material_visto && !pausa ? '<p class="paso-ok">✓ Material repasado</p>' : `<button type="button" class="btn btn-borde" data-marcar="material">${pausa ? 'Volví a repasar el material' : 'Ya repasé el material'}</button>`}
                    </section>

                    ${e.sin_cuestionario ? '' : `<section class="leccion-bloque" id="paso-evaluacion" aria-labelledby="t-evaluacion">
                        <h3 id="t-evaluacion"><span class="paso-n">3</span> Evaluación</h3>
                        <p class="fuente-evaluacion">${esc(fuenteEvaluacion(curso, unidad))}</p>
                        <ul class="reglas-evaluacion">
                            <li><b>${REGLAS.preguntas} preguntas</b> de opción múltiple con una sola respuesta correcta. Las preguntas y las opciones cambian de orden en cada intento.</li>
                            <li>Se aprueba con <b>${REGLAS.nota_minima} de ${REGLAS.preguntas}</b>. Tienes <b>${e.intentos_max} intentos</b>.</li>
                            <li>Si no apruebas en los dos, vuelves a ver el video y el material y se reabre.</li>
                        </ul>
                        <div id="caja-cuestionario">${cuestionario || bloqueEvaluacion(e, conVideo)}</div>
                    </section>`}

                    <section class="leccion-bloque" id="paso-actividad" aria-labelledby="t-actividad">
                        <h3 id="t-actividad"><span class="paso-n">${e.sin_cuestionario ? 2 : 4}</span> ${esc(nombreEvidencia(curso))}</h3>
                        ${bloqueActividad(curso, i, e)}
                    </section>

                    <div class="leccion-nav">
                        ${anterior ? `<button type="button" class="btn btn-borde" data-abrir-leccion="${esc(curso)}" data-unidad="${unidad - 1}">← ${esc(nombreUnidad(curso))} ${unidad - 1}</button>` : '<span></span>'}
                        ${siguiente ? `<button type="button" class="btn btn-primario" data-abrir-leccion="${esc(curso)}" data-unidad="${unidad + 1}" ${siguiente.estado === 'bloqueada' ? `disabled title="${esc(siguiente.motivo)}"` : ''}>${esc(nombreUnidad(curso))} ${unidad + 1} →</button>` : '<button type="button" class="btn btn-primario" data-volver>Volver a mis cursos</button>'}
                    </div>
                    ${siguiente && siguiente.estado === 'bloqueada' ? `<p class="ayuda-campo" style="text-align:right">${esc(siguiente.motivo)}</p>` : ''}
                </div>

                <aside class="leccion-lateral" aria-label="Módulos del curso">
                    <p class="eyebrow">${esc(c.titulo)}</p>
                    <div class="barra-avance" role="progressbar" aria-label="Avance" aria-valuemin="0" aria-valuemax="${lista.length}" aria-valuenow="${lista.filter((x) => x.estado === 'aprobada').length}"><span style="width:${lista.filter((x) => x.estado === 'aprobada').length / lista.length * 100}%"></span></div>
                    <ol>${c.modulos.map(([t], n) => {
                        const x = lista[n];
                        const s = ESTADOS[x.estado];
                        return `<li><button type="button" class="lateral-modulo ${s.clase} ${n === i ? 'actual' : ''}" data-abrir-leccion="${esc(curso)}" data-unidad="${n + 1}" ${n === i ? 'aria-current="page"' : ''} ${x.estado === 'bloqueada' ? 'aria-disabled="true"' : ''}>
                            <span class="unidad-icono" aria-hidden="true">${s.icono}</span><span>${esc(t)}<small>${esc(s.txt)}</small></span></button></li>`;
                    }).join('')}</ol>
                </aside>
            </div>
        </div>`;
        enlazarLeccion(e, vid);
        cargarMaterial();
    }

    // Video grande: se carga al tocarlo y desde ese momento corre el tiempo mínimo que controla el servidor
    function reproductorGrande(v, e) {
        const fuente = v.youtube_id
            ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtube_id)}?rel=0&autoplay=1`
            : `https://drive.google.com/file/d/${encodeURIComponent(v.drive_id)}/preview`;
        const portada = v.youtube_id ? `https://i.ytimg.com/vi/${esc(v.youtube_id)}/hqdefault.jpg` : `https://drive.google.com/thumbnail?id=${esc(v.drive_id)}&sz=w1280`;
        const visto = e.video_visto && e.estado !== 'pausada';
        return `<div class="video-grande" data-fuente="${esc(fuente)}" data-titulo="${esc(v.titulo)}">
                ${visto || e.video_iniciado ? `<iframe src="${esc(fuente)}" title="${esc(v.titulo)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`
                    : `<button type="button" class="video-grande-btn" data-reproducir aria-label="Reproducir el video: ${esc(v.titulo)}"><img src="${portada}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"><span class="video-boton" aria-hidden="true"></span><span class="video-grande-txt">Reproducir el video${v.duracion_min ? ` · ${esc(v.duracion_min)} min` : ''}</span></button>`}
            </div>
            <div class="video-estado" aria-live="polite">${visto ? '<p class="paso-ok">✓ Video visto</p>'
                : e.video_iniciado ? `<p class="reloj-video"><span class="reloj-barra"><span style="width:${100 - Math.round(e.video_faltan / e.video_segundos * 100)}%"></span></span> Mira el video completo: la evaluación se habilita en <b data-faltan="${e.video_faltan}">${minSeg(e.video_faltan)}</b>.</p>`
                : `<p class="texto-suave">Toca el video para empezar. La evaluación se habilita cuando lo hayas visto completo${v.duracion_min ? ` (unos ${esc(v.duracion_min)} minutos)` : ''}.</p>`}</div>`;
    }

    function bloqueEvaluacion(e, conVideo) {
        if (e.aprobado_en) return `<p class="paso-ok">✓ Aprobada con ${e.mejor_nota} de ${REGLAS.preguntas}</p>`;
        const falta = [];
        if (conVideo && !e.video_visto) falta.push('ver el video completo');
        if (!e.material_visto) falta.push('repasar el material');
        const intentos = e.intentos ? `<p class="texto-suave">Llevas ${e.intentos} de ${e.intentos_max} intentos${e.mejor_nota != null ? ` · mejor nota ${e.mejor_nota} de ${REGLAS.preguntas}` : ''}.</p>` : '';
        if (!e.puede_cuestionario) return `${intentos}<button type="button" class="btn btn-primario" disabled>Empezar la evaluación</button><p class="ayuda-campo">Se habilita cuando termines de ${falta.join(' y ') || 'repasar el video y el material'}.</p>`;
        return `${intentos}<button type="button" class="btn btn-primario" data-cuestionario>Empezar la evaluación${e.intentos ? ` · intento ${e.intentos + 1} de ${e.intentos_max}` : ''}</button>`;
    }

    function bloqueActividad(curso, i, e) {
        const ev = e.evidencia;
        const lista = estado.cursos[curso];
        const desc = e.sin_cuestionario ? 'Escribe cómo aplicarías esta metodología en la transferencia a las dinamizadoras, o pega el enlace a tu documento. Al enviarla, la unidad queda aprobada y se abre la siguiente.'
            : EVIDENCIA[curso] === 'actividad' ? 'Responde la actividad del módulo con tus palabras, o pega el enlace a tu documento o foto en Google Drive.'
            : `Es la Parte B de la evaluación oficial: después de la sesión con la emprendedora, cuenta cómo te fue (preguntas de salida) y pega el enlace a tus evidencias en Google Drive (lista de asistencia, fotos autorizadas, bitácora). La Secretaría Técnica la revisa.`;
        const habilitada = e.sin_cuestionario ? e.material_visto : !!e.aprobado_en;
        const estadoEv = ev ? `<p class="chip ${ev.estado === 'aprobada' ? 'bg-menta' : ev.estado === 'devuelta' ? 'bg-coral' : 'bg-mantequilla'}">${esc(EV_TXT[ev.estado])}</p>${ev.comentario ? `<p class="nota"><b>Comentario de la Secretaría:</b> ${esc(ev.comentario)}</p>` : ''}` : '';
        if (ev && ev.estado !== 'devuelta') return `<p class="texto-suave">${esc(desc)}</p>${estadoEv}${lista[i + 1] && lista[i + 1].estado !== 'bloqueada' ? '<p class="paso-ok">✓ Siguiente módulo abierto</p>' : ''}`;
        if (!habilitada) return `<p class="texto-suave">${esc(desc)}</p><p class="ayuda-campo">Se habilita cuando ${e.sin_cuestionario ? 'repases el material' : 'apruebes la evaluación'}.</p>`;
        return `<p class="texto-suave">${esc(desc)}</p>${estadoEv}
            <form class="form-evidencia" novalidate>
                <label class="etiqueta" for="ev-t">Tu respuesta</label>
                <textarea class="campo" id="ev-t" name="texto" rows="5" maxlength="4000">${esc(ev ? ev.texto || '' : '')}</textarea>
                <label class="etiqueta" for="ev-e">Enlace a tu evidencia en Google Drive ${EVIDENCIA[curso] === 'verificacion' ? '' : '(opcional)'}</label>
                <input class="campo" id="ev-e" name="enlace" type="url" inputmode="url" placeholder="https://drive.google.com/…" value="${esc(ev ? ev.enlace || '' : '')}">
                <button type="submit" class="btn btn-primario">${e.sin_cuestionario ? 'Enviar y aprobar la unidad' : 'Enviar'}</button>
            </form>`;
    }

    async function cargarMaterial() {
        const caja = C.vista.querySelector('.material-lista');
        if (!caja || !leccion) return;
        const datos = { ...leccion };
        try {
            const r = await api('material', { ...datos, marcar: false });
            if (!leccion || leccion.curso !== datos.curso || leccion.unidad !== datos.unidad) return;
            caja.innerHTML = r.archivos && r.archivos.length
                ? `<ul class="lista-archivos">${r.archivos.map((a) => `<li><a class="archivo" href="${esc(a.url)}" target="_blank" rel="noopener" data-archivo><span class="archivo-icono" aria-hidden="true">📄</span><span>${esc(a.nombre)}<small>Se abre en Google Drive</small></span></a></li>`).join('')}</ul>`
                : `<p class="texto-suave">${C.DEMO ? 'En la demostración no hay archivos: en la plataforma real aquí aparece el material de estudio de la unidad.' : 'El material de esta unidad todavía no está cargado. Repasa el tema con el video y marca cuando termines.'}</p>`;
            caja.querySelectorAll('[data-archivo]').forEach((a) => a.addEventListener('click', () => {
                const e = estado.cursos[datos.curso][datos.unidad - 1];
                if (!e.material_visto || e.estado === 'pausada') api('marcar', { ...datos, que: 'material' }).then((p) => { estado = p; if (leccion) pintarLeccion(); }).catch(() => {});
            }, { once: true }));
        } catch (e) { caja.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
    }

    function detenerReloj() { if (reloj) { clearInterval(reloj); reloj = null; } }
    function arrancarReloj() {
        detenerReloj();
        const b = C.vista.querySelector('[data-faltan]');
        if (!b) return;
        let faltan = Number(b.dataset.faltan);
        const total = estado.cursos[leccion.curso][leccion.unidad - 1].video_segundos;
        const barra = C.vista.querySelector('.reloj-barra span');
        const fin = Date.now() + faltan * 1000;
        reloj = setInterval(async () => {
            faltan = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
            b.textContent = minSeg(faltan);
            if (barra) barra.style.width = `${100 - Math.round(faltan / total * 100)}%`;
            if (faltan > 0) return;
            detenerReloj();
            try { estado = await api('marcar', { ...leccion, que: 'video' }); C.aviso('Video completado: ya puedes presentar la evaluación cuando repases el material.'); }
            catch (e) { try { estado = await api('mi-progreso'); } catch (x) { /* nada */ } }
            if (leccion) pintarLeccion();
        }, 1000);
    }

    function enlazarLeccion(e, vid) {
        const v = C.vista;
        const datos = { ...leccion };
        v.querySelectorAll('[data-volver]').forEach((b) => b.addEventListener('click', volverAlResumen));
        v.querySelectorAll('[data-ir-paso]').forEach((a) => a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const s = v.querySelector(`#paso-${a.dataset.irPaso}`);
            if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        const rep = v.querySelector('[data-reproducir]');
        if (rep) rep.addEventListener('click', async () => {
            const caja = rep.closest('.video-grande');
            caja.innerHTML = `<iframe src="${esc(caja.dataset.fuente)}" title="${esc(caja.dataset.titulo)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
            try { estado = await api('iniciar-video', datos); } catch (x) { C.aviso(x.message); return; }
            const est = estado.cursos[datos.curso][datos.unidad - 1];
            v.querySelector('.video-estado').innerHTML = `<p class="reloj-video"><span class="reloj-barra"><span style="width:${100 - Math.round(est.video_faltan / est.video_segundos * 100)}%"></span></span> Mira el video completo: la evaluación se habilita en <b data-faltan="${est.video_faltan}">${minSeg(est.video_faltan)}</b>.</p>`;
            arrancarReloj();
        });
        if (e.video_iniciado && !(e.video_visto && e.estado !== 'pausada')) arrancarReloj();
        v.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', async () => {
            b.disabled = true;
            try { estado = await api('marcar', { ...datos, que: b.dataset.marcar }); pintarLeccion(); }
            catch (x) { C.aviso(x.message); b.disabled = false; }
        }));
        const cue = v.querySelector('[data-cuestionario]');
        if (cue) cue.addEventListener('click', () => empezarCuestionario(cue));
        const form = v.querySelector('.form-evidencia');
        if (form) form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const texto = form.texto.value.trim(), enlace = form.enlace.value.trim();
            if (EVIDENCIA[datos.curso] === 'verificacion' && !enlace) { C.aviso('Pega el enlace de Google Drive con tus evidencias de la sesión.'); form.enlace.focus(); return; }
            const b = form.querySelector('button[type="submit"]');
            b.disabled = true;
            try {
                const r = await api('entregar', { ...datos, texto, enlace });
                estado = r.progreso;
                pintarLeccion();
                C.aviso(r.constancia ? '¡Completaste el curso! Ya puedes descargar tu constancia en «Mis cursos».' : 'Enviado. Ya puedes seguir con el siguiente módulo.');
            } catch (x) { C.aviso(x.message); b.disabled = false; }
        });
        v.querySelectorAll('[data-abrir-leccion]').forEach((b) => b.addEventListener('click', () => {
            if (b.getAttribute('aria-disabled') === 'true') { const x = estado.cursos[b.dataset.abrirLeccion][Number(b.dataset.unidad) - 1]; C.aviso(x.motivo); return; }
            abrirLeccion(b.dataset.abrirLeccion, Number(b.dataset.unidad));
        }));
    }

    // ---------- Evaluación dentro de la lección ----------
    async function empezarCuestionario(boton) {
        boton.disabled = true;
        let q;
        try { q = await api('cuestionario', { ...leccion }); } catch (e) { C.aviso(e.message); boton.disabled = false; return; }
        const caja = C.vista.querySelector('#caja-cuestionario');
        caja.innerHTML = `<form class="cuestionario-inline" novalidate>
            <p class="eyebrow">Intento ${q.intento} de ${q.de}${C.DEMO ? ' · preguntas de ejemplo (demostración)' : ''}</p>
            ${q.preguntas.map((p, i) => `<fieldset class="pregunta"><legend><span class="pregunta-num">${i + 1}</span> ${esc(p.enunciado)}</legend>
                ${p.opciones.map((o, j) => `<label class="opcion"><input type="radio" name="p${i}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
            <p class="mensaje error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primario">Enviar respuestas</button>
        </form>`;
        caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
        caja.querySelector('form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const f = ev.currentTarget;
            const resp = q.preguntas.map((_, i) => { const x = f.querySelector(`input[name="p${i}"]:checked`); return x ? Number(x.value) : null; });
            const m = f.querySelector('.mensaje');
            if (resp.some((x) => x === null)) { m.textContent = `Te falta responder ${resp.filter((x) => x === null).length} pregunta(s).`; m.hidden = false; return; }
            const b = f.querySelector('button[type="submit"]');
            b.disabled = true; b.textContent = 'Calificando…';
            try {
                const r = await api('responder', { id: q.id, respuestas: resp });
                estado = r.progreso;
                const resultado = `<div class="resultado-inline ${r.aprobado ? 'aprobado' : 'no-aprobado'}">
                    <p class="resultado-nota">${r.nota}<small>/${r.de}</small></p>
                    <div><h4>${r.aprobado ? '¡Aprobaste la evaluación!' : r.pausado ? 'Esta vez no fue' : 'Casi: tienes otro intento'}</h4>
                    <p>${r.aprobado ? 'Ahora envía la actividad de abajo para abrir el siguiente módulo.' : r.pausado ? 'Usaste los dos intentos. Vuelve a ver el video y a repasar el material: la evaluación se reabre sola.' : 'Repasa lo que fallaste y vuelve a intentarlo.'}</p></div>
                    ${r.detalle.some((x) => !x.bien) ? `<div class="retro-caja"><b>Para repasar</b><ul class="retro">${r.detalle.map((x, i) => x.bien ? '' : `<li><b>Pregunta ${i + 1}:</b> ${esc(x.retro)}</li>`).join('')}</ul></div>` : ''}
                </div>`;
                pintarLeccion(resultado + bloqueEvaluacion(estado.cursos[leccion.curso][leccion.unidad - 1], !!porCodigo[C.codigoModulo(leccion.curso, leccion.unidad - 1)]).replace(/^<p class="paso-ok">[^<]*<\/p>/, ''));
                C.vista.querySelector('#paso-evaluacion').scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) { m.textContent = e.message; m.hidden = false; b.disabled = false; b.textContent = 'Enviar respuestas'; }
        });
    }

    async function refrescar() {
        estado = await api('mi-progreso');
        if (leccion) pintarLeccion(); else pintarResumen();
    }
    // Botón «atrás» del navegador: de la lección vuelve al resumen
    window.addEventListener('popstate', (ev) => {
        if (!C || !estado) return;
        if (ev.state && ev.state.cicLeccion) { leccion = ev.state.cicLeccion; pintarLeccion(); }
        else if (leccion) pintarResumen();
    });
    document.addEventListener('click', (ev) => {
        const b = ev.target.closest('#vista-cursos [data-abrir-leccion]');
        if (!b || !C || leccion) return; // en la lección los botones ya tienen su propio manejador
        if (b.getAttribute('aria-disabled') === 'true') { const x = estado.cursos[b.dataset.abrirLeccion][Number(b.dataset.unidad) - 1]; C.aviso(x.motivo); return; }
        abrirLeccion(b.dataset.abrirLeccion, Number(b.dataset.unidad));
    });

    // ---------- Constancia imprimible ----------
    function imprimirConstancia(curso) {
        const x = (estado.constancias || []).find((c) => c.curso === curso);
        if (!x) return;
        const fecha = new Date(x.emitida_en || Date.now()).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
        const url = new URL('./#verificar-' + x.codigo, location.href).href;
        const w = window.open('', '_blank');
        if (!w) return C.aviso('Permite las ventanas emergentes para descargar tu constancia.');
        w.document.write(`<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><title>Constancia ${esc(x.codigo)}</title>
            <style>body{font-family:'Nunito Sans',Arial,sans-serif;color:#2E4A3E;margin:0;display:grid;place-items:center;min-height:100vh;background:#FFF6EE}
            .c{width:min(900px,92vw);background:#fff;border:3px solid #9ED0B7;border-radius:24px;padding:48px;text-align:center}
            h1{font-family:Quicksand,Arial,sans-serif;font-size:38px;margin:.2em 0}.n{font-family:Quicksand,Arial,sans-serif;font-size:30px;font-weight:700;margin:.6em 0;color:#B04A36}
            p{font-size:17px;line-height:1.6}.cod{font-family:monospace;font-size:16px;margin-top:2em;color:#4F6B5E}@media print{body{background:#fff}.c{border-color:#2E4A3E}button{display:none}}</style></head>
            <body><div class="c"><p style="letter-spacing:.2em;text-transform:uppercase;font-size:13px;font-weight:700;color:#B04A36">Centro de Innovación Comunitaria · Red de Mujeres del Caribe</p>
            <h1>Constancia de participación</h1><p>Se hace constar que</p><p class="n">${esc(C.perfil.nombre)}</p>
            <p>aprobó el curso <b>${esc(C.CURSOS[curso].titulo)}</b> de la plataforma del CIC, con todos sus cuestionarios y evidencias.</p>
            <p>${esc(fecha)}</p><p class="cod">Código ${esc(x.codigo)} · verifícalo en ${esc(url)}</p>
            <button onclick="print()" style="margin-top:1.5em;padding:.8em 1.6em;border-radius:99px;border:0;background:#B04A36;color:#fff;font-size:16px;cursor:pointer">Imprimir o guardar en PDF</button></div></body></html>`);
        w.document.close();
    }

    // ================================================================ Panel de la Secretaría: avance del equipo
    async function pintarEquipo(cont) {
        cont.innerHTML = '<p class="vista-intro" role="status">Cargando el avance del equipo…</p>';
        let d;
        try { d = await api('equipo'); } catch (e) { cont.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; return; }
        const din = d.personas.filter((p) => p.rol === 'dinamizadora');
        const sat = (id) => { const s = C.satelite(id); return s ? s.nombre : ''; };
        const hace = (f) => { if (!f) return 'Sin actividad'; const dias = Math.floor((Date.now() - new Date(f)) / 864e5); return dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`; };
        const filas = d.personas.map((p) => {
            const g = p.avance.gestion, gestionOk = p.constancias.some((x) => x.curso === 'gestion');
            const tr = (hito, txt) => `<label class="casilla casilla-mini"><input type="checkbox" data-hito="${hito}" data-cedula="${esc(p.cedula)}" ${p.hitos.includes(hito) ? 'checked' : ''} ${p.activa && gestionOk ? '' : 'disabled'}><span>${txt}</span></label>`;
            const quieto = p.activa && (!p.ultima_actividad || Date.now() - new Date(p.ultima_actividad) > 7 * 864e5) && !gestionOk;
            return `<tr class="${quieto || p.pausas ? 'fila-alerta' : ''}">
                <td><b>${esc(p.nombre)}</b><small>${esc(p.cargo || '')}${sat(p.satelite) ? ' · ' + esc(sat(p.satelite)) : ''}</small></td>
                <td>${p.activa ? '<span class="chip bg-menta">Activa</span>' : `<button type="button" class="boton-texto" data-codigo="${esc(p.cedula)}" data-nombre="${esc(p.nombre)}" data-celular="${esc(p.celular || '')}">Generar código</button>`}</td>
                <td><span class="mini-barra" title="${g} de 5"><span style="width:${g / 5 * 100}%"></span></span> ${g}/5${gestionOk ? ' ✓' : ''}</td>
                <td>${p.rol === 'dinamizadora' ? `${p.avance['acompanar-hacer']}/6 · ${p.avance['facilitar-ser']}/4` : `Formación ${p.avance['formacion-secretaria'] || 0}/6`}</td>
                <td>${p.rol === 'dinamizadora' ? tr('transferencia-hacer', 'HACER') + tr('transferencia-ser', 'SER') : '—'}</td>
                <td><small>${esc(hace(p.ultima_actividad))}${p.pausas ? ` · ${p.pausas} en pausa` : ''}${quieto ? ' · sin avanzar' : ''}</small></td>
            </tr>`;
        }).join('');
        cont.innerHTML = `
            <h3 class="subtitulo-seccion">Avance del equipo en los cursos</h3>
            <div class="rejilla r4 movil-2">
                <div class="tarjeta kpi"><b>${d.personas.filter((p) => p.activa).length}<small class="texto-suave" style="font-size:1rem">/${d.personas.length}</small></b><span>cuentas activadas</span></div>
                <div class="tarjeta kpi"><b>${din.filter((p) => p.constancias.some((x) => x.curso === 'gestion')).length}<small class="texto-suave" style="font-size:1rem">/${din.length}</small></b><span>dinamizadoras con Gestión aprobada</span></div>
                <div class="tarjeta kpi"><b>${d.pendientes.length}</b><span>evidencias por revisar</span></div>
                <div class="tarjeta kpi"><b>${d.personas.filter((p) => p.pausas).length}</b><span>${d.personas.filter((p) => p.pausas).length === 1 ? 'persona' : 'personas'} con un módulo en pausa</span></div>
            </div>
            <div class="tabla-caja"><table class="tabla-equipo">
                <thead><tr><th scope="col">Persona</th><th scope="col">Cuenta</th><th scope="col">Gestión</th><th scope="col">Rutas o formación</th><th scope="col">Transferencia</th><th scope="col">Actividad</th></tr></thead>
                <tbody>${filas}</tbody></table></div>
            <p class="ayuda-campo">La transferencia se marca después de la sesión de transferencia con la Secretaría y abre el curso de esa ruta. En rojo: personas con un módulo en pausa o más de 7 días sin avanzar.</p>
            <h3 class="subtitulo-seccion" id="bandeja">Evidencias por revisar</h3>
            ${d.pendientes.length ? d.pendientes.map((e) => `<article class="tarjeta evidencia" data-id="${e.id}">
                <p class="eyebrow">${esc(C.CURSOS[e.curso].titulo)} · ${esc(C.codigoModulo(e.curso, e.unidad - 1))} · ${e.tipo === 'actividad' ? 'Actividad' : 'Verificación de la sesión'}</p>
                <h4>${esc(e.nombre)}</h4>
                ${e.texto ? `<p class="evidencia-texto">${esc(e.texto)}</p>` : ''}
                ${e.enlace ? `<p><a class="enlace" href="${esc(e.enlace)}" target="_blank" rel="noopener noreferrer">Abrir la evidencia</a></p>` : ''}
                <label class="etiqueta" for="com-${e.id}">Comentario (obligatorio si la devuelves)</label>
                <textarea class="campo" id="com-${e.id}" rows="2" maxlength="1000"></textarea>
                <div class="botones"><button type="button" class="btn btn-primario" data-revisar="aprobada">Aprobar</button><button type="button" class="btn btn-borde" data-revisar="devuelta">Devolver con comentario</button></div>
            </article>`).join('') : '<p class="tarjeta vacio">No hay evidencias pendientes. ¡Todo al día!</p>'}`;

        cont.addEventListener('change', async (ev) => {
            const ch = ev.target.closest('[data-hito]');
            if (!ch) return;
            try { await api('hito', { hito: ch.dataset.hito, cedula: ch.dataset.cedula, quitar: !ch.checked }); C.aviso(ch.checked ? 'Transferencia registrada: se abrió el curso de esa ruta.' : 'Transferencia quitada.'); }
            catch (e) { ch.checked = !ch.checked; C.aviso(e.message); }
        });
        cont.addEventListener('click', async (ev) => {
            const b = ev.target.closest('[data-revisar]');
            if (b) {
                const card = b.closest('.evidencia');
                const comentario = card.querySelector('textarea').value.trim();
                if (b.dataset.revisar === 'devuelta' && comentario.length < 5) { C.aviso('Escribe qué debe ajustar antes de devolverla.'); card.querySelector('textarea').focus(); return; }
                b.disabled = true;
                try { await api('revisar', { id: Number(card.dataset.id), estado: b.dataset.revisar, comentario }); card.remove(); C.aviso(b.dataset.revisar === 'aprobada' ? 'Evidencia aprobada.' : 'Evidencia devuelta con tu comentario.'); }
                catch (e) { C.aviso(e.message); b.disabled = false; }
                return;
            }
            const g = ev.target.closest('[data-codigo]');
            if (g) generarCodigo(g.dataset.codigo, g.dataset.nombre, g.dataset.celular);
        });
    }

    // Código de activación o recuperación para entregar por WhatsApp (Secretaría y dinamizadoras)
    async function generarCodigo(cedula, nombre, celular) {
        if (!confirm(`¿Generar un código de acceso para ${nombre}? Con él creará su propia contraseña. Vence en 24 horas.`)) return;
        let r;
        try { r = await api('generar-codigo', { cedula }); } catch (e) { C.aviso(e.message); return; }
        const msj = `Hola, ${String(r.nombre || nombre).split(' ')[0]}. Tu código para activar o recuperar tu cuenta del CIC es ${r.codigo}. Entra a la página del CIC, toca «Ingresar», elige tu perfil y luego «Activar mi cuenta» (o «¿Olvidaste tu contraseña?»). Escribe tu cédula, este código y tu nueva contraseña. Vence en ${r.vence_horas} horas.`;
        const digitos = String(celular || '').replace(/\D/g, '');
        const wa = `https://wa.me/${digitos.length >= 10 ? '57' + digitos.slice(-10) : ''}?text=${encodeURIComponent(msj)}`;
        let d = document.getElementById('dlg-codigo');
        if (!d) { d = document.createElement('dialog'); d.id = 'dlg-codigo'; d.setAttribute('aria-labelledby', 'dlg-codigo-t'); document.body.appendChild(d); }
        d.innerHTML = `<div class="dialogo">
            <button type="button" class="cerrar" data-cerrar-codigo aria-label="Cerrar">×</button>
            <p class="eyebrow">${r.demo ? 'Demostración · ' : ''}Código de acceso</p>
            <h2 id="dlg-codigo-t" class="dialogo-titulo" style="font-size:1.4rem">Para ${esc(r.nombre || nombre)}</h2>
            <p class="codigo-grande" aria-label="Código ${esc(String(r.codigo).split('').join(' '))}">${esc(r.codigo)}</p>
            <p class="texto-suave">Vence en ${esc(r.vence_horas)} horas. ${r.correoEnviado ? `También se envió a ${esc(r.correo)}.` : 'Envíaselo por WhatsApp o díselo en persona.'}</p>
            <p class="evidencia-texto" style="margin-top:1rem">${esc(msj)}</p>
            <div class="botones" style="display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem">
                <a class="btn btn-primario" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
                <button type="button" class="btn btn-borde" data-copiar>Copiar mensaje</button>
            </div>
        </div>`;
        d.querySelector('[data-cerrar-codigo]').addEventListener('click', () => d.close());
        d.querySelector('[data-copiar]').addEventListener('click', async (ev) => {
            try { await navigator.clipboard.writeText(msj); ev.currentTarget.textContent = 'Mensaje copiado'; }
            catch (e) { C.aviso('No se pudo copiar: selecciona el texto y cópialo.'); }
        });
        d.showModal();
    }

    window.CICCursos = {
        async pintar(vista, contexto) {
            C = { ...contexto, vista };
            leccion = null;
            detenerReloj();
            vista.innerHTML = '<p class="vista-intro" role="status">Cargando tus cursos…</p>';
            try { porCodigo = Object.fromEntries(((await C.traerVideos()) || []).filter((x) => x.audiencia === 'equipo').map((x) => [x.codigo, x])); } catch (e) { porCodigo = {}; }
            try { await refrescar(); } catch (e) { vista.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
        },
        async pintarEquipo(cont, contexto) { C = C ? { ...C, ...contexto } : contexto; await pintarEquipo(cont); },
        generarCodigo: (cedula, nombre, contexto, celular) => { C = C ? { ...C, ...contexto } : contexto; return generarCodigo(cedula, nombre, celular); },
    };
})();
