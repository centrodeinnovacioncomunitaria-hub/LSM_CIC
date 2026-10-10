// Comportamiento común a todas las páginas del portal: menú en celular, submenús y apariciones suaves.
(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    // Menú en celular: el ícono cambia a ✕ y un fondo oscurece la página mientras está abierto
    const menu = $('#menu-btn'), nav = $('#nav-publica');
    const ICONO_MENU = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const ICONO_CERRAR = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    function menuAbierto(abierto) {
        if (!menu || !nav) return;
        nav.classList.toggle('abierta', abierto);
        document.body.classList.toggle('menu-abierto', abierto);
        menu.setAttribute('aria-expanded', String(abierto));
        menu.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
        menu.innerHTML = abierto ? ICONO_CERRAR : ICONO_MENU;
    }
    if (menu && nav) menu.addEventListener('click', () => menuAbierto(!nav.classList.contains('abierta')));

    // Submenús: se abren con clic o teclado, se cierran con Escape, al hacer clic fuera o al elegir un enlace
    const botones = $$('.submenu-btn');
    const cerrar = (excepto) => botones.forEach((b) => {
        if (b === excepto) return;
        b.setAttribute('aria-expanded', 'false');
        document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    });
    botones.forEach((b) => {
        const lista = document.getElementById(b.getAttribute('aria-controls'));
        b.addEventListener('click', () => {
            const abrir = b.getAttribute('aria-expanded') !== 'true';
            cerrar(b);
            b.setAttribute('aria-expanded', String(abrir));
            lista.hidden = !abrir;
        });
        b.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); cerrar(b); b.setAttribute('aria-expanded', 'true'); lista.hidden = false; $('a', lista).focus(); }
        });
        lista.addEventListener('keydown', (e) => {
            const enlaces = $$('a', lista);
            const i = enlaces.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); enlaces[(i + 1) % enlaces.length].focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); enlaces[(i - 1 + enlaces.length) % enlaces.length].focus(); }
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const abierto = botones.find((b) => b.getAttribute('aria-expanded') === 'true');
        if (abierto) { cerrar(); abierto.focus(); return; }
        if (nav && nav.classList.contains('abierta')) { menuAbierto(false); menu.focus(); }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.submenu')) cerrar();
        // Elegir un enlace o tocar fuera del menú lo cierra
        if (e.target.closest('.nav a') || (nav && nav.classList.contains('abierta') && !e.target.closest('#nav-publica, #menu-btn'))) {
            cerrar();
            menuAbierto(false);
        }
    });

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cifras que cuentan al aparecer (desde el 60 % del valor, para no mostrar cifras sueltas como «1 años»): <b data-contar="200">200</b>
    function contar(el) {
        const meta = Number(el.dataset.contar);
        if (quieto || !meta) return;
        const inicio = performance.now(), dura = 1400;
        const final = meta.toLocaleString('es-CO');
        // Si el navegador pausa las animaciones (pestaña de fondo), el número igual termina en su valor real
        const tope = setTimeout(() => { el.textContent = final; }, dura + 250);
        const paso = () => {
            const p = Math.min(1, Math.max(0, (performance.now() - inicio) / dura));
            if (p >= 1) { clearTimeout(tope); el.textContent = final; return; }
            el.textContent = Math.round(meta * (.6 + .4 * (1 - Math.pow(1 - p, 3)))).toLocaleString('es-CO');
            requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    }

    // Apariciones suaves y escalonadas al desplazarse; el trazo firme se dibuja al aparecer
    $$('.rejilla, .linea, .obtienes, .temas, .cascada').forEach((grupo) => {
        $$(':scope > .aparece', grupo).forEach((el, i) => el.style.setProperty('--i', i % 6));
    });
    const obs = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        setTimeout(() => { e.target.style.transitionDelay = ''; }, 1800); // el retraso escalonado solo aplica al aparecer
        $$('[data-contar]', e.target).forEach(contar);
        if (e.target.matches('[data-contar]')) contar(e.target);
        obs.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px' }) : null;
    // Grupos que aparecen uno tras otro: cada hijo entra con un pequeño retraso
    $$('.escalonado').forEach((g) => [...g.children].forEach((h, i) => {
        if (!h.matches('.aparece, .aparece-izq, .aparece-der, .aparece-zoom')) h.classList.add('aparece');
        h.style.transitionDelay = `${Math.min(i, 8) * 90}ms`;
    }));
    // Fotos que se descubren al entrar en pantalla
    $$('.galeria-item, .bloque-foto').forEach((el) => el.classList.add('revela'));
    $$('.aparece, .aparece-izq, .aparece-der, .aparece-zoom, .revela, .trazo, [data-contar]').forEach((el) => (obs ? obs.observe(el) : el.classList.add('visible')));

    // Hojas flotantes: <div class="hojas-flotantes" data-hojas="7"></div>
    const COLORES = ['var(--menta)', 'var(--durazno)', 'var(--coral)', 'var(--mantequilla)', 'var(--lavanda)'];
    $$('[data-hojas]').forEach((caja, n) => {
        const total = Number(caja.dataset.hojas) || 6;
        let semilla = n * 97 + 13;
        const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
        for (let i = 0; i < total; i++) {
            const h = document.createElement('span');
            h.style.cssText = `left:${(4 + azar() * 90).toFixed(1)}%;top:${(6 + azar() * 80).toFixed(1)}%;--t:${(.7 + azar() * 1.1).toFixed(2)}rem;--c:${caja.dataset.color || COLORES[i % COLORES.length]};--g:${Math.round(azar() * 360)}deg;--d:${(11 + azar() * 9).toFixed(1)}s;--r:-${(azar() * 10).toFixed(1)}s`;
            caja.appendChild(h);
        }
    });

    // Fotos con un desplazamiento leve al bajar (solo con mouse y si se permite el movimiento)
    const fotos = $$('.hoja, .hoja-inv').filter((f) => f.querySelector('img'));
    if (!quieto && fotos.length && window.matchMedia('(pointer: fine)').matches) {
        fotos.forEach((f) => f.classList.add('paralaje'));
        let pendiente = false;
        const mover = () => {
            pendiente = false;
            const alto = innerHeight;
            fotos.forEach((f) => {
                const r = f.getBoundingClientRect();
                if (r.bottom < 0 || r.top > alto) return;
                const centro = (r.top + r.height / 2 - alto / 2) / alto;
                f.style.setProperty('--desfase', `${(centro * -18).toFixed(1)}px`);
            });
        };
        addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(mover); } }, { passive: true });
        mover();
    }

    // Chispa al hacer clic: un aro y pétalos de un color distinto al del elemento tocado
    if (!quieto) {
        const colorPara = (el) => {
            if (!el) return ['var(--coral)', 'var(--menta)'];
            if (el.matches('.btn-primario, .bg-coral, .bg-durazno')) return ['var(--mantequilla)', 'var(--menta)'];
            if (el.matches('.btn-bosque, .btn-claro, .cta-banda *, .territorio *')) return ['var(--durazno)', 'var(--mantequilla)'];
            if (el.matches('.bg-menta, .bg-agua')) return ['var(--coral)', 'var(--durazno)'];
            return ['var(--coral)', 'var(--menta)'];
        };
        document.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const blanco = e.target.closest('a, button, summary, label, .tema, .otra-ruta');
            if (!blanco) return;
            const [c1, c2] = colorPara(blanco);
            const aro = document.createElement('span');
            aro.className = 'chispa';
            aro.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--c:${c1}`;
            document.body.appendChild(aro);
            for (let i = 0; i < 6; i++) {
                const p = document.createElement('span');
                const ang = (Math.PI * 2 * i) / 6 + Math.random() * .5;
                const dist = 22 + Math.random() * 14;
                p.className = 'petalo';
                p.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--c:${i % 2 ? c1 : c2};--x:${(Math.cos(ang) * dist).toFixed(1)}px;--y:${(Math.sin(ang) * dist).toFixed(1)}px;--g:${Math.round(ang * 57)}deg`;
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 800);
            }
            setTimeout(() => aro.remove(), 650);
        });
    }
    // Mapa de satélites: al tocar un satélite (en la lista o en el mapa) se resalta su línea y se muestra su ficha
    $$('.mapa-cic').forEach((m) => {
        const info = $('.satelite-info', m);
        const activar = (id) => {
            $$('[data-sat]', m).forEach((el) => el.classList.toggle('activo', el.dataset.sat === id));
            $$('.satelite-btn', m).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sat === id)));
            const b = $(`.satelite-btn[data-sat="${id}"]`, m);
            if (!b || !info) return;
            info.replaceChildren(...[
                ['b', b.dataset.nombre],
                ['span', `${b.dataset.depto} · ${b.dataset.municipios}`],
                ['span', '3 dinamizadoras: acompañamiento, acceso a mercados y financiamiento, acompañadas por la Secretaría Técnica.'],
            ].map(([tag, texto]) => { const e = document.createElement(tag); e.textContent = texto; return e; }));
        };
        m.addEventListener('click', (e) => { const t = e.target.closest('[data-sat]'); if (t) activar(t.dataset.sat); });
        $$('.satelite-btn, .mapa-pin', m).forEach((el) => el.addEventListener('mouseenter', () => activar(el.dataset.sat)));
    });

    // Barra de avance de lectura: muestra cuánto falta de la página
    const barra = document.createElement('div');
    barra.className = 'barra-progreso';
    barra.setAttribute('aria-hidden', 'true');
    document.body.prepend(barra);
    let pendiente = false;
    const avance = () => {
        pendiente = false;
        const total = document.documentElement.scrollHeight - innerHeight;
        barra.style.transform = `scaleX(${total > 0 ? Math.min(1, scrollY / total) : 0})`;
    };
    addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(avance); } }, { passive: true });
    avance();

    // Carruseles con botones anterior / siguiente
    $$('[data-carrusel]').forEach((c) => {
        const pista = document.getElementById(`carrusel-${c.dataset.carrusel}`);
        if (!pista) return;
        $$('.carrusel-btn', c).forEach((b) => b.addEventListener('click', () => {
            const paso = (pista.firstElementChild?.offsetWidth || 240) + 16;
            pista.scrollBy({ left: Number(b.dataset.dir) * paso, behavior: 'smooth' });
        }));
    });

    // «En esta página»: resalta la sección que se está leyendo
    $$('.subnav-fija').forEach((nav) => {
        const lista = $('ol', nav);
        const enlaces = $$('a[href^="#"]', nav);
        const secciones = enlaces.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
        if (!('IntersectionObserver' in window) || !secciones.length) return;
        const vistas = new Set();
        const io = new IntersectionObserver((es) => {
            es.forEach((e) => (e.isIntersecting ? vistas.add(e.target.id) : vistas.delete(e.target.id)));
            const actual = secciones.find((s) => vistas.has(s.id));
            enlaces.forEach((a) => {
                const si = !!actual && a.getAttribute('href') === `#${actual.id}`;
                a.classList.toggle('activo', si);
                if (si && lista) lista.scrollLeft = a.offsetLeft - 16;
            });
        }, { rootMargin: '-35% 0px -55% 0px' });
        secciones.forEach((s) => io.observe(s));
    });
})();
