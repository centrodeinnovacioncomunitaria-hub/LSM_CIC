// 09 · Biblioteca de documentos con visor de solo lectura.
// PDF.js dibuja cada página como imagen en un lienzo: no hay botón de descarga ni de impresión.
(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const DOCS = [
        { id: 'documento-tecnico', grupo: 'principal', titulo: 'Documento técnico y metodológico de las UMC', desc: 'El modelo completo: antecedentes, reglas, ruta formativa y seguimiento.', archivo: 'documento-tecnico-umc.pdf', pags: 30 },
        { id: 'anexo-a', grupo: 'anexos', letra: 'A', titulo: 'Plantilla de estatutos y ruta de formalización', desc: 'Estatutos de la UMC como acuerdo privado y pasos para formalizarse.', archivo: 'anexo-a-estatutos.pdf', pags: 6 },
        { id: 'anexo-b', grupo: 'anexos', letra: 'B', titulo: 'Modelo de reglamento interno', desc: 'Reglamento para llenar con lo votado en la Jornada 2.', archivo: 'anexo-b-reglamento.pdf', pags: 3 },
        { id: 'anexo-c', grupo: 'anexos', letra: 'C', titulo: 'Infografías de la UMC', desc: 'Cinco piezas de una página para compartir.', archivo: 'anexo-c-infografias.pdf', pags: 5 },
        { id: 'presentacion', grupo: 'anexos', letra: 'P', titulo: 'Presentación · Acceso a financiamiento', desc: 'Diapositivas del pilar de acceso a financiamiento del CIC.', archivo: 'presentacion-acceso-financiamiento.pdf', pags: 12 },
        { id: 'j1-guia', grupo: 'j1', titulo: 'Ficha técnica y guía metodológica', desc: 'Paso a paso de la Jornada 1 · Presentación.', archivo: 'jornada1-guia.pdf', pags: 21 },
        { id: 'j1-kit', grupo: 'j1', titulo: 'Kit de material didáctico', desc: 'Tarjetas, casos y fichas de intención.', archivo: 'jornada1-kit.pdf', pags: 23 },
        { id: 'j2-guia', grupo: 'j2', titulo: 'Ficha técnica y guía metodológica', desc: 'Paso a paso de la Jornada 2 · Gobernanza.', archivo: 'jornada2-guia.pdf', pags: 24 },
        { id: 'j2-kit', grupo: 'j2', titulo: 'Kit de material didáctico', desc: 'Material para construir y votar las reglas.', archivo: 'jornada2-kit.pdf', pags: 14 },
        { id: 'j2-acuerdos', grupo: 'j2', titulo: 'Ficha de acuerdos', desc: 'Formato de la relatora para registrar las reglas votadas.', archivo: 'jornada2-ficha-acuerdos.pdf', pags: 6 },
        { id: 'j3-guia', grupo: 'j3', titulo: 'Ficha técnica y guía metodológica', desc: 'Paso a paso de la Jornada 3 · Apropiación.', archivo: 'jornada3-guia.pdf', pags: 17 },
        { id: 'j3-kit', grupo: 'j3', titulo: 'Kit de material didáctico', desc: 'Retos de roles y material para la elección.', archivo: 'jornada3-kit.pdf', pags: 26 },
        { id: 'j3-manual', grupo: 'j3', titulo: 'Manual de funciones y formatos', desc: 'Fichas de rol, guion de reunión, actas e informes.', archivo: 'jornada3-manual-funciones.pdf', pags: 13 },
        { id: 'j4-guia', grupo: 'j4', titulo: 'Ficha técnica y guía metodológica', desc: 'Paso a paso de la Jornada 4 · Activación.', archivo: 'jornada4-guia.pdf', pags: 18 },
        { id: 'j4-kit', grupo: 'j4', titulo: 'Kit de material didáctico', desc: 'Comprobantes, solicitudes, planes de pago y arqueo.', archivo: 'jornada4-kit.pdf', pags: 20 },
        { id: 'j4-acta', grupo: 'j4', titulo: 'Acta de constitución y anexos', desc: 'Acta, reglamento, junta y capitalización inicial.', archivo: 'jornada4-acta-constitucion.pdf', pags: 9 },
        { id: 'j4-libro', grupo: 'j4', titulo: 'Libro digital de la UMC', desc: 'Vista de las hojas: socias, caja, créditos y semáforo.', archivo: 'jornada4-libro-digital.pdf', pags: 27 },
    ];
    const GRUPOS = {
        principal: { nombre: 'Documento principal', color: 'var(--menta)' },
        anexos: { nombre: 'Anexos', color: 'var(--lavanda)' },
        j1: { nombre: 'Jornada 1 · Presentación', color: 'var(--menta)' },
        j2: { nombre: 'Jornada 2 · Gobernanza', color: 'var(--durazno)' },
        j3: { nombre: 'Jornada 3 · Apropiación', color: 'var(--coral)' },
        j4: { nombre: 'Jornada 4 · Activación', color: 'var(--mantequilla)' },
    };
    const lista = $('#bib-lista');
    if (!lista) return;

    // Listado
    const enLista = DOCS.filter((d) => d.grupo !== 'principal');
    lista.innerHTML = enLista.map((d) => `
        <li data-grupo="${d.grupo}" style="--c:${GRUPOS[d.grupo].color}">
            <button type="button" class="bib-doc" data-ver="${d.id}">
                <span class="bib-icono" aria-hidden="true">${d.letra || d.grupo.slice(1)}</span>
                <span class="bib-texto"><small>${GRUPOS[d.grupo].nombre}</small><b>${d.titulo}</b><span>${d.desc}</span></span>
                <span class="bib-meta"><span>${d.pags} pág.</span><span class="bib-ver"><svg class="ic-ojo" width="16" height="16" aria-hidden="true"><use href="#i-ojo"/></svg><svg class="ic-candado" width="16" height="16" aria-hidden="true"><use href="#i-candado"/></svg>Ver</span></span>
            </button>
        </li>`).join('');
    const filtros = $$('.bib-filtro');
    filtros.forEach((f) => {
        const n = f.dataset.filtro === 'todos' ? enLista.length : enLista.filter((d) => d.grupo === f.dataset.filtro).length;
        $('small', f).textContent = n;
    });
    const filtrar = (g) => {
        filtros.forEach((f) => f.setAttribute('aria-pressed', String(f.dataset.filtro === g)));
        let i = 0;
        $$('li', lista).forEach((li) => {
            const si = g === 'todos' || li.dataset.grupo === g;
            li.hidden = !si;
            if (!si) return;
            li.classList.remove('entra'); void li.offsetWidth;
            li.style.animationDelay = `${Math.min(i++, 8) * 40}ms`;
            li.classList.add('entra');
        });
    };
    filtros.forEach((f) => f.addEventListener('click', () => filtrar(f.dataset.filtro)));
    // Desde las jornadas: lleva a la biblioteca ya filtrada
    $$('[data-ir-filtro]').forEach((b) => b.addEventListener('click', () => {
        filtrar(b.dataset.irFiltro);
        $('.biblioteca').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    // Visor
    const visor = $('#visor'), cuerpo = $('#visor-cuerpo'), cargando = $('#visor-cargando'), pag = $('#visor-pag');
    const aviso = (t) => { cargando.hidden = false; cargando.lastChild.textContent = t; };
    const lib = window.pdfjsLib;
    if (lib) lib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
    let pdf = null, escala = 1, observador = null, turno = 0;
    const anchoBase = () => {
        const cs = getComputedStyle(cuerpo);
        const util = cuerpo.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return Math.min(util, 900) * escala;
    };

    const pintar = async (lienzo, n, t) => {
        const p = await pdf.getPage(n);
        if (t !== turno) return;
        const base = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: anchoBase() / base.width });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        lienzo.width = Math.floor(vp.width * dpr); lienzo.height = Math.floor(vp.height * dpr);
        lienzo.style.width = `${Math.floor(vp.width)}px`; lienzo.style.height = `${Math.floor(vp.height)}px`;
        await p.render({ canvasContext: lienzo.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
        lienzo.parentElement.classList.add('lista');
        lienzo.dataset.listo = '1';
    };
    const montar = async () => {
        const t = ++turno;
        observador?.disconnect();
        $$('.visor-hoja', cuerpo).forEach((h) => h.remove());
        const p1 = await pdf.getPage(1);
        if (t !== turno) return;
        const base = p1.getViewport({ scale: 1 });
        const ancho = anchoBase();
        const hojas = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const h = document.createElement('div');
            h.className = 'visor-hoja'; h.dataset.n = n;
            h.style.width = `${Math.floor(ancho)}px`; h.style.minHeight = `${Math.floor(ancho * (base.height / base.width))}px`;
            const c = document.createElement('canvas');
            c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Página ${n} de ${pdf.numPages}`);
            h.appendChild(c); cuerpo.appendChild(h); hojas.push(h);
        }
        observador = new IntersectionObserver((es) => es.forEach((e) => {
            if (!e.isIntersecting) return;
            const c = $('canvas', e.target);
            if (!c.dataset.listo && !c.dataset.pidiendo) {
                c.dataset.pidiendo = '1';
                pintar(c, Number(e.target.dataset.n), t).catch(() => {}).finally(() => delete c.dataset.pidiendo);
            }
        }), { root: cuerpo, rootMargin: '800px 0px' });
        hojas.forEach((h) => observador.observe(h));
        pag.textContent = `1 / ${pdf.numPages}`;
    };
    // Número de página según lo que se está leyendo
    cuerpo?.addEventListener('scroll', () => {
        if (!pdf) return;
        const medio = cuerpo.scrollTop + cuerpo.clientHeight / 3;
        const h = $$('.visor-hoja', cuerpo).find((x) => x.offsetTop + x.offsetHeight > medio);
        if (h) pag.textContent = `${h.dataset.n} / ${pdf.numPages}`;
    }, { passive: true });

    const abrir = async (id) => {
        const d = DOCS.find((x) => x.id === id);
        if (!d || !visor) return;
        $('#visor-titulo').textContent = d.titulo;
        $('#visor-grupo').textContent = GRUPOS[d.grupo].nombre;
        pag.textContent = '';
        escala = 1;
        turno++;
        $$('.visor-hoja', cuerpo).forEach((h) => h.remove());
        aviso('Abriendo el documento…');
        if (!visor.open) visor.showModal();
        cuerpo.scrollTop = 0;
        document.body.classList.add('visor-abierto');
        if (!lib) { aviso('No se pudo cargar el visor. Verifique la conexión a internet.'); return; }
        try {
            if (pdf) { pdf.destroy(); pdf = null; }
            const tarea = lib.getDocument({ url: `assets/docs/${d.archivo}`, isEvalSupported: false });
            const doc = await tarea.promise;
            if (!visor.open) { doc.destroy(); return; }
            pdf = doc;
            cargando.hidden = true;
            await montar();
        } catch (err) {
            aviso('No se pudo abrir el documento.');
        }
    };
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ver]');
        if (!b) return;
        e.preventDefault();
        // Los materiales se habilitan después del cuestionario de acceso
        const acceso = window.UMCAcceso;
        if (acceso && !acceso.listo()) acceso.pedir(() => abrir(b.dataset.ver));
        else abrir(b.dataset.ver);
    });
    if (!visor) return;
    const cerrar = () => visor.close();
    $('.visor-cerrar', visor).addEventListener('click', cerrar);
    visor.addEventListener('close', () => {
        document.body.classList.remove('visor-abierto');
        turno++; observador?.disconnect();
        $$('.visor-hoja', cuerpo).forEach((h) => h.remove());
        if (pdf) { pdf.destroy(); pdf = null; }
    });
    visor.addEventListener('click', (e) => { if (e.target === visor) cerrar(); });
    $$('[data-zoom]', visor).forEach((b) => b.addEventListener('click', () => {
        const antes = escala;
        escala = Math.min(2.5, Math.max(.6, escala + Number(b.dataset.zoom) * .25));
        if (pdf && escala !== antes) {
            const rel = cuerpo.scrollTop / Math.max(1, cuerpo.scrollHeight);
            montar().then(() => { cuerpo.scrollTop = rel * cuerpo.scrollHeight; });
        }
    }));
    // Solo lectura: sin menú contextual, sin arrastrar y sin Ctrl+S / Ctrl+P mientras el visor está abierto
    visor.addEventListener('contextmenu', (e) => e.preventDefault());
    visor.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if (visor.open && (e.ctrlKey || e.metaKey) && ['s', 'p'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    let espera;
    addEventListener('resize', () => {
        if (!visor.open || !pdf) return;
        clearTimeout(espera); espera = setTimeout(montar, 250);
    });
})();

// CTA flotante: la burbuja aparece sola y se puede ocultar
(() => {
    'use strict';
    const f = document.getElementById('flotante');
    if (!f) return;
    const burbuja = document.getElementById('flotante-burbuja');
    let oculta = false;
    try { oculta = sessionStorage.getItem('umc-burbuja') === 'no'; } catch (e) { /* sin almacenamiento */ }
    if (!oculta) setTimeout(() => f.classList.add('con-burbuja'), 2500);
    burbuja.querySelector('.flotante-x').addEventListener('click', () => {
        f.classList.remove('con-burbuja');
        try { sessionStorage.setItem('umc-burbuja', 'no'); } catch (e) { /* sin almacenamiento */ }
    });
    // Al pasar por encima del botón la burbuja se asoma aunque se haya ocultado
    const btn = f.querySelector('.flotante-btn');
    btn.addEventListener('mouseenter', () => f.classList.add('asoma'));
    btn.addEventListener('focus', () => f.classList.add('asoma'));
    f.addEventListener('mouseleave', () => f.classList.remove('asoma'));
    btn.addEventListener('blur', () => f.classList.remove('asoma'));
})();
