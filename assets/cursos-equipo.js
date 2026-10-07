// CIC · Cursos del equipo: recorrido, desbloqueo por etapas, cuestionarios, evidencias y panel de la Secretaría.
// Las reglas viven en el servidor (función cic-acceso). En modo demostración, este archivo las imita con datos
// de ejemplo guardados solo en este navegador, sin las preguntas oficiales (que nunca llegan a la página).
(() => {
    'use strict';

    const REGLAS = { preguntas: 5, nota_minima: 4, intentos: 2 };
    const UNIDADES = { gestion: 5, 'formacion-secretaria': 6, 'acompanar-hacer': 6, 'facilitar-ser': 4 };
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
            return {
                unidad: u, estado: e, motivo: falta, tiene_video: tieneVideo, sin_cuestionario: SIN_CUESTIONARIO.has(c), video_visto: !!f.video_en, material_visto: !!f.material_en,
                intentos: f.intentos || 0, intentos_max: REGLAS.intentos, ronda: f.ronda || 1, mejor_nota: f.mejor_nota ?? null, aprobado_en: f.aprobado_en || null,
                puede_cuestionario: !SIN_CUESTIONARIO.has(c) && !falta && !f.aprobado_en && !f.bloqueado_en && (f.intentos || 0) < REGLAS.intentos && !!f.material_en && (!tieneVideo || !!f.video_en),
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
        const preguntasEjemplo = (c, u) => Array.from({ length: 5 }, (_, i) => ({
            id: i, enunciado: `Pregunta de ejemplo ${i + 1} de la unidad ${u}. En la plataforma real salen 5 preguntas oficiales al azar.`,
            opciones: ['Respuesta correcta (en la demostración, siempre la primera)', 'Otra opción', 'Una opción más'],
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
                case 'marcar': {
                    exigirAbierta();
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
    let C = null;        // contexto que entrega la página (perfil, api, esc, CURSOS…)
    let estado = null;   // último progreso recibido
    let porCodigo = {};  // videos publicados por código

    const esc = (s) => C.esc(s);
    const api = (accion, datos = {}) => C.DEMO ? Demo.api(C.perfil, accion, datos, new Set(Object.keys(porCodigo))) : C.llamar(accion, datos, true);
    const nombreEvidencia = (c) => EVIDENCIA[c] === 'actividad' ? 'Actividad del módulo' : 'Verificación de la sesión';

    function recorrido() {
        const h = new Set((estado.hitos || []).map((x) => x.hito));
        const cons = new Set((estado.constancias || []).map((x) => x.curso));
        const hechos = (c) => (estado.cursos[c] || []).filter((x) => x.estado === 'aprobada').length;
        const rutas = ['Acompañar HACER y facilitar SER', cons.has('acompanar-hacer') && cons.has('facilitar-ser'), `${hechos('acompanar-hacer')}/6 semanas · ${hechos('facilitar-ser')}/4 talleres`];
        const clave = !C.perfil.debe_cambiar_clave;
        const pasos = [
            ['Activar tu cuenta', clave, clave ? 'Contraseña propia' : 'Cambia tu contraseña'],
            ['Compromiso', h.has('compromiso'), h.has('compromiso') ? 'Confirmado' : 'Pendiente'],
            ['Gestión del CIC', cons.has('gestion'), `${hechos('gestion')} de 5 módulos`],
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

    function pasoHecho(ok, txt) { return ok ? `<span class="paso-ok">✓ ${esc(txt)}</span>` : ''; }

    function cuerpoUnidad(id, i, e) {
        const c = C.CURSOS[id];
        const cod = C.codigoModulo(id, i);
        const vid = porCodigo[cod];
        if (e.estado === 'bloqueada') return `<p class="nota">${esc(e.motivo)}</p>${c.pagina ? `<a class="btn btn-borde" href="${c.pagina}#${c.ancla}-${i + 1}">Ver de qué trata</a>` : ''}`;
        if (e.sin_cuestionario) return cuerpoSinCuestionario(id, i, e);
        const ev = e.evidencia;
        const pausa = e.estado === 'pausada';
        const intentosTxt = e.aprobado_en ? `Aprobado con ${e.mejor_nota} de ${REGLAS.preguntas}.`
            : e.estado === 'pausada' ? 'Perdiste los dos intentos. Vuelve a ver el video y a repasar el material: el cuestionario se reabre solo.'
            : e.intentos ? `Llevas ${e.intentos} de ${e.intentos_max} intentos${e.mejor_nota != null ? ` · mejor nota ${e.mejor_nota} de ${REGLAS.preguntas}` : ''}.`
            : `${REGLAS.preguntas} preguntas · se aprueba con ${REGLAS.nota_minima} · ${e.intentos_max} intentos.`;
        return `<ol class="pasos-modulo">
            <li class="${e.video_visto || !e.tiene_video ? 'ok' : ''}">
                <h4>1. Video</h4>
                ${vid ? C.reproductor(vid) : '<p class="texto-suave">El video de este módulo todavía no está publicado. Puedes seguir con el material de estudio.</p>'}
                ${vid ? (e.video_visto && !pausa ? pasoHecho(true, 'Video visto') : `<button type="button" class="btn btn-borde" data-marcar="video">${pausa ? 'Volví a ver el video' : 'Ya vi el video'}</button>`) : ''}
            </li>
            <li class="${e.material_visto ? 'ok' : ''}">
                <h4>2. Material de estudio</h4>
                <div class="botones">
                    <button type="button" class="btn btn-borde" data-material>Abrir material de estudio</button>
                    <a class="btn btn-borde" href="${c.pagina}#${c.ancla}-${i + 1}" target="_blank" rel="noopener">Ver el tema</a>
                </div>
                <div class="material-lista" aria-live="polite"></div>
                ${e.material_visto && !pausa ? pasoHecho(true, 'Material repasado') : `<button type="button" class="${pausa ? 'btn btn-borde' : 'boton-texto'}" data-marcar="material">${pausa ? 'Volví a repasar el material' : 'Ya repasé el material'}</button>`}
            </li>
            <li class="${e.aprobado_en ? 'ok' : ''}">
                <h4>3. Cuestionario</h4>
                <p class="texto-suave">${esc(intentosTxt)}</p>
                ${e.aprobado_en ? '' : `<button type="button" class="btn btn-primario" data-cuestionario ${e.puede_cuestionario ? '' : 'disabled aria-describedby="pista-' + id + i + '"'}>Presentar cuestionario${e.intentos ? ` · intento ${e.intentos + 1} de ${e.intentos_max}` : ''}</button>
                ${e.puede_cuestionario ? '' : `<small class="ayuda-campo" id="pista-${id}${i}">${e.estado === 'pausada' ? 'Se reabre al repasar el video y el material.' : 'Se activa cuando veas el video y repases el material.'}</small>`}`}
            </li>
            <li class="${ev && ev.estado !== 'devuelta' ? 'ok' : ''}">
                <h4>4. ${esc(nombreEvidencia(id))}</h4>
                <p class="texto-suave">${EVIDENCIA[id] === 'actividad' ? 'Responde la actividad del módulo con tus palabras, o pega el enlace a tu documento o foto (Google Drive).' : 'Después de la sesión, cuenta cómo te fue y pega el enlace a las evidencias (lista de asistencia, fotos autorizadas, bitácora).'}</p>
                ${ev ? `<p class="chip ${ev.estado === 'aprobada' ? 'bg-menta' : ev.estado === 'devuelta' ? 'bg-coral' : 'bg-mantequilla'}">${esc(EV_TXT[ev.estado])}</p>${ev.comentario ? `<p class="nota"><b>Comentario de la Secretaría:</b> ${esc(ev.comentario)}</p>` : ''}` : ''}
                ${ev && ev.estado !== 'devuelta' ? '' : `<form class="form-evidencia" novalidate>
                    <label class="etiqueta" for="ev-t-${id}-${i}">Tu respuesta</label>
                    <textarea class="campo" id="ev-t-${id}-${i}" name="texto" rows="4" maxlength="4000">${esc(ev ? ev.texto || '' : '')}</textarea>
                    <label class="etiqueta" for="ev-e-${id}-${i}">Enlace a tu evidencia (opcional)</label>
                    <input class="campo" id="ev-e-${id}-${i}" name="enlace" type="url" inputmode="url" placeholder="https://drive.google.com/…" value="${esc(ev ? ev.enlace || '' : '')}">
                    <button type="submit" class="btn btn-primario">Enviar</button>
                </form>`}
            </li>
        </ol>`;
    }

    // Unidad que se aprueba al repasar el material y enviar la actividad (no tiene banco de preguntas)
    function cuerpoSinCuestionario(id, i, e) {
        const c = C.CURSOS[id];
        const ev = e.evidencia;
        return `<p class="texto-suave">${esc(c.modulos[i][1])}</p>
        <ol class="pasos-modulo">
            <li class="${e.material_visto ? 'ok' : ''}">
                <h4>1. Guía de estudio y presentaciones</h4>
                <button type="button" class="btn btn-borde" data-material>Abrir el material de la unidad</button>
                <div class="material-lista" aria-live="polite"></div>
                ${e.material_visto ? pasoHecho(true, 'Material repasado') : '<button type="button" class="boton-texto" data-marcar="material">Ya repasé el material</button>'}
            </li>
            <li class="${ev && ev.estado !== 'devuelta' ? 'ok' : ''}">
                <h4>2. Actividad de la unidad</h4>
                <p class="texto-suave">Escribe cómo aplicarías esta metodología en la transferencia a las dinamizadoras, o pega el enlace a tu documento. Al enviarla, la unidad queda aprobada y se abre la siguiente.</p>
                ${ev ? `<p class="chip ${ev.estado === 'aprobada' ? 'bg-menta' : ev.estado === 'devuelta' ? 'bg-coral' : 'bg-mantequilla'}">${esc(EV_TXT[ev.estado])}</p>${ev.comentario ? `<p class="nota"><b>Comentario:</b> ${esc(ev.comentario)}</p>` : ''}` : ''}
                ${ev && ev.estado !== 'devuelta' ? '' : (e.material_visto ? `<form class="form-evidencia" novalidate>
                    <label class="etiqueta" for="ev-t-${id}-${i}">Tu respuesta</label>
                    <textarea class="campo" id="ev-t-${id}-${i}" name="texto" rows="4" maxlength="4000">${esc(ev ? ev.texto || '' : '')}</textarea>
                    <label class="etiqueta" for="ev-e-${id}-${i}">Enlace a tu documento (opcional)</label>
                    <input class="campo" id="ev-e-${id}-${i}" name="enlace" type="url" inputmode="url" placeholder="https://drive.google.com/…" value="${esc(ev ? ev.enlace || '' : '')}">
                    <button type="submit" class="btn btn-primario">Enviar y aprobar la unidad</button>
                </form>` : '<small class="ayuda-campo">Se activa cuando repases el material.</small>')}
            </li>
        </ol>`;
    }

    function tarjetaCurso(id) {
        const c = C.CURSOS[id];
        const lista = estado.cursos[id];
        const hechos = lista.filter((x) => x.estado === 'aprobada').length;
        const cons = (estado.constancias || []).find((x) => x.curso === id);
        const abierta = lista.find((x) => x.estado === 'en-curso' || x.estado === 'pausada' || x.estado === 'disponible');
        return `<article class="curso curso-ancho" id="curso-${id}">
            <div class="curso-cab ${c.color}">
                <h3>${esc(c.titulo)}</h3>
                <p style="font-size:1rem;margin-top:.2rem">${esc(c.meta)} · ${hechos} de ${lista.length} aprobados</p>
                <div class="barra-avance" role="progressbar" aria-label="Avance en ${esc(c.titulo)}" aria-valuemin="0" aria-valuemax="${lista.length}" aria-valuenow="${hechos}"><span style="width:${(hechos / lista.length) * 100}%"></span></div>
                ${cons ? `<button type="button" class="btn btn-claro" data-constancia="${esc(id)}">Descargar mi constancia</button>` : ''}
            </div>
            <ol class="unidades">
            ${c.modulos.map(([titulo], i) => {
                const e = lista[i];
                const s = ESTADOS[e.estado];
                return `<li class="unidad ${s.clase}" data-curso="${esc(id)}" data-unidad="${i + 1}">
                    <details ${abierta && abierta.unidad === i + 1 ? 'open' : ''}>
                        <summary>
                            <span class="unidad-icono" aria-hidden="true">${s.icono}</span>
                            <span class="unidad-titulo"><span class="codigo">${esc(C.codigoModulo(id, i))}</span> ${esc(titulo)}<small>${esc(s.txt)}${e.estado === 'aprobada' && !e.sin_cuestionario ? ` · ${e.mejor_nota} de ${REGLAS.preguntas}` : ''}${e.estado === 'bloqueada' ? ` · ${e.motivo}` : ''}</small></span>
                        </summary>
                        <div class="unidad-cuerpo">${cuerpoUnidad(id, i, e)}</div>
                    </details>
                </li>`;
            }).join('')}
            </ol>
        </article>`;
    }

    function pintarVista() {
        const v = C.vista;
        const h = new Set((estado.hitos || []).map((x) => x.hito));
        const lista = Object.keys(estado.cursos);
        v.innerHTML = `
            <h2>Mis cursos</h2>
            <p class="vista-intro">${C.perfil.rol === 'secretaria' ? 'Avanza en orden: Gestión del CIC, luego tu Formación de la Secretaría Técnica y, al terminarla, se abren las rutas HACER y SER para que las supervises.' : 'Avanza en orden: cada módulo se abre cuando apruebas el anterior.'}${C.DEMO ? ' <b>Demostración:</b> tu avance se guarda solo en este dispositivo y las preguntas son de ejemplo.' : ''}</p>
            ${recorrido()}
            ${C.perfil.debe_cambiar_clave ? '<div class="tarjeta compromiso"><h3>Primero, tu contraseña</h3><p>Tu contraseña todavía es tu número de cédula. Cámbiala en «Mi cuenta» para abrir tus cursos.</p><button type="button" class="btn btn-primario" data-ir="cuenta">Cambiar mi contraseña</button></div>' : (h.has('compromiso') ? '' : tarjetaCompromiso())}
            ${lista.map(tarjetaCurso).join('')}
            ${C.DEMO ? '<p class="privado"><button type="button" class="boton-texto" id="demo-reiniciar">Reiniciar la demostración de los cursos</button></p>' : ''}`;
        enlazar();
    }

    async function refrescar(nuevo) {
        if (nuevo) estado = nuevo; else estado = await api('mi-progreso');
        const abiertos = [...C.vista.querySelectorAll('.unidad details[open]')].map((d) => d.closest('.unidad').dataset.curso + d.closest('.unidad').dataset.unidad);
        pintarVista();
        abiertos.forEach((k) => { const el = C.vista.querySelector(`.unidad[data-curso="${k.replace(/\d+$/, '')}"][data-unidad="${k.match(/\d+$/)[0]}"] details`); if (el) el.open = true; });
    }

    function enlazar() {
        const v = C.vista;
        const chk = v.querySelector('#acepto-compromiso');
        if (chk) {
            chk.addEventListener('change', () => { v.querySelector('#btn-compromiso').disabled = !chk.checked; });
            v.querySelector('#btn-compromiso').addEventListener('click', async (ev) => {
                ev.currentTarget.disabled = true;
                try { await refrescar(await api('hito', { hito: 'compromiso' })); C.aviso('Compromiso confirmado. Ya puedes empezar el módulo 1.'); } catch (e) { C.aviso(e.message); }
            });
        }
        const reiniciar = v.querySelector('#demo-reiniciar');
        if (reiniciar) reiniciar.addEventListener('click', () => { Demo.reiniciar(C.perfil); refrescar().catch(() => {}); C.aviso('La demostración de los cursos volvió al inicio.'); });

        v.querySelectorAll('.unidad').forEach((li) => {
            const datos = { curso: li.dataset.curso, unidad: Number(li.dataset.unidad) };
            li.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', async () => {
                b.disabled = true;
                try { await refrescar(await api('marcar', { ...datos, que: b.dataset.marcar })); } catch (e) { C.aviso(e.message); b.disabled = false; }
            }));
            const mat = li.querySelector('[data-material]');
            if (mat) mat.addEventListener('click', async () => {
                const caja = li.querySelector('.material-lista');
                mat.disabled = true;
                try {
                    const r = await api('material', datos);
                    caja.innerHTML = r.archivos && r.archivos.length
                        ? `<ul class="lista-archivos">${r.archivos.map((a) => `<li><a class="enlace" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nombre)}</a></li>`).join('')}</ul><small class="ayuda-campo">Los enlaces vencen en una hora.</small>`
                        : `<p class="texto-suave">${C.DEMO ? 'En la demostración no hay archivos: en la plataforma real aquí aparece el material de estudio de la unidad.' : 'El material de esta unidad todavía no está cargado. Mientras tanto, repasa el tema en «Ver el tema».'}</p>`;
                    if (r.archivos && r.archivos.length) refrescar().catch(() => {});
                } catch (e) { C.aviso(e.message); } finally { mat.disabled = false; }
            });
            const cue = li.querySelector('[data-cuestionario]');
            if (cue) cue.addEventListener('click', () => abrirCuestionario(datos, cue));
            const form = li.querySelector('.form-evidencia');
            if (form) form.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const b = form.querySelector('button[type="submit"]');
                b.disabled = true;
                try {
                    const r = await api('entregar', { ...datos, texto: form.texto.value.trim(), enlace: form.enlace.value.trim() });
                    await refrescar(r.progreso);
                    C.aviso(r.constancia ? '¡Completaste el curso! Ya puedes descargar tu constancia.' : 'Enviado. La Secretaría Técnica lo revisará.');
                } catch (e) { C.aviso(e.message); b.disabled = false; }
            });
        });
        v.querySelectorAll('[data-constancia]').forEach((b) => b.addEventListener('click', () => imprimirConstancia(b.dataset.constancia)));
    }

    // ---------- Cuestionario en un diálogo ----------
    function dialogo() {
        let d = document.getElementById('dlg-cuestionario');
        if (!d) {
            d = document.createElement('dialog');
            d.id = 'dlg-cuestionario';
            d.className = 'dialogo-cuestionario';
            d.setAttribute('aria-labelledby', 'cue-titulo');
            document.body.appendChild(d);
            d.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar-cue]')) d.close(); });
        }
        return d;
    }
    async function abrirCuestionario(datos, boton) {
        boton.disabled = true;
        let q;
        try { q = await api('cuestionario', datos); } catch (e) { C.aviso(e.message); boton.disabled = false; return; }
        const d = dialogo();
        const titulo = C.CURSOS[datos.curso].modulos[datos.unidad - 1][0];
        d.innerHTML = `<form class="dialogo" method="dialog" novalidate>
            <button type="button" class="cerrar" data-cerrar-cue aria-label="Cerrar">×</button>
            <p class="eyebrow">Cuestionario · intento ${q.intento} de ${q.de}</p>
            <h2 id="cue-titulo" class="dialogo-titulo" style="font-size:1.5rem">${esc(titulo)}</h2>
            <p class="texto-suave">Elige una respuesta en cada pregunta. Se aprueba con ${q.nota_minima} de ${q.preguntas.length}.</p>
            ${q.preguntas.map((p, i) => `<fieldset class="pregunta"><legend><span class="pregunta-num">${i + 1}</span> ${esc(p.enunciado)}</legend>
                ${p.opciones.map((o, j) => `<label class="opcion"><input type="radio" name="p${i}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
            <p class="mensaje error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primario ancho">Enviar respuestas</button>
        </form>`;
        d.showModal();
        d.querySelector('input').focus();
        d.querySelector('form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const f = ev.currentTarget;
            const resp = q.preguntas.map((_, i) => { const x = f.querySelector(`input[name="p${i}"]:checked`); return x ? Number(x.value) : null; });
            const m = f.querySelector('.mensaje');
            if (resp.some((x) => x === null)) { m.textContent = `Te falta responder ${resp.filter((x) => x === null).length} pregunta(s).`; m.hidden = false; return; }
            const b = f.querySelector('button[type="submit"]');
            b.disabled = true; b.textContent = 'Calificando…';
            try {
                const r = await api('responder', { id: q.id, respuestas: resp });
                d.innerHTML = `<div class="dialogo resultado-cue">
                    <button type="button" class="cerrar" data-cerrar-cue aria-label="Cerrar">×</button>
                    <p class="resultado-nota ${r.aprobado ? 'aprobado' : 'no-aprobado'}">${r.nota}<small>/${r.de}</small></p>
                    <h2 id="cue-titulo" class="dialogo-titulo" style="font-size:1.6rem">${r.aprobado ? '¡Aprobaste!' : r.pausado ? 'Esta vez no fue' : 'Casi: tienes otro intento'}</h2>
                    <p>${r.aprobado ? (r.constancia ? '¡Terminaste los cuestionarios del curso! Si ya enviaste todas las evidencias, tu constancia está lista.' : 'Ahora envía la evidencia de esta unidad para abrir la siguiente.')
                        : r.pausado ? 'Usaste los dos intentos. Vuelve a ver el video y a repasar el material: el cuestionario se reabre solo.'
                        : 'Revisa las preguntas que fallaste antes de volver a intentarlo.'}</p>
                    ${r.detalle.some((x) => !x.bien) ? `<h3 style="font-size:1.1rem;margin-top:1rem">Para repasar</h3><ul class="retro">${r.detalle.map((x, i) => x.bien ? '' : `<li><b>Pregunta ${i + 1}:</b> ${esc(x.retro)}</li>`).join('')}</ul>` : ''}
                    <button type="button" class="btn btn-primario ancho" data-cerrar-cue>Volver a mis cursos</button>
                </div>`;
                d.querySelector('[data-cerrar-cue].btn').focus();
                await refrescar(r.progreso);
            } catch (e) { m.textContent = e.message; m.hidden = false; b.disabled = false; b.textContent = 'Enviar respuestas'; }
        });
        d.addEventListener('close', () => { boton.disabled = false; }, { once: true });
    }

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
            vista.innerHTML = '<p class="vista-intro" role="status">Cargando tus cursos…</p>';
            try { porCodigo = Object.fromEntries(((await C.traerVideos()) || []).filter((x) => x.audiencia === 'equipo').map((x) => [x.codigo, x])); } catch (e) { porCodigo = {}; }
            try { await refrescar(); } catch (e) { vista.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
        },
        async pintarEquipo(cont, contexto) { C = C ? { ...C, ...contexto } : contexto; await pintarEquipo(cont); },
        generarCodigo: (cedula, nombre, contexto, celular) => { C = C ? { ...C, ...contexto } : contexto; return generarCodigo(cedula, nombre, celular); },
    };
})();
