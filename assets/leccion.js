// Lecciones: las respuestas de la emprendedora se guardan solo en su dispositivo.
(() => {
    'use strict';
    const leccion = document.body.dataset.leccion;
    const clave = `cic-respuestas-${leccion}`;
    const campos = [...document.querySelectorAll('[data-guardar]')];
    const estado = document.getElementById('estado-respuestas');
    let datos = {};
    try { datos = JSON.parse(localStorage.getItem(clave)) || {}; } catch (e) { datos = {}; }
    campos.forEach((c) => { if (datos[c.id]) c.value = datos[c.id]; });
    const contar = () => campos.filter((c) => c.value.trim()).length;
    const pintar = (texto) => { if (estado) estado.textContent = texto || `${contar()} de ${campos.length} espacios con respuesta · se guardan solo en este dispositivo`; };
    let temporizador;
    campos.forEach((c) => c.addEventListener('input', () => {
        datos[c.id] = c.value;
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            try { localStorage.setItem(clave, JSON.stringify(datos)); pintar(); } catch (e) { pintar('No se pudieron guardar tus respuestas en este navegador.'); }
        }, 400);
    }));
    const borrar = document.getElementById('borrar-respuestas');
    if (borrar) borrar.addEventListener('click', () => {
        if (!confirm('¿Borrar todas tus respuestas de esta lección en este dispositivo?')) return;
        datos = {};
        campos.forEach((c) => { c.value = ''; });
        try { localStorage.removeItem(clave); } catch (e) { /* sin almacenamiento */ }
        pintar();
    });
    const imprimir = document.getElementById('imprimir-leccion');
    if (imprimir) imprimir.addEventListener('click', () => window.print());
    pintar();
})();
