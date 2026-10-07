#!/usr/bin/perl
# Genera la página institucional «El CIC» (el-cic/): qué es, cómo funciona, el mapa de los 8 satélites,
# los pilares y el ciclo. Los datos oficiales salen de los documentos 6.5 (Modelo Metodológico) y 6.4
# (procesos formativos) de la Red de Mujeres del Caribe; satélites y pilares, de herramientas/Datos.pm.
# Las direcciones anteriores (como-funciona, implementacion, formacion, glosario) redirigen a sus secciones.
# Uso (desde la carpeta LSM_CIC): perl herramientas/generar_el_cic.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(cabeza cuerpo_inicio final_pagina escribir attr);
use Datos qw(bloque_mapa pilares_lista);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';
my $P = '../';
my $url = "$BASE/el-cic/";
my $desc = 'Qué es el Centro de Innovación Comunitaria, cómo funciona desde la Secretaría Técnica hasta sus 8 satélites en el Caribe colombiano y cuáles son sus pilares.';

my $pilares = pilares_lista();

my $jsonld = <<"JSON";
    {
      "\@context": "https://schema.org",
      "\@graph": [
        { "\@type": "AboutPage", "name": "El Centro de Innovación Comunitaria (CIC)", "description": "@{[ attr($desc) ]}", "url": "$url", "inLanguage": "es-CO",
          "about": { "\@type": "EducationalOrganization", "name": "Centro de Innovación Comunitaria (CIC)", "url": "$BASE/",
            "parentOrganization": { "\@type": "Organization", "name": "Red de Mujeres del Caribe" },
            "areaServed": ["Atlántico", "Bolívar", "Cesar", "Córdoba", "La Guajira", "Magdalena", "Sucre"] } },
        { "\@type": "BreadcrumbList", "itemListElement": [
            { "\@type": "ListItem", "position": 1, "name": "Inicio", "item": "$BASE/" },
            { "\@type": "ListItem", "position": 2, "name": "El CIC" } ] }
      ]
    }
JSON

my $html = cabeza(P => $P, titulo => 'El CIC · qué es, cómo funciona y sus 8 satélites', desc => $desc, url => $url, jsonld => $jsonld, og => 'El Centro de Innovación Comunitaria')
  . cuerpo_inicio($P, 'el-cic') . <<"HTML";

    <main id="contenido" class="pagina-ruta pagina-cic">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol><li><a href="$P">Inicio</a></li><li><span aria-current="page">El CIC</span></li></ol>
        </nav>
        <div class="contenedor">
            <section class="biblio-heroe" aria-labelledby="titulo-pagina">
                <div class="patron-hojas animado decor decor-derecha" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                <div class="contenido">
                    <p class="eyebrow">El Centro de Innovación Comunitaria</p>
                    <h1 id="titulo-pagina">Un centro que llega a tu territorio.</h1>
                    <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                    <p class="lead">El CIC acompaña a las mujeres emprendedoras del Caribe para que sus negocios pasen de la subsistencia a la autonomía económica. No es un edificio: es una red que se apoya en la Red de Mujeres del Caribe, con más de 30 años de trayectoria.</p>
                    <p class="biblio-cifras"><span><b>5</b>en la Secretaría Técnica</span><span><b>8</b>satélites</span><span><b>24</b>dinamizadoras</span><span><b>200</b>emprendedoras</span></p>
                </div>
            </section>
            <nav class="subnav-cic subnav-fija" aria-label="En esta página"><ol><li><a href="#como-funciona">Cómo funciona</a></li><li><a href="#satelites">Los 8 satélites</a></li><li><a href="#pilares">Pilares</a></li><li><a href="#ciclo">El ciclo</a></li></ol></nav>
        </div>

        <section id="como-funciona" class="bloque" aria-labelledby="t-como">
            <div class="contenedor">
                <p class="eyebrow">Cómo funciona</p>
                <h2 id="t-como" style="margin-top:.4rem">De la Secretaría Técnica a cada emprendedora</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <p class="intro">El conocimiento baja en cascada: quien aprende, enseña. Así queda instalado en mujeres del propio territorio.</p>
                <ol class="flujo lista-limpia">
                    <li class="flujo-paso aparece">
                        <span class="flujo-num bg-agua">1</span>
                        <div><h3>Secretaría Técnica</h3><p>Un equipo de 5 personas que dirige el CIC, forma a las dinamizadoras y acompaña a cada satélite semana a semana.</p></div>
                    </li>
                    <li class="flujo-paso aparece">
                        <span class="flujo-num bg-durazno">2</span>
                        <div><h3>8 satélites y 24 dinamizadoras</h3><p>Cada satélite es una organización de mujeres de la Red con 3 dinamizadoras: acompañamiento, acceso a mercados y financiamiento.</p></div>
                    </li>
                    <li class="flujo-paso aparece">
                        <span class="flujo-num bg-coral">3</span>
                        <div><h3>200 emprendedoras</h3><p>Viven la ruta HACER (6 semanas en su negocio) y la ruta SER (4 talleres en grupo): 28 horas con su dinamizadora.</p></div>
                    </li>
                </ol>
            </div>
        </section>

        <section id="satelites" class="bloque bloque-banda" aria-labelledby="t-satelites">
            <div class="contenedor">
                <p class="eyebrow">Territorio</p>
                <h2 id="t-satelites" style="margin-top:.4rem">8 satélites en 13 municipios del Caribe</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <p class="intro">Uno por departamento y dos en Cesar. Cada satélite trabaja con el nodo de la Red de Mujeres del Caribe de su departamento.</p>
@{[ bloque_mapa() ]}
            </div>
        </section>

        <section id="pilares" class="bloque con-decor" aria-labelledby="t-pilares">
            <div class="patron-puntos decor decor-derecha" aria-hidden="true"></div>
            <div class="contenedor">
                <p class="eyebrow">Pilares</p>
                <h2 id="t-pilares" style="margin-top:.4rem">Cuatro pilares y una base</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <ol class="rejilla r5 lista-limpia">
$pilares
                </ol>
            </div>
        </section>

        <section id="ciclo" class="bloque bloque-banda" aria-labelledby="t-ciclo">
            <div class="contenedor">
                <p class="eyebrow">El ciclo</p>
                <h2 id="t-ciclo" style="margin-top:.4rem">Seis meses en cuatro fases</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <ol class="rejilla r4 lista-limpia etapas">
                    <li class="tarjeta aparece"><span class="numero bg-menta">1</span><h3>Diagnóstico · mes 1</h3><p>Se conoce cada negocio y se eligen los satélites.</p></li>
                    <li class="tarjeta aparece"><span class="numero bg-durazno">2</span><h3>Formación · meses 1 a 3</h3><p>Rutas HACER y SER y grupos de ahorro.</p></li>
                    <li class="tarjeta aparece"><span class="numero bg-lavanda">3</span><h3>Capital y mercados · meses 4 y 5</h3><p>Planes de inversión, activos y ferias.</p></li>
                    <li class="tarjeta aparece"><span class="numero bg-mantequilla">4</span><h3>Cierre · mes 6</h3><p>Resultados, aprendizajes y continuidad.</p></li>
                </ol>
                <div class="cta-banda">
                    <div class="patron-hojas animado" aria-hidden="true"></div>
                    <div>
                        <h2>¿Eres emprendedora?</h2>
                        <p>Inscríbete y cada semana verás qué toca, quién es tu dinamizadora y qué descargar.</p>
                    </div>
                    <div class="botones" style="margin:0">
                        <a class="btn btn-claro" href="${P}#crear-cuenta">Inscribirme</a>
                        <a class="btn btn-claro" href="${P}rutas/hacer/">Ver los talleres</a>
                    </div>
                </div>
                <p class="fuente-cic">Fuente: Modelo Metodológico CIC y Documento técnico de los procesos formativos, Red de Mujeres del Caribe, 2026.</p>
            </div>
        </section>
    </main>
HTML
$html .= final_pagina($P);
escribir('el-cic/index.html', $html);

# Direcciones anteriores: llevan a su sección
for (['como-funciona', '#como-funciona'], ['implementacion', '#ciclo'], ['formacion', '#como-funciona'], ['glosario', '']) {
    my ($ruta, $ancla) = @$_;
    escribir("el-cic/$ruta/index.html", <<"HTML");
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>El CIC</title>
    <meta http-equiv="refresh" content="0; url=../$ancla">
    <link rel="canonical" href="$url">
</head>
<body>
    <p>Esta información ahora está en <a href="../$ancla">El CIC</a>.</p>
</body>
</html>
HTML
}
