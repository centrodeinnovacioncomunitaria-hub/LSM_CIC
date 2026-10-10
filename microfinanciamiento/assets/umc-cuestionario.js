// Cuestionario de acceso a los materiales: identificación + 5 preguntas.
// Al completarlo se habilitan los documentos de la sección 09. Expone window.UMCAcceso para umc-docs.js.
(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const CLAVE = 'umc-cuestionario-v1';
    const dialogo = $('#cuestionario'), form = $('#cq-form');
    if (!dialogo || !form) return;

    const etapas = $$('.cq-etapa', form);
    const PREGUNTAS = 5, FIN = etapas.length - 1;
    const atras = $('[data-cq-atras]', form), siguiente = $('[data-cq-siguiente]', form);
    const error = $('#cq-error'), progreso = $('#cq-progreso'), paso = $('#cq-paso');
    let actual = 0, pendiente = null, enMemoria = null;

    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return enMemoria; } };
    const guardar = (datos) => { enMemoria = datos; try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* sin almacenamiento */ } };
    const listo = () => !!leer();

    const pintarAcceso = () => {
        const a = $('#acceso');
        if (a) a.dataset.estado = listo() ? 'listo' : 'pendiente';
        $$('[data-cuestionario]').forEach((b) => { b.hidden = listo(); });
        document.body.classList.toggle('materiales-habilitados', listo());
    };

    const mostrar = (n) => {
        actual = n;
        etapas.forEach((e, i) => { e.hidden = i !== n; });
        error.hidden = true;
        atras.hidden = n === 0 || n === FIN;
        siguiente.textContent = n === 0 ? 'Empezar' : n === PREGUNTAS ? 'Enviar respuestas' : n === FIN ? (pendiente ? 'Ver el documento' : 'Ir a los materiales') : 'Siguiente';
        paso.textContent = n === 0 ? 'Antes de empezar' : n === FIN ? 'Listo' : `Pregunta ${n} de ${PREGUNTAS}`;
        progreso.style.width = `${(Math.min(n, PREGUNTAS) / PREGUNTAS) * 100}%`;
        const foco = $('input, select, textarea', etapas[n]);
        if (foco && n !== FIN) setTimeout(() => foco.focus(), 60);
    };

    const fallar = (t) => { error.textContent = t; error.hidden = false; };
    const valido = (n) => {
        const e = etapas[n];
        if (n === 0) {
            if (!form.nombre.value.trim()) return fallar('Escribir el nombre y apellido.'), false;
            if (!form.satelite.value) return fallar('Seleccionar el satélite.'), false;
            if (!form.inscrita.checked) return fallar('El cuestionario es para emprendedoras inscritas en el CIC y vinculadas a un satélite.'), false;
            if (!form.autoriza.checked) return fallar('Se necesita la autorización de tratamiento de datos para continuar.'), false;
            return true;
        }
        if (n >= 1 && n <= PREGUNTAS && !$('input:checked', e)) return fallar('Elegir al menos una opción.'), false;
        return true;
    };

    // Preguntas de opción múltiple: máximo de opciones
    $$('.cq-opciones[data-max]', form).forEach((g) => g.addEventListener('change', () => {
        const max = Number(g.dataset.max);
        const marcadas = $$('input:checked', g).length;
        $$('input', g).forEach((i) => { i.disabled = !i.checked && marcadas >= max; });
    }));

    const respuestas = () => {
        const d = new FormData(form);
        return {
            fecha: new Date().toISOString(),
            nombre: (d.get('nombre') || '').trim(),
            satelite: d.get('satelite'),
            expectativas: d.getAll('expectativas').join(' | '),
            aprendizaje: d.getAll('aprendizaje').join(' | '),
            tiempo: d.get('tiempo'),
            percepcion: d.get('percepcion'),
            comentario: (d.get('comentario') || '').trim(),
            inversion: d.get('inversion'),
            autoriza: d.get('autoriza') === 'si',
        };
    };

    const enviar = (datos) => {
        const url = window.UMC_CONFIG && window.UMC_CONFIG.cuestionarioUrl;
        if (!url) return Promise.resolve();
        // Google Apps Script no responde CORS: se envía como texto y no se lee la respuesta
        return fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(datos) }).catch(() => {});
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (actual === FIN) { cerrar(true); return; }
        if (!valido(actual)) return;
        if (actual === PREGUNTAS) {
            siguiente.disabled = true; siguiente.textContent = 'Enviando…';
            const datos = respuestas();
            await enviar(datos);
            guardar({ fecha: datos.fecha, satelite: datos.satelite });
            siguiente.disabled = false;
            pintarAcceso();
        }
        mostrar(actual + 1);
    });
    atras.addEventListener('click', () => mostrar(Math.max(0, actual - 1)));

    const cerrar = (abrirPendiente) => {
        const cb = pendiente; pendiente = null;
        dialogo.close();
        if (abrirPendiente && listo()) {
            if (cb) cb();
            else $('.biblioteca')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    $('[data-cq-cerrar]', form).addEventListener('click', () => cerrar(false));
    dialogo.addEventListener('close', () => document.body.classList.remove('visor-abierto'));

    const abrir = (cb) => {
        pendiente = cb || null;
        mostrar(listo() ? FIN : 0);
        if (!dialogo.open) dialogo.showModal();
        document.body.classList.add('visor-abierto');
    };
    $$('[data-cuestionario]').forEach((b) => b.addEventListener('click', () => abrir()));

    window.UMCAcceso = { listo, pedir: abrir };
    pintarAcceso();
})();
