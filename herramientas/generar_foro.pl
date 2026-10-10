#!/usr/bin/perl
# Genera foro/index.html: el foro de la comunidad del CIC (equipo y emprendedoras con cuenta).
# Las conversaciones viven en Firebase y las trae assets/foro.js; esta página es solo el marco.
# Uso (desde la carpeta LSM_CIC): perl herramientas/generar_foro.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(simbolos nav pie cabeza cuerpo_inicio final_pagina escribir attr);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';
my $P = '../';
my $html = cabeza(P => $P, noindex => 1, titulo => 'Foro de la comunidad · CIC', desc => 'Conversaciones entre emprendedoras, dinamizadoras y la Secretaría Técnica del Centro de Innovación Comunitaria.', url => "$BASE/foro/", og => 'Foro de la comunidad · Centro de Innovación Comunitaria')
  . cuerpo_inicio($P, 'foro') . <<"HTML";

    <main id="contenido" class="pagina-ruta pagina-foro">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol><li><a href="$P">Inicio</a></li><li><span aria-current="page">Foro</span></li></ol>
        </nav>
        <div class="contenedor">
            <section class="foro-heroe" aria-labelledby="titulo-foro">
                <div class="patron-hojas animado" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                <div class="foro-heroe-texto">
                    <p class="eyebrow eyebrow-claro">Comunidad CIC</p>
                    <h1 id="titulo-foro">Foro de la comunidad</h1>
                    <p class="lead">Pregunta, comparte lo que te funcionó y aprende de otras emprendedoras, de las dinamizadoras y de la Secretaría Técnica.</p>
                </div>
                <ul class="foro-normas lista-limpia" aria-label="Normas del foro">
                    <li><span aria-hidden="true">♥</span> Con respeto y sin juicios</li>
                    <li><span aria-hidden="true">🔒</span> No publiques cédulas, teléfonos ni datos de otras personas</li>
                    <li><span aria-hidden="true">✿</span> La Secretaría Técnica modera las conversaciones</li>
                </ul>
            </section>
        </div>

        <section class="bloque" aria-label="Conversaciones">
            <div class="contenedor">
                <div id="foro-app" aria-live="polite"><p class="vista-intro" role="status">Cargando el foro…</p></div>
            </div>
        </section>
    </main>
HTML
$html .= final_pagina($P);
$html =~ s{(\s*</body>)}{\n    <script src="${P}config.js?v=20261028"></script>\n    <script src="${P}assets/foro.js?v=20261028"></script>$1};
escribir('foro/index.html', $html);
print "foro/index.html\n";
