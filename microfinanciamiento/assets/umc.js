// Unidades de Microfinanciamiento Comunitario: comparador, ciclo, jornadas y semáforo de usura.
(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const pesos = (n) => '$' + Math.round(n).toLocaleString('es-CO');
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Rellena la parte recorrida de los deslizadores
    const pintarRango = (r) => r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);

    // 01 · Costo del crédito: gota a gota frente a una UMC (interés simple, ilustrativo)
    const monto = $('#cmp-monto'), meses = $('#cmp-meses');
    if (monto && meses) {
        const GOTA = 0.20, UMC = 0.01, FONDO = 0.01;
        const comparar = () => {
            const m = Number(monto.value), n = Number(meses.value);
            const gota = m * GOTA * n;
            const umc = m * UMC * n + m * FONDO;
            $('#cmp-monto-txt').textContent = pesos(m);
            $('#cmp-meses-txt').textContent = `${n} ${n === 1 ? 'mes' : 'meses'}`;
            $('#cmp-gota').textContent = pesos(gota);
            $('#cmp-umc').textContent = pesos(umc);
            $('#cmp-barra-gota').style.width = '100%';
            $('#cmp-barra-umc').style.width = `${(umc / gota) * 100}%`;
            $('#cmp-veces').textContent = `${Math.round(gota / umc)}`;
            [monto, meses].forEach(pintarRango);
        };
        [monto, meses].forEach((r) => r.addEventListener('input', comparar));
        comparar();
        // Las barras crecen al aparecer en pantalla
        if ('IntersectionObserver' in window && !quieto) {
            $$('.cmp-barra span').forEach((b) => { b.style.width = '0'; });
            const io = new IntersectionObserver((es) => {
                if (!es.some((e) => e.isIntersecting)) return;
                setTimeout(comparar, 250);
                io.disconnect();
            }, { threshold: .4 });
            io.observe($('.comparador-filas'));
        }
    }

    // 03 · Ciclo: los pasos avanzan solos hasta que la persona elige uno
    $$('[data-ciclo]').forEach((c) => {
        const botones = $$('.ciclo-paso', c), nodos = $$('.ciclo-nodo', c);
        let actual = 0, reloj = null;
        const activar = (i) => {
            actual = i;
            botones.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
            nodos.forEach((n, j) => n.classList.toggle('activo', j === i));
        };
        const parar = () => { clearInterval(reloj); reloj = null; };
        botones.forEach((b, i) => b.addEventListener('click', () => { parar(); activar(i); }));
        nodos.forEach((n, i) => n.addEventListener('click', () => { parar(); activar(i); }));
        activar(0);
        if (quieto || !('IntersectionObserver' in window)) return;
        new IntersectionObserver(([e]) => {
            if (e.isIntersecting && reloj === null && !c.dataset.elegido) reloj = setInterval(() => activar((actual + 1) % botones.length), 3200);
            if (!e.isIntersecting) parar();
        }, { threshold: .35 }).observe(c);
        c.addEventListener('click', () => { c.dataset.elegido = '1'; });
    });

    // 04 · Pestañas de las jornadas (con flechas del teclado)
    const tabs = $$('.jornada-tab');
    const elegir = (t, foco) => {
        tabs.forEach((x) => {
            const si = x === t;
            x.setAttribute('aria-selected', String(si));
            x.tabIndex = si ? 0 : -1;
            document.getElementById(x.getAttribute('aria-controls')).hidden = !si;
        });
        if (foco) t.focus();
    };
    tabs.forEach((t, i) => {
        t.addEventListener('click', () => elegir(t));
        t.addEventListener('keydown', (e) => {
            const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
            if (d) { e.preventDefault(); elegir(tabs[(i + d + tabs.length) % tabs.length], true); }
            if (e.key === 'Home') { e.preventDefault(); elegir(tabs[0], true); }
            if (e.key === 'End') { e.preventDefault(); elegir(tabs[tabs.length - 1], true); }
        });
    });

    // 06 · Semáforo de usura: interés anticipado + aporte al fondo, cuotas iguales solo a capital
    const sem = $('#semaforo');
    if (sem) {
        // Valores de referencia acordados con Emprende Ahora: 1 % mensual anticipado + 1 % al fondo de emergencias
        const USURA = 29.24, INFLACION = 6.24, FONDO = 0.01, ESCALA = 50;
        const campoMonto = $('#sem-monto'), campoMeses = $('#sem-meses'), campoTasa = $('#sem-tasa');
        let porAño = 12;
        const leerMonto = () => Number(String(campoMonto.value).replace(/\D/g, '')) || 0;
        // Tasa por periodo que iguala lo recibido con las cuotas (bisección)
        const tasaPeriodo = (recibido, cuota, k) => {
            let a = 0, b = 1;
            const vp = (i) => { let s = 0; for (let t = 1; t <= k; t++) s += cuota / Math.pow(1 + i, t); return s; };
            for (let n = 0; n < 80; n++) { const m = (a + b) / 2; if (vp(m) > recibido) a = m; else b = m; }
            return (a + b) / 2;
        };
        const calcular = () => {
            const M = leerMonto();
            const n = Math.min(6, Math.max(1, Math.round(Number(campoMeses.value) || 1)));
            const r = Math.min(5, Math.max(0.25, Number(campoTasa.value) || 1)) / 100;
            const k = n * (porAño / 12);
            const interes = M * r * n, fondo = M * FONDO, entregado = M - interes - fondo, cuota = M / k;
            const ea = M > 0 ? (Math.pow(1 + tasaPeriodo(entregado, cuota, k), porAño) - 1) * 100 : 0;
            const estado = ea > USURA ? 'rojo' : ea < INFLACION ? 'amarillo' : 'verde';
            const res = $('.semaforo-res', sem);
            res.dataset.estado = estado;
            $('#sem-estado').textContent = {
                verde: 'En verde: se puede desembolsar',
                amarillo: 'En amarillo: la plata pierde valor frente a la inflación',
                rojo: 'En rojo: supera la usura, no se desembolsa',
            }[estado];
            $('#sem-ea').textContent = `${ea.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
            $('#sem-marca').style.left = `${Math.min(100, (ea / ESCALA) * 100)}%`;
            $('#sem-int').textContent = pesos(interes);
            $('#sem-fondo').textContent = pesos(fondo);
            $('#sem-entregado').textContent = pesos(entregado);
            $('#sem-cuotas').textContent = `${k} de ${pesos(cuota)}`;
        };
        campoMonto.addEventListener('input', () => {
            const v = leerMonto();
            campoMonto.value = v ? v.toLocaleString('es-CO') : '';
            calcular();
        });
        [campoMeses, campoTasa].forEach((c) => c.addEventListener('input', calcular));
        $$('[data-paso-campo]', sem).forEach((g) => {
            const campo = document.getElementById(g.dataset.pasoCampo);
            $$('button', g).forEach((b) => b.addEventListener('click', () => {
                const v = Number(campo.value) + Number(b.dataset.d);
                campo.value = String(Math.min(Number(campo.max), Math.max(Number(campo.min), Math.round(v * 100) / 100)));
                calcular();
            }));
        });
        $$('[data-frec]', sem).forEach((b) => b.addEventListener('click', () => {
            porAño = Number(b.dataset.frec);
            $$('[data-frec]', sem).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            calcular();
        }));
        calcular();
    }
})();
