#!/usr/bin/perl
# Genera la sección institucional «El CIC» a partir de los documentos oficiales de la Red de Mujeres del Caribe:
#   6.5 Modelo Metodológico CIC (implementación, operación, monitoreo y seguimiento)
#   6.4 Documento técnico y metodológico de los procesos formativos (agosto de 2026)
# Páginas: el-cic/ · el-cic/como-funciona/ · el-cic/implementacion/ · el-cic/formacion/ · el-cic/glosario/
# Cuando la Secretaría Técnica publique una nueva versión de los documentos, se actualizan aquí los datos
# y se vuelve a ejecutar. Uso (desde la carpeta LSM_CIC): perl herramientas/generar_el_cic.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(cabeza cuerpo_inicio final_pagina escribir attr);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';
my $FUENTES = 'Modelo Metodológico CIC (documento 6.5) y Documento técnico y metodológico de los procesos formativos (documento 6.4, agosto de 2026), Red de Mujeres del Caribe';

# Páginas de la sección, en orden de lectura: [clave, ruta dentro de el-cic/, nombre, color, resumen]
my @SECCIONES = (
    ['el-cic',         '',               'Qué es el CIC',                'bg-menta',    'Definición, objetivos, población y estructura en red.'],
    ['como-funciona',  'como-funciona/', 'Cómo funciona',                'bg-durazno',  'Los cuatro enfoques, el desarrollo del ser y la gobernanza.'],
    ['implementacion', 'implementacion/','Implementación y seguimiento', 'bg-coral',    'Fases del ciclo, indicadores, riesgos y hoja de ruta 2026-2030.'],
    ['formacion',      'formacion/',     'Proceso formativo',            'bg-lavanda',  'Formación en cascada, metodología, evaluación y constancias.'],
    ['glosario',       'glosario/',      'Glosario',                     'bg-mantequilla', 'Términos, siglas y referencias del modelo.'],
);

# ---------------------------------------------------------------- Piezas
sub subnav {
    my ($P, $actual) = @_;
    my $items = join '', map {
        my ($clave, $ruta, $nombre) = @$_;
        my $cur = $clave eq $actual ? ' aria-current="page"' : '';
        qq{<li><a href="${P}el-cic/$ruta"$cur>$nombre</a></li>}
    } @SECCIONES;
    return qq{<nav class="subnav-cic" aria-label="Secciones de El CIC"><ol>$items</ol></nav>};
}

# Tabla accesible: la primera celda de cada fila es su encabezado.
sub tabla {
    my ($leyenda, $cab, $filas) = @_;
    my $th = join '', map { qq{<th scope="col">$_</th>} } @$cab;
    my $tr = join "\n", map {
        my @c = @$_; my $f = shift @c;
        qq{                            <tr><th scope="row">$f</th>} . join('', map { "<td>$_</td>" } @c) . '</tr>'
    } @$filas;
    return <<"HTML";
                <div class="tabla-caja tabla-cic aparece">
                    <table>
                        <caption>$leyenda</caption>
                        <thead><tr>$th</tr></thead>
                        <tbody>
$tr
                        </tbody>
                    </table>
                </div>
HTML
}

# Rejilla de tarjetas numeradas: [color, marca, título, texto]
sub tarjetas {
    my ($cols, @items) = @_;
    my $li = join "\n", map {
        my ($color, $marca, $titulo, $texto) = @$_;
        qq{                    <li class="tarjeta tarjeta-num aparece"><span class="numero $color">$marca</span><h3>$titulo</h3><p>$texto</p></li>}
    } @items;
    return qq{                <ol class="rejilla $cols lista-limpia">\n$li\n                </ol>\n};
}

sub lista { my ($clase, @x) = @_; return qq{<ul class="$clase">} . join('', map { "<li>$_</li>" } @x) . '</ul>' }

sub seccion {
    my (%s) = @_;
    my $decor = $s{decor} ? qq{\n            <div class="$s{decor} decor decor-@{[ $s{lado} // 'derecha' ]}" aria-hidden="true"></div>} : '';
    my $clase = $s{decor} ? 'bloque con-decor' : 'bloque';
    my $intro = $s{intro} ? qq{\n                <p class="intro">$s{intro}</p>} : '';
    return <<"HTML";

        <section id="$s{id}" class="$clase" aria-labelledby="t-$s{id}">$decor
            <div class="contenedor">
                <p class="eyebrow">$s{eyebrow}</p>
                <h2 id="t-$s{id}" style="margin-top:.4rem">$s{titulo}</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>$intro
$s{html}
            </div>
        </section>
HTML
}

sub pagina {
    my (%p) = @_;
    my ($clave, $ruta, $nombre) = @{ (grep { $_->[0] eq $p{actual} } @SECCIONES)[0] };
    my $P = $ruta eq '' ? '../' : '../../';
    my $url = "$BASE/el-cic/$ruta";
    my $cifras = $p{cifras} ? '<p class="biblio-cifras">' . join('', map { qq{<span><b data-contar="$_->[0]">$_->[0]</b>$_->[1]</span>} } @{ $p{cifras} }) . '</p>' : '';
    my $migas = $ruta eq ''
        ? qq{<li><a href="$P">Inicio</a></li><li><span aria-current="page">El CIC</span></li>}
        : qq{<li><a href="$P">Inicio</a></li><li><a href="../">El CIC</a></li><li><span aria-current="page">$nombre</span></li>};
    my @miga_ld = ($ruta eq '')
        ? (qq{{ "\@type": "ListItem", "position": 2, "name": "El CIC" }})
        : (qq{{ "\@type": "ListItem", "position": 2, "name": "El CIC", "item": "$BASE/el-cic/" }}, qq{{ "\@type": "ListItem", "position": 3, "name": "$nombre" }});
    my $extra = $p{jsonld} ? ",\n        $p{jsonld}" : '';
    my $jsonld = <<"JSON";
    {
      "\@context": "https://schema.org",
      "\@graph": [
        { "\@type": "@{[ $p{tipo} // 'WebPage' ]}", "name": "@{[ attr($p{seo_titulo}) ]}", "description": "@{[ attr($p{desc}) ]}", "url": "$url", "inLanguage": "es-CO",
          "isPartOf": { "\@type": "WebSite", "name": "Centro de Innovación Comunitaria (CIC)", "url": "$BASE/" },
          "about": { "\@type": "Organization", "name": "Centro de Innovación Comunitaria (CIC)", "parentOrganization": { "\@type": "Organization", "name": "Red de Mujeres del Caribe" } } },
        { "\@type": "BreadcrumbList", "itemListElement": [
            { "\@type": "ListItem", "position": 1, "name": "Inicio", "item": "$BASE/" },
            @{[ join(",\n            ", @miga_ld) ]} ] }$extra
      ]
    }
JSON
    # Tarjeta para seguir leyendo: la siguiente sección (o la primera, desde la última)
    my @orden = map { $_->[0] } @SECCIONES;
    my ($i) = grep { $orden[$_] eq $clave } 0 .. $#orden;
    my @otras = map { $SECCIONES[($i + $_) % @SECCIONES] } 1 .. 2;
    my $seguir = join "\n", map {
        qq{                    <a class="otra-ruta $_->[3] aparece" href="${P}el-cic/$_->[1]"><small class="eyebrow" style="color:var(--bosque)">Sigue leyendo</small><h3>$_->[2]</h3><p>$_->[4]</p><span>Ir a la sección →</span></a>}
    } @otras;

    my $html = cabeza(P => $P, titulo => $p{seo_titulo}, desc => $p{desc}, url => $url, jsonld => $jsonld, og => "$p{h1_corto} · Centro de Innovación Comunitaria")
      . cuerpo_inicio($P, $clave) . <<"HTML";

    <main id="contenido" class="pagina-ruta pagina-cic">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol>$migas</ol>
        </nav>
        <div class="contenedor">
            <section class="biblio-heroe" aria-labelledby="titulo-pagina">
                <div class="patron-hojas animado decor decor-derecha" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                <div class="contenido">
                    <p class="eyebrow">$p{eyebrow}</p>
                    <h1 id="titulo-pagina">$p{h1}</h1>
                    <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                    <p class="lead">$p{lead}</p>
                    $cifras
                </div>
            </section>
            @{[ subnav($P, $clave) ]}
        </div>
$p{cuerpo}
        <section class="bloque" aria-label="Más sobre el CIC">
            <div class="contenedor">
                <div class="rejilla r2">
$seguir
                </div>
                <p class="fuente-cic"><b>Fuentes oficiales:</b> $FUENTES. El modelo es iterativo: la Secretaría Técnica lo revisa al cerrar cada ciclo, en diálogo con las dinamizadoras, los satélites y la Red, y deja trazabilidad de cada cambio.</p>
            </div>
        </section>
    </main>
HTML
    $html .= final_pagina($P);
    $html =~ s/\{\{P\}\}/$P/g;   # enlaces escritos en los datos como {{P}}ruta/
    escribir("el-cic/${ruta}index.html", $html);
}

# ================================================================ 1. Qué es el CIC
{
my $cuerpo = '';
$cuerpo .= seccion(id => 'software-social', eyebrow => 'El concepto base', titulo => 'El «software social» como motor de cambio', decor => 'patron-puntos',
  intro => 'Los centros de innovación convencionales priorizan el «hardware»: maquinaria, computadores, edificios. El CIC parte de otra tesis: la verdadera barrera del desarrollo no es la falta de herramientas, sino la ausencia de marcos mentales adecuados. Por eso su prioridad es instalar capacidades intangibles, en tres dimensiones.',
  html => tarjetas('r3',
    ['bg-menta', '1', 'Reingeniería mental y desmitificación', 'Actúa sobre las creencias con las que la comunidad enfrenta realidades adversas y saca la innovación de los laboratorios para llevarla al barrio, la esquina y el campo. Innovar no es un destello de genio: es un proceso metódico que se vuelve costumbre.'],
    ['bg-durazno', '2', 'Soporte técnico para la productividad real', 'Un acompañamiento especializado que interviene la productividad interna de cada unidad económica: profesionaliza la intuición y lleva a comunidades vulnerables el rigor técnico que suele reservarse a las élites empresariales.'],
    ['bg-coral', '3', 'Amplitud perceptual', 'El diagnóstico como activo: entrenar el «ojo» de la emprendedora para ver patrones ocultos y necesidades sin atender, y convertir las dificultades locales en ventajas. De la visión de túnel de la subsistencia a la visión panorámica de la oportunidad.'],
  ));
$cuerpo .= seccion(id => 'gerentas', eyebrow => 'Nuestra postura', titulo => 'Del «rebusque» al empresariado popular',
  html => <<'HTML');
                <div class="dos-col" style="margin-top:1.4rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.3rem">El lenguaje construye realidad</h3>
                        <p class="texto-suave" style="margin-top:.6rem">El trato del CIC hacia sus participantes es estrictamente empresarial. Hablar de rentabilidad, flujo de caja y ventaja competitiva produce un choque positivo en la autopercepción: es el primer paso para que cada mujer asuma la responsabilidad estratégica de su negocio.</p>
                        <p class="cita">Una mujer que vende empanadas no es una «vendedora informal» en busca de subsidios: es la gerente de una unidad económica.</p>
                        <p class="texto-suave" style="margin-top:1rem">El modelo rechaza que la economía popular sea sinónimo de estancamiento y se articula con un enfoque de feminismos emancipatorios: las mujeres son gestoras de las transformaciones sociales, económicas, culturales y políticas de sus territorios.</p>
                    </div>
                    <div class="tarjeta aparece" style="background:var(--crema-2)">
                        <h3 style="font-size:1.3rem">La Red como infraestructura viva</h3>
                        <p class="texto-suave" style="margin-top:.6rem">El CIC no crea una red desde cero: se apoya en la <b>Red de Mujeres del Caribe</b>, con más de 30 años de incidencia política y liderazgo social, y evita así crear institucionalidad paralela.</p>
                        <p class="texto-suave" style="margin-top:.8rem">El liderazgo político se debilita si no lo respalda la autonomía económica. Cuando se fortalecen los medios de vida de las mujeres, el bienestar se redistribuye de inmediato en el hogar, en sus organizaciones y en el tejido comunitario.</p>
                        <p class="texto-suave" style="margin-top:.8rem">En la práctica, esto se traduce en <b>satélites itinerantes</b>: puntos de transferencia de conocimiento operados por organizaciones de mujeres locales —no sucursales físicas— que llevan el conocimiento en doble vía entre el centro y el territorio.</p>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'objetivos', eyebrow => 'Para qué existe', titulo => 'Objetivos del modelo', decor => 'patron-ondas animado', lado => 'izquierda',
  html => <<'HTML' . tarjetas('r3',
                <aside class="recuadro calido aparece" style="max-width:52rem;margin-top:1.4rem"><p class="recuadro-titulo">Objetivo general</p><p>Fortalecer la autonomía económica de mujeres y comunidades en situación de pobreza del Caribe colombiano, mediante la instalación y operación de Centros de Innovación Comunitaria que integren acompañamiento integral, acceso a mercados, acceso a financiamiento y desarrollo del ser, bajo un modelo de gobernanza descentralizada, solidaria y simbiótica anclado en la Red de Mujeres del Caribe, capaz de transformar unidades económicas de subsistencia en unidades productivas estructuradas, rentables y sostenibles.</p></aside>
                <h3 class="subtitulo aparece" style="margin-top:2.4rem">Objetivos específicos</h3>
HTML
    ['bg-menta', '1', 'Instalar «software social»', 'Desarrollar capacidades de reingeniería mental, pensamiento crítico y discernimiento para interpretar la realidad, decidir con estrategia y actuar sobre el entorno.'],
    ['bg-durazno', '2', 'Fortalecer la estructuración productiva', 'Acompañar el paso de la lógica de subsistencia al modelo de negocio contextualizado y la gestión financiera: separar finanzas del hogar y del negocio y calcular el retorno de inversión.'],
    ['bg-coral', '3', 'Ampliar el acceso a mercados', 'Romper el aislamiento territorial con clústeres y gremios locales, y con la articulación con cámaras de comercio, universidades, alcaldías y agencias de promoción comercial.'],
    ['bg-mantequilla', '4', 'Ampliar el acceso a financiamiento', 'Una capitalización social escalonada —microfinanciamiento comunitario, puentes con la banca formal, proyectos territoriales y capital semilla propio— que reduzca la dependencia del crédito informal predatorio.'],
    ['bg-agua', '5', 'Consolidar una red territorial autónoma', 'Satélites comunitarios capaces de operar por sí mismos, una vez transferido el modelo, bajo las directrices de la Secretaría Técnica y de la Red de Mujeres del Caribe.'],
    ['bg-lavanda', '6', 'Fortalecer el ser y la ciudadanía económica', 'Autoestima, pensamiento crítico, gobernanza organizativa, incidencia pública, identidad cultural y bienestar integral como base transversal de la autonomía económica.'],
  ));
$cuerpo .= seccion(id => 'poblacion', eyebrow => 'A quién se dirige', titulo => 'Tres niveles, una sola cascada',
  intro => 'Mujeres y comunidades en situación de pobreza del Caribe colombiano, vinculadas a los procesos de base de la Red de Mujeres del Caribe: afrodescendientes, indígenas, campesinas y populares que lideran ventas, gastronomía barrial, comercio al menudeo o producción agropecuaria a pequeña escala. Sus negocios son medios de subsistencia y, a la vez, expresiones de saberes, identidad y formas de vida.',
  html => <<'HTML');
                <div class="cascada" style="margin-top:1.6rem">
                    <div class="tarjeta aparece"><b data-contar="5">5</b><h3>Secretaría Técnica</h3><p>Transfiere la metodología a las dinamizadoras y custodia el modelo.</p></div>
                    <span class="flecha" aria-hidden="true">→</span>
                    <div class="tarjeta aparece"><b style="color:var(--coralp)" data-contar="24">24</b><h3>Dinamizadoras territoriales</h3><p>Tres por satélite: negocios, acceso a mercados y financiación. Replican y adaptan la ruta.</p></div>
                    <span class="flecha" aria-hidden="true">→</span>
                    <div class="tarjeta aparece"><b data-contar="200">200</b><h3>Emprendedoras</h3><p>Acompañadas en el primer año; 50 organizaciones y emprendimientos quedan vinculados como base social y 16 organizaciones (2 por satélite) reciben un diagnóstico y un plan de fortalecimiento.</p></div>
                </div>
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <p class="eyebrow">Emprendedoras</p>
                        <h3 style="font-size:1.3rem;margin:.4rem 0 .9rem">Cómo se vincula una unidad productiva</h3>
                        <ul class="lista-check">
                            <li>Situación de pobreza o vulnerabilidad económica, con un negocio de subsistencia (formal o informal) en operación o en estructuración inicial.</li>
                            <li>Residencia o actividad económica en el territorio de influencia del satélite.</li>
                            <li>Disposición a participar en el diagnóstico y en el acompañamiento: talleres, laboratorios vivenciales y espacios de reflexión colectiva.</li>
                            <li>Voluntad de integrarse al ahorro y crédito comunitario (grupos de máximo 19 personas).</li>
                            <li>Diversidad de vocaciones productivas en un mismo territorio, para no concentrar un solo rubro.</li>
                        </ul>
                        <p class="texto-suave" style="margin-top:1rem;font-size:.92rem">La caracterización la hace en campo la propia Red, entrenada por un tercero evaluador, con Investigación Acción Participativa: así se evita el «efecto de complacencia» de las encuestas con encuestadores externos. Las mujeres sin organización de base se priorizan con los criterios del Comité Técnico de Evaluación (MIE/Fondo, FUPAD y la Red).</p>
                    </div>
                    <div class="tarjeta aparece">
                        <p class="eyebrow">Organizaciones</p>
                        <h3 style="font-size:1.3rem;margin:.4rem 0 .9rem">Cómo se elige un satélite</h3>
                        <p class="texto-suave">Elegir los satélites es el mayor riesgo operativo: si uno colapsa, sus unidades productivas quedan a la deriva. Por eso un tercero evaluador independiente aplica la <b>Matriz de Madurez Organizacional (MMO)</b>, de 1 a 100, en tres ejes:</p>
                        <ul class="lista-check" style="margin-top:.8rem">
                            <li><span><b>Gobernanza:</b> asambleas reales, estatutos, rendición de cuentas, renovación de liderazgos (sin «caudillismo») y gestión de conflictos.</span></li>
                            <li><span><b>Infraestructura:</b> conectividad mínima, espacio funcional, seguro y accesible, y equipos básicos.</span></li>
                            <li><span><b>Capacidad de absorción:</b> proyectos ejecutados, manejo de presupuestos y solidez de sus reportes.</span></li>
                        </ul>
                        <p class="texto-suave" style="margin-top:1rem;font-size:.92rem">Se completa con una entrevista de 45 minutos a las directivas sobre su apertura al cambio y su comprensión de la autonomía económica frente al asistencialismo.</p>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'estructura', eyebrow => 'Cómo se organiza', titulo => 'Una red centro-satélite, no una pirámide', decor => 'patron-puntos',
  intro => 'La gobernanza del CIC funciona como un esquema orgánico, descentralizado y en red (modelo <i>hub-and-spoke</i>), con tres niveles que dependen unos de otros.',
  html => tarjetas('r3',
    ['bg-agua', 'H', 'Secretaría Técnica (el centro)', 'Núcleo directivo y estratégico. Administra el CIC, garantiza su representación jurídica y organiza la red. La lidera una Dirección Ejecutiva, con tres secretarías: Acompañamiento, Acceso a Mercados y Acceso a Financiamiento.'],
    ['bg-durazno', 'S', 'Los satélites', 'Brazos ejecutores y orquestadores del ecosistema local. Replican a escala la estructura del centro (estructura fractal) y tienen autonomía táctica para resolver las necesidades de su barrio, municipio o vereda.'],
    ['bg-menta', 'B', 'La base comunitaria', 'Las unidades productivas y sus emprendedoras, razón de ser del modelo. No son actoras pasivas: participan en las asambleas de microfinanciamiento, codiseñan soluciones e iteran sobre las herramientas.'],
  ) . tabla('Arquitectura territorial de implementación del modelo centro-satélite.', ['Nivel', 'Cantidad', 'Integrantes por unidad', 'Total de mujeres'], [
    ['Secretaría Técnica (centro)', '1 equipo de 5 personas', 'Dirección Ejecutiva, Dirección Estratégica y Política del Proyecto, y las secretarías de Acompañamiento, Acceso a Mercados y Acceso a Financiamiento', '5'],
    ['Satélites territoriales', '8: uno por cada departamento continental del Caribe y un segundo en Cesar (no incluye San Andrés)', '3 dinamizadoras: negocios, acceso a mercados y financiación', '24'],
  ]) . <<'HTML');
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Cuándo empieza a funcionar un satélite</h3>
                        <p class="texto-suave">Cuando cumple las condiciones de la MMO y supera un <b>hito político</b>: la presentación oficial ante la comunidad, en la que la Red transfiere su legitimidad al equipo técnico del CIC. Desde ese momento debe tener:</p>
                        <ol class="requisitos" style="margin-top:1rem">
                            <li>Gobernanza democrática interna, con relevo de liderazgos y gestión de conflictos.</li>
                            <li>Un manual de operación propio que traduzca los lineamientos del centro a su entorno.</li>
                            <li>Dinamizadoras certificadas en el «idioma CIC» antes de acompañar a la base comunitaria.</li>
                            <li>Articulación con los Círculos de Aprendizaje Subregionales.</li>
                            <li>Reporte periódico a la Secretaría Técnica de sus indicadores.</li>
                        </ol>
                    </div>
                    <div class="tarjeta aparece" style="background:var(--crema-2)">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Satélite y nodo no son lo mismo</h3>
                        <p class="texto-suave">El <b>satélite</b> es la unidad operativa del CIC en el territorio: hay 8. El <b>nodo</b> es la estructura departamental de la Red de Mujeres del Caribe: hay 7, uno por departamento. Cada satélite se articula con el nodo de su departamento.</p>
                        <p class="texto-suave" style="margin-top:.9rem">En el primer ciclo, el CIC está en 13 municipios de 7 departamentos: Baranoa y Campo de la Cruz (Atlántico), Cartagena y María la Baja (Bolívar), Sincelejo y Tolú (Sucre), Montería y Tierralta (Córdoba), Santa Marta (Magdalena), Valledupar y Pueblo Bello (Cesar), y Riohacha y Albania (La Guajira).</p>
                        <p style="margin-top:1rem"><a class="enlace" href="{{P}}#territorio">Ver el mapa de satélites</a></p>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'focalizacion', eyebrow => 'Dónde actúa', titulo => 'Cinco criterios para elegir territorio',
  intro => 'El ámbito es el Caribe colombiano continental. La focalización no responde a un criterio único, sino a la combinación de cinco.',
  html => tarjetas('r3',
    ['bg-menta', '1', 'Infraestructura social viva', 'Se priorizan municipios donde la Red ya tiene procesos de base: redes de confianza, liderazgos reconocidos y memoria organizativa que permiten activar el modelo sin construir legitimidad desde cero.'],
    ['bg-durazno', '2', 'Pobreza y vulnerabilidad', 'Territorios donde las mujeres sostienen economías populares sin soporte técnico, mercados formales ni financiamiento.'],
    ['bg-coral', '3', 'Medios de vida o necesidades básicas', 'Por dónde empezar depende del contexto: en zonas semiurbanas se protegen los medios de vida existentes; en comunidades aisladas, resolver primero una carencia vital (como el agua) abre nuevas oportunidades.'],
    ['bg-mantequilla', '4', 'Dispersión urbano-rural', 'Las distancias y condiciones de acceso definen cómo se reparten las tres dinamizadoras de cada satélite.'],
    ['bg-lavanda', '5', 'Ecosistema productivo activable', 'Debe existir una base comercial mínima, validada con la Matriz de Oportunidades y Fallas de Mercado, sin saturar el territorio con negocios idénticos.'],
  ) . <<'HTML');
                <p class="texto-suave aparece" style="margin-top:1.4rem;max-width:52rem">Cada despliegue necesita, como mínimo, el equipo humano formado y certificado, las organizaciones y unidades productivas vinculadas, los espacios y materiales pedagógicos, y los formatos oficiales de registro que alimentan el Plan de Monitoreo y Evaluación (Plan MEL). La cobertura crece por etapas según la <a class="enlace" href="{{P}}el-cic/implementacion/#hoja-de-ruta">hoja de ruta 2026-2030</a>.</p>
HTML
$cuerpo .= seccion(id => 'fundamentos', eyebrow => 'Marco conceptual', titulo => 'En qué se apoya el modelo', decor => 'patron-ondas animado', lado => 'izquierda',
  html => tabla('Fundamentos conceptuales del modelo CIC.', ['Enfoque', 'Autoría', 'Qué aporta al CIC'], [
    ['Pensamiento de diseño', 'Brown (2009)', 'Una innovación solo lo es si mejora la condición humana: deseable para las personas, factible técnicamente y viable económica y ambientalmente.'],
    ['Diseño Centrado en las Personas', 'IDEO.org (2015)', 'Las soluciones se construyen con la comunidad en el territorio, no para ella desde un escritorio.'],
    ['Innovación frugal e incremental', 'Radjou, Prabhu y Ahuja (2012)', 'Alto valor social y económico con recursos limitados.'],
    ['Gobernanza comunitaria de recursos', 'Ostrom (1990)', 'Las comunidades pueden gestionar bienes comunes con reglas propias.'],
    ['Tecnologías sociales', 'Dagnino (2010)', 'Soluciones replicables y cocreadas con la comunidad.'],
    ['Ecosistemas de emprendimiento', 'Isenberg (2010)', 'El ecosistema se gestiona de forma activa, en varias dimensiones a la vez.'],
    ['Desarrollo a escala humana y capacidades', 'Max-Neef (1993); Sen (1999)', 'Ayudan a decidir por dónde empezar: proteger medios de vida o resolver necesidades básicas.'],
    ['Advertencia contra el «solucionismo»', 'Morozov (2013)', 'Instalar soluciones complejas sin atacar la raíz de los problemas solo produce impactos ocasionales.'],
  ]) . <<'HTML');
                <aside class="recuadro fresco aparece" style="max-width:52rem;margin-top:1.6rem"><p class="recuadro-titulo">Un modelo que aprende</p><p>El modelo CIC no es un protocolo cerrado. Los territorios del Caribe son muy distintos, el enfoque rechaza las soluciones estandarizadas y los satélites tienen autonomía táctica; por eso cada fase cierra con una sistematización de lo que funcionó y lo que no. La Secretaría Técnica custodia y versiona el documento metodológico para que cada cambio sea verificable.</p></aside>
HTML
pagina(actual => 'el-cic', seo_titulo => 'Qué es el Centro de Innovación Comunitaria (CIC) · modelo', h1_corto => 'Qué es el CIC',
  desc => 'El modelo del CIC: software social, objetivos, población, estructura centro-satélite y focalización territorial para la autonomía económica de las mujeres del Caribe.',
  tipo => 'AboutPage', eyebrow => 'El modelo CIC', h1 => 'Un centro que instala capacidades, no máquinas.',
  lead => 'El Centro de Innovación Comunitaria (CIC) es una institución de gestión del conocimiento y de «software social»: su fuerza no está en el cemento y el ladrillo, sino en orquestar procesos, mentalidades y conexiones para que las unidades económicas de las mujeres del Caribe pasen de la subsistencia a la autonomía.',
  cifras => [[5, 'Secretaría Técnica'], [24, 'dinamizadoras'], [8, 'satélites'], [200, 'emprendedoras']],
  cuerpo => $cuerpo);
}

# ================================================================ 2. Cómo funciona
{
my $cuerpo = '';
$cuerpo .= seccion(id => 'pilares', eyebrow => 'La arquitectura', titulo => 'Cuatro enfoques de acción directa y un pilar transversal', decor => 'patron-puntos',
  intro => 'Todo se apoya en un enfoque base: mejorar de forma constante la productividad técnica, gestionar con estrategia adaptativa, democratizar las metodologías ágiles (ciclos cortos de prueba y error, como Lean Startup o Scrum) y adoptar las tecnologías emergentes que sean pertinentes. Sobre esa base actúan cinco frentes.',
  html => <<'HTML');
                <div class="rejilla r5" style="margin-top:1.4rem">
                    <a class="tarjeta pilar aparece enlace-tarjeta" href="#acompanamiento"><span class="numero bg-menta">1</span><h3>Acompañamiento integral</h3><p>De la subsistencia a la estructuración.</p></a>
                    <a class="tarjeta pilar aparece enlace-tarjeta" href="#mercados"><span class="numero bg-coral">2</span><h3>Acceso a mercados</h3><p>Romper el aislamiento territorial.</p></a>
                    <a class="tarjeta pilar aparece enlace-tarjeta" href="#financiamiento"><span class="numero bg-mantequilla">3</span><h3>Acceso a financiamiento</h3><p>Capitalización social en cuatro niveles.</p></a>
                    <a class="tarjeta pilar aparece enlace-tarjeta" href="#ecosistema"><span class="numero bg-agua">4</span><h3>Apropiación del ecosistema</h3><p>Seis dimensiones por satélite.</p></a>
                    <a class="tarjeta pilar pilar-base aparece enlace-tarjeta" href="#ser"><span class="numero" style="background:var(--bosque);color:#fff">5</span><h3>Desarrollo del ser</h3><p style="color:var(--bosque);font-weight:600">Pilar transversal que sostiene a los demás.</p></a>
                </div>
                <p class="texto-suave aparece" style="margin-top:1.2rem">Todos están atravesados por un eje de <a class="enlace" href="#gobernanza">gobernanza en red</a>: las decisiones se toman con las organizaciones de la Red, no para ellas.</p>
HTML
$cuerpo .= seccion(id => 'acompanamiento', eyebrow => 'Enfoque 1 · Acompañamiento integral', titulo => 'De la subsistencia a la estructuración',
  intro => 'Entregar herramientas, insumos o capital de forma aislada no basta. El acompañamiento busca una inmersión profunda que transforme la mentalidad de la emprendedora en tres dimensiones conectadas.',
  html => tarjetas('r3',
    ['bg-menta', 'A', 'Autoestima y habilidades emprendedoras', 'Las <i>power skills</i>, fundamentadas en la teoría de la autoeficacia de Bandura (1997): creer que se puede es condición para hacer.'],
    ['bg-durazno', 'B', 'Modelo de negocio contextualizado', 'El lienzo de modelo de negocio de Osterwalder y Pigneur (2010), traducido al lenguaje del barrio y la vereda: el <b>Canvas de la Esquina</b>.'],
    ['bg-coral', 'C', 'Gestión financiera para la viabilidad', 'Alfabetización económica: separar el dinero del hogar y del negocio, proyectar el flujo de caja y calcular el retorno de la inversión.'],
  ) . <<'HTML');
                <div class="calc-destacada aparece" style="background:var(--crema-2)">
                    <div>
                        <h3>El programa dual HACER-SER</h3>
                        <p>Seis semanas de acompañamiento individual de 2 horas en el negocio (ruta HACER, 12 horas) y cuatro talleres grupales de 4 horas (ruta SER, 16 horas): <b>28 horas de formación directa</b> por emprendedora, más las visitas de reconocimiento, la asesoría personalizada de las dinamizadoras y el seguimiento individual.</p>
                    </div>
                    <div class="botones" style="margin:0"><a class="btn btn-primario btn-pequeno" href="{{P}}rutas/hacer/">Ruta HACER</a><a class="btn btn-borde btn-pequeno" href="{{P}}rutas/ser/">Ruta SER</a></div>
                </div>
HTML
$cuerpo .= seccion(id => 'mercados', eyebrow => 'Enfoque 2 · Acceso a mercados', titulo => 'Romper el aislamiento territorial', decor => 'patron-ondas animado', lado => 'izquierda',
  intro => 'La innovación no dura si lo que se produce no encuentra quién lo compre. Los satélites actúan como traductores y conectores entre la base social y los mercados más amplios.',
  html => <<'HTML');
                <div class="dos-col" style="margin-top:1.2rem">
                    <ul class="lista-check tarjeta aparece" style="font-size:.97rem;gap:.8rem">
                        <li><span><b>Clústeres y gremios locales:</b> agrupar unidades productivas para dejar de competir entre sí y ganar poder de negociación, según la teoría de las ventajas competitivas de Porter (1998).</span></li>
                        <li><span><b>Articulación institucional:</b> cámaras de comercio, universidades, alcaldías, agencias de promoción y programas de comercio exterior como ProColombia.</span></li>
                        <li><span><b>Rutas de crecimiento:</b> estandarización, certificación sanitaria y, a mediano plazo, exportación.</span></li>
                    </ul>
                    <ul class="lista-check tarjeta aparece" style="font-size:.97rem;gap:.8rem">
                        <li><span><b>Estrategia de comercialización</b> con catálogos digitales por satélite.</span></li>
                        <li><span><b>Ferias, ruedas de negocio y vitrinas</b> con propósito: probar productos, presentar el <i>pitch</i> y encontrar aliados, más que vender una sola vez.</span></li>
                        <li><span><b>Estrategia comercial del propio CIC:</b> ofrecer al ecosistema el respaldo de una red de organizaciones de mujeres con más de 30 años y datos sobre la economía popular del Caribe.</span></li>
                    </ul>
                </div>
HTML
$cuerpo .= seccion(id => 'financiamiento', eyebrow => 'Enfoque 3 · Acceso a financiamiento', titulo => 'Capitalización social en cuatro niveles',
  intro => 'La asimetría en el acceso al capital es la barrera más crítica de las economías locales. Para enfrentar los préstamos informales predatorios —el «gota a gota»—, el CIC despliega una estrategia escalonada inspirada en la economía solidaria.',
  html => <<'HTML');
                <ol class="linea" style="margin-top:1.4rem">
                    <li class="paso-ruta aparece"><span class="numero bg-mantequilla">N1</span><div class="tarjeta"><span class="meta">Desde el primer ciclo</span><h3>Unidades de Microfinanciamiento Comunitario (UMC)</h3><p>Grupos cerrados de máximo 19 personas que aportan capital propio en forma de «acciones», se prestan entre sí con tasas justas definidas en asamblea y reparten el interés generado entre las mismas socias al final del ciclo. Crean historial, disciplina y liquidez inmediata.</p></div></li>
                    <li class="paso-ruta aparece"><span class="numero bg-mantequilla">N2</span><div class="tarjeta"><span class="meta">Inclusión financiera</span><h3>Puentes con entidades financieras formales</h3><p>El centro actúa como garante reputacional e intermediario para negociar cuentas sin cuota de manejo, microcréditos con tasas subsidiadas y acceso a pagos digitales.</p></div></li>
                    <li class="paso-ruta aparece"><span class="numero bg-mantequilla">N3</span><div class="tarjeta"><span class="meta">Proyectos y cooperación</span><h3>Gestión de proyectos territoriales</h3><p>Los satélites se forman como formuladores de proyectos: mapean convocatorias públicas, de fundaciones y de cooperación internacional para conseguir capital semilla no reembolsable o cofinanciación.</p></div></li>
                    <li class="paso-ruta aparece"><span class="numero bg-mantequilla">N4</span><div class="tarjeta"><span class="meta">Etapa de madurez</span><h3>Financiamiento propio del centro</h3><p>Fondos rotatorios o capital semilla propio (Fondo de Aceleración) para las unidades productivas que demuestren tracción y alto potencial de impacto.</p></div></li>
                </ol>
                <aside class="recuadro calido aparece" style="max-width:52rem;margin-top:1.6rem"><p class="recuadro-titulo">Un caso que inspira</p><p>El G10 Bank nació en la favela de Paraisópolis (São Paulo) prestando a emprendedores informales que la banca no atendía. En 2024 reportaba cerca de 5.000 clientes (Mello, 2024). Muestra cómo conocer a fondo una comunidad y registrar su información se convierte en acceso a financiamiento.</p></aside>
HTML
$cuerpo .= seccion(id => 'ecosistema', eyebrow => 'Enfoque 4 · Apropiación del ecosistema', titulo => 'Seis dimensiones que cada satélite gestiona', decor => 'patron-puntos',
  intro => 'No existe un ecosistema de innovación genérico: cada satélite construye y se apropia del suyo, y lo deja escrito en su manual de operación.',
  html => tarjetas('r3',
    ['bg-coral', '1', 'Acceso a mercado', 'Canales locales, regionales e internacionales con demanda real.'],
    ['bg-menta', '2', 'Capital humano', 'Detectar, formar y retener el talento de la comunidad.'],
    ['bg-agua', '3', 'Actores de soporte', 'Incubadoras, universidades, cámaras de comercio, ONG e instituciones técnicas.'],
    ['bg-lavanda', '4', 'Marcos regulatorios', 'Políticas públicas y normas fiscales, laborales y de formalización.'],
    ['bg-mantequilla', '5', 'Acceso a financiamiento', 'Conexión con los vehículos de fondeo de la región.'],
    ['bg-durazno', '6', 'Mentalidad y cultura', 'Un entorno que celebre emprender y vea el fracaso como aprendizaje.'],
  ) . qq{                <p class="texto-suave aparece" style="margin-top:1.2rem;max-width:52rem">Se trabajan con el diagnóstico organizacional FOCO-INTEGRAL, un plan de fortalecimiento por organización y la gestión de alianzas a cargo de la Secretaría Técnica y las dinamizadoras. El <a class="enlace" href="{{P}}cursos/gestion-cic/#modulo-2">módulo 2 del curso de gestión</a> enseña a mapearlas.</p>\n});
$cuerpo .= seccion(id => 'ser', eyebrow => 'Pilar transversal', titulo => 'Desarrollo del ser para una ciudadanía social comunitaria',
  intro => 'Atraviesa todas las fases: no es solo una dimensión individual, sino la transformación de las formas de pensar, sentir, relacionarse y actuar en el territorio. Busca fortalecer las capacidades humanas, organizativas y de liderazgo de las mujeres y su participación en la gobernanza de la Red. Tiene ocho componentes.',
  html => tarjetas('r4',
    ['bg-lavanda', '1', 'Reingeniería mental', 'De una identidad asociada a la informalidad a una identidad como sujeta económica.'],
    ['bg-lavanda', '2', 'Autoeficacia y habilidades', 'Autoestima, comunicación, manejo emocional ante el riesgo y el fracaso, proyecto de vida.'],
    ['bg-lavanda', '3', 'Pensamiento crítico', 'Lectura del entorno, del mercado y de los factores de exclusión.'],
    ['bg-lavanda', '4', 'Ciudadanía y liderazgo', 'Participar en las decisiones y transformar relaciones de poder.'],
    ['bg-lavanda', '5', 'Tejido social', 'Confianza, fortalecimiento organizativo y gobernanza de la Red.'],
    ['bg-lavanda', '6', 'Incidencia pública', 'Acercamiento a actores institucionales y escenarios de decisión.'],
    ['bg-lavanda', '7', 'Identidad y arraigo', 'Valoración de los saberes locales y las prácticas culturales.'],
    ['bg-lavanda', '8', 'Bienestar y cuidado', 'Autocuidado y reflexión sobre la distribución del trabajo de cuidado.'],
  ) . qq{                <p class="texto-suave aparece" style="margin-top:1.2rem;max-width:52rem">Se trabaja con metodologías participativas, vivenciales y comunitarias: reflexión a partir de experiencias reales, autodiagnósticos, simulaciones de toma de decisiones, diálogo colectivo e intercambio entre participantes. En la formación, vive en la <a class="enlace" href="{{P}}rutas/ser/">ruta SER</a> y en los momentos del ser de cada semana del HACER.</p>\n});
$cuerpo .= seccion(id => 'gobernanza', eyebrow => 'Eje', titulo => 'Gobernanza en red', decor => 'patron-ondas animado', lado => 'izquierda',
  html => tarjetas('r3',
    ['bg-agua', '1', 'Decidir con la Red', 'Las decisiones se toman con las organizaciones que forman la Red de Mujeres del Caribe y no para ellas.'],
    ['bg-agua', '2', 'Autonomía táctica', 'Cada satélite resuelve las necesidades de su territorio, alineado con las directrices estratégicas, metodológicas y jurídicas del centro.'],
    ['bg-agua', '3', 'Aprender entre pares', 'Los Círculos de Aprendizaje Subregionales agrupan dinamizadoras para pasarse soluciones de un satélite a otro.'],
  ));
$cuerpo .= seccion(id => 'pensamiento', eyebrow => 'Metodología de pensamiento', titulo => 'El fin de la burocracia del formato',
  intro => 'En el CIC el aprendizaje no se mide por documentos entregados, sino por la evolución del pensamiento crítico aplicado al negocio. El Canvas no es un requisito administrativo: no importa el papel lleno, importa que la emprendedora explique la lógica de sus conexiones comerciales. A los seis meses se espera un <b>hito cognitivo</b>: tres capacidades.',
  html => tarjetas('r3',
    ['bg-menta', '1', 'Problematizar con rigor', 'Declarar un problema como una necesidad mal atendida, no como una queja.'],
    ['bg-durazno', '2', 'Extraer hallazgos', 'Convertir lo que pasa en el entorno en datos útiles para el negocio.'],
    ['bg-coral', '3', 'Prototipar y validar', 'Diseñar soluciones mínimas, probarlas en el mercado real y ajustar, sin inversiones a ciegas.'],
  ));
pagina(actual => 'como-funciona', seo_titulo => 'Cómo funciona el CIC · pilares y desarrollo del ser', h1_corto => 'Cómo funciona el CIC',
  desc => 'Los cuatro enfoques del CIC —acompañamiento integral, acceso a mercados, financiamiento solidario y ecosistema— y el pilar transversal del desarrollo del ser.',
  eyebrow => 'Cómo funciona', h1 => 'Cuatro enfoques y un pilar que los sostiene.',
  lead => 'Para que las ideas no se queden en el discurso, el CIC funciona como una arquitectura técnica viva: acompaña cada negocio, lo conecta con mercados y con financiamiento, activa el ecosistema de su territorio y fortalece, en todo momento, el ser de cada mujer.',
  cifras => [[4, 'enfoques'], [8, 'componentes del ser'], [6, 'dimensiones del ecosistema'], [19, 'personas como máximo por UMC']],
  cuerpo => $cuerpo);
}

# ================================================================ 3. Implementación y seguimiento
{
sub fase {
    my ($marca, $color, $meta, $titulo, $texto, $chips, $kr) = @_;
    my $ch = $chips ? '<div class="llevas"><span>Instrumentos:</span>' . join('', map { qq{<span class="chip">$_</span>} } @$chips) . '</div>' : '';
    my $res = $kr ? qq{<p class="logra"><b>Resultados clave:</b> $kr</p>} : '';
    return qq{                    <li id="fase-$marca" class="paso-ruta aparece"><span class="numero $color">F$marca</span><div class="tarjeta"><span class="meta">$meta</span><h3>$titulo</h3>$texto$ch$res</div></li>\n};
}
my $fases = '                <ol class="linea" style="margin-top:1.4rem">' . "\n"
  . fase(0, 'bg-menta', 'Antes del primer mes', 'Presentación oficial y socialización',
      '<p>Antes de levantar el primer dato se construye un «contexto de confianza». En un evento formal, la Dirección del CIC, el tercero evaluador y las directivas de la Red: transfieren la legitimidad (la Red presenta al evaluador ante sus bases), manejan las expectativas (el diagnóstico no es para entregar subsidios, sino para construir autonomía) y lanzan el cronograma de 30 días.</p>')
  . fase(1, 'bg-durazno', 'Mes 1', 'Diagnóstico acelerado y alistamiento',
      '<p>Genera el primer activo de software social: entender a fondo el territorio. Gobernanza centralizada con ejecución participativa: el tercero evaluador diseña los instrumentos, audita las organizaciones, mapea el ecosistema y tabula; la Red, entrenada, levanta la información en campo.</p>',
      ['MMO de 1 a 100', 'Entrevista a directivas (45 min)', 'Diario de Empatía Financiera y Productiva', 'Mapeo visual (Fotograma)', 'Net-Mapping', 'Matriz de Oportunidades y Fallas de Mercado'],
      'Documento Diagnóstico Integral y matriz de satélites oficiales, el día 30.')
  . fase(2, 'bg-coral', 'Meses 1 a 3', 'Transferencia, formación y microfinanzas',
      '<p>Instala el software social y el modelo operativo en las organizaciones seleccionadas, para que funcionen como satélites autónomos.</p><ul class="lista-check" style="margin-top:.7rem"><li><span><b>Mes 1 · El ser y la red:</b> certificación asincrónica en <a class="enlace" href="{{P}}cursos/gestion-cic/">Gestión de CIC</a>, Cumbre Fundacional de dos días (laboratorios del ser, manuales de operación, kits itinerantes y el «Manifiesto de Gerencia Popular del Caribe») e instalación de los Círculos de Aprendizaje Subregionales.</span></li><li><span><b>Mes 2 · Acompañamiento integral:</b> laboratorios de autoeficacia y Protocolo de Primer Encuentro, Canvas de la Esquina y la táctica financiera del «bolsillo separado».</span></li><li><span><b>Mes 3 · Capital y ecosistema:</b> ingeniería comercial por clústeres, ruta de cuatro sesiones para crear las UMC y asambleas fundacionales, con la Secretaría como observadora.</span></li></ul>',
      undef, 'actas fundacionales de las UMC y planes de mejoramiento codiseñados con las productoras.')
  . fase(3, 'bg-mantequilla', 'Meses 4 y 5', 'Capitalización productiva y activación comercial',
      '<p>Materializa los planes de mejora: más productividad, ingresos y autonomía.</p><ul class="lista-check" style="margin-top:.7rem"><li><span><b>Mes 4:</b> 200 planes de inversión simplificados —derivados de los planes de mejora, no de listados genéricos—, priorización de activos y dotación con acompañamiento para su uso.</span></li><li><span><b>Mes 5:</b> activación de redes de emprendimiento, participación en ferias y vitrinas, y ejercicios de negociación, lectura de precios y costos de intermediación.</span></li></ul>',
      undef, 'matriz de activos priorizados, registros de entrega y rutas de articulación comercial.')
  . fase(4, 'bg-lavanda', 'Mes 6', 'Cierre, evaluación y escalabilidad',
      '<p>Mide la transformación lograda y transfiere el modelo a la Red para que siga sola: línea de salida, sistematización de la experiencia, intercambio de saberes y una ruta de continuidad con propuestas de política pública.</p>',
      undef, 'Informe Financiero Final, Documento de Sistematización y Lecciones Aprendidas, Documento de Incidencia en Política Pública y Hoja de Ruta de Escalabilidad.')
  . "                </ol>\n";
my $cuerpo = '';
$cuerpo .= seccion(id => 'fases', eyebrow => 'El primer ciclo', titulo => 'Una socialización y cuatro fases en seis meses', decor => 'patron-puntos',
  intro => 'Cada fase combina instalación metodológica, formación, acompañamiento directo y resultados clave verificables. La meta de 200 emprendedoras acompañadas es la meta contractual del Plan de Monitoreo y Evaluación (Plan MEL) y el punto de partida para ciclos más amplios.',
  html => $fases);
$cuerpo .= seccion(id => 'diagnostico', eyebrow => 'Fase 1 en detalle', titulo => 'El diagnóstico, semana a semana',
  html => tabla('Cronograma intensivo de la fase 1 (un mes, cuatro semanas).', ['Semana', 'Tercero evaluador', 'Red de Mujeres del Caribe'], [
    ['Semana 1', 'Capacita a las líderes de la Red en los instrumentos y diseña la MMO.', 'Recibe el entrenamiento y hace 5 encuestas piloto en su territorio.'],
    ['Semana 2', 'Entrevista a las directivas y aplica la MMO a las organizaciones.', 'Levanta los datos de las primeras 100 unidades productivas.'],
    ['Semana 3', 'Hace el Net-Mapping con actores de soporte (gremios, SENA, alcaldías).', 'Levanta las 100 unidades restantes: meta de 200.'],
    ['Semana 4', 'Tabula de forma centralizada y cruza datos de organizaciones, unidades y ecosistemas.', 'Resuelve dudas sobre las fichas entregadas.'],
    ['Día 30', 'Entrega el Documento Diagnóstico Integral y la matriz de satélites oficiales.', '—'],
  ]));
$cuerpo .= seccion(id => 'monitoreo', eyebrow => 'Monitoreo y seguimiento', titulo => 'Qué se mide y cómo', decor => 'patron-ondas animado', lado => 'izquierda',
  intro => 'El aprendizaje no se mide por documentos entregados, sino por la evolución del pensamiento crítico y por cambios verificables en ingresos, productividad, autonomía financiera y capacidades. Una línea base (mes 1) y una línea de salida (mes 6) permiten comparar el punto de partida y el de llegada.',
  html => tarjetas('r3',
    ['bg-durazno', 'H', 'Impacto económico directo', 'El «hacer»: aumento de ingresos e inserción en el mercado formal.'],
    ['bg-mantequilla', '$', 'Autonomía financiera', 'Capacidad de autogestión financiera comunitaria con las microfinanzas solidarias.'],
    ['bg-lavanda', 'S', 'Capital humano y gobernanza', 'El «ser»: capacidades, liderazgo y cambio de autopercepción de las mujeres y sus organizaciones.'],
  ) . tabla('Indicadores de resultado del primer ciclo de implementación (año 1). Solo I3 e I4 son metas contractuales del Plan MEL; los demás los propone el modelo para medir su propio impacto.', ['Dimensión', 'Indicador', 'Meta o línea de salida', 'Tipo'], [
    ['Impacto económico', 'Incremento promedio de ingresos de las unidades productivas', '10 % sobre la línea base', 'Del modelo'],
    ['Impacto económico', 'Unidades productivas vinculadas formalmente a nuevos mercados', '100 unidades (50 % de la cobertura)', 'Del modelo'],
    ['Autonomía financiera', 'Participantes vinculadas y activas en una UMC', '50 % de las participantes', 'Del modelo'],
    ['Capital humano y gobernanza', 'Dinamizadoras formadas y operando con el modelo CIC', '24 dinamizadoras (3 por satélite)', 'Contractual · I3'],
    ['Capital humano y gobernanza', 'Cambios en autoconfianza y capacidad de decisión de las mujeres', 'Identificación cualitativa y cuantitativa', 'Del modelo'],
    ['Identidad y autopercepción', 'Participantes que se perciben como «empresarias» o «gerentes»', '80 % en las encuestas de salida', 'Del modelo'],
    ['Cobertura', 'Unidades económicas con diagnóstico de software social', '200 unidades', 'Del modelo'],
    ['Estructura territorial', 'Satélites operando con los lineamientos del CIC', 'Mínimo definido por el diagnóstico', 'Contractual · I4'],
  ]) . <<'HTML');
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">El Plan MEL del proyecto</h3>
                        <p class="texto-suave">Define seis indicadores contractuales (I1 a I6): vinculación formal de organizaciones y unidades productivas, diseño y transferencia del modelo metodológico, certificación de dinamizadoras, satélites en funcionamiento, grupos de financiamiento solidario y participación en estrategias comerciales. Los satélites reportan a la Secretaría Técnica y esta, a la Dirección Técnica.</p>
                    </div>
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Indicadores del pilar del ser</h3>
                        <ul class="lista-check">
                            <li>Autopercepción como actoras económicas.</li>
                            <li>Toma de decisiones sobre la actividad productiva.</li>
                            <li>Liderazgo y participación en espacios organizativos.</li>
                            <li>Capacidades organizativas y de trabajo colectivo.</li>
                            <li>Participación en espacios comunitarios y territoriales.</li>
                            <li>Propuestas colectivas sobre las economías populares.</li>
                            <li>Espacios de diálogo con actores del territorio.</li>
                            <li>Prácticas de autocuidado y bienestar.</li>
                        </ul>
                    </div>
                </div>
                <aside class="recuadro fresco aparece" style="max-width:52rem;margin-top:1.6rem"><p class="recuadro-titulo">Quién consolida la información</p><p>La Secretaría Técnica consolida y audita los resultados clave de cada fase, con las dinamizadoras de nodo y de satélite, que reportan sus avances de forma periódica. Al cerrar cada ciclo, convierte la línea base, la línea de salida, la sistematización y la retroalimentación de los satélites en ajustes concretos al modelo, y deja escrito qué cambió y con qué evidencia.</p></aside>
HTML
$cuerpo .= seccion(id => 'riesgos', eyebrow => 'Riesgos y mitigación', titulo => 'Lo que puede salir mal, y cómo se previene',
  html => <<'HTML');
                <div class="rejilla r2" style="margin-top:1.4rem">
                    <article class="tarjeta riesgo aparece"><h3>Solucionismo</h3><p>Instalar demasiadas innovaciones sin atacar la raíz del problema, o forzar tecnologías complejas donde no hacen falta.</p><p class="mitiga"><b>Se mitiga</b> enfocando la intervención en lo esencial y viable a corto plazo.</p></article>
                    <article class="tarjeta riesgo aparece"><h3>Colapso de un satélite</h3><p>Si una organización no tiene la madurez suficiente, sus unidades productivas quedan a la deriva.</p><p class="mitiga"><b>Se mitiga</b> con la Matriz de Madurez Organizacional aplicada por un tercero evaluador independiente.</p></article>
                    <article class="tarjeta riesgo aparece"><h3>Sobrecarga de las participantes</h3><p>Las actividades pueden chocar con la vida diaria y el trabajo de cuidado de las mujeres.</p><p class="mitiga"><b>Se mitiga</b> ajustando los tiempos a sus posibilidades reales: formación corta, práctica y cerca de su lugar de trabajo.</p></article>
                    <article class="tarjeta riesgo aparece"><h3>Descapitalización silenciosa</h3><p>Negocios que pierden viabilidad por no contar los costos invisibles: el tiempo propio, el desgaste de herramientas, los servicios del hogar.</p><p class="mitiga"><b>Se mitiga</b> con la gestión financiera de la ruta y el «Kit de Finanzas Frugales».</p></article>
                </div>
HTML
$cuerpo .= seccion(id => 'hoja-de-ruta', eyebrow => 'Anexo 1', titulo => 'Hoja de ruta estratégica 2026-2030', decor => 'patron-puntos',
  intro => 'La visión a cinco años: el primer año se concentra en la ejecución intensiva y la base estructural. Las metas de los años 2 a 5 se ajustarán con los resultados del primer ciclo.',
  html => tabla('Hoja de ruta estratégica 2026-2030 de los CIC del Caribe colombiano.', ['Frente', 'Año 1 · Instalación y ejecución base', 'Año 2 · Prototipado y validación', 'Año 3 · Estructuración y productividad', 'Año 4 · Escalamiento y redes', 'Año 5 · Autonomía y prosperidad'], [
    ['Acompañamiento integral', 'Meta: 200 unidades. Diagnóstico de software social y reingeniería mental inicial.', 'Ciclos de Lean Startup. Prototipado frugal en las 200 unidades.', 'Profesionalización técnica y financiera. Cuentas del hogar y del negocio separadas.', 'Especialización en diseño de producto y <i>power skills</i> avanzadas.', 'Cultura de innovación consolidada. Mentoría entre pares.'],
    ['Acceso a financiamiento', '10 a 15 grupos de ahorro (UMC): confianza.', 'Disciplina de ahorro y primeros créditos internos para micromejoras.', 'Inclusión financiera formal: banca ética y cooperativas.', 'Fondos de cooperación internacional (capital semilla).', 'Fondo de Aceleración propio del CIC.'],
    ['Acceso a mercados', 'Diagnóstico comercial: entornos y «dolores» del mercado local.', 'Innovación frugal en empaques y canales de venta directa.', 'Clústeres, compras colectivas y oferta unificada por sectores.', 'Comercio electrónico y grandes superficies regionales.', 'Pilotos de exportación social con identidad Caribe.'],
    ['Articulación del ecosistema', 'Instalación de satélites, activación de nodos y alianza con la Red.', 'Formación técnica de líderes de satélite en metodologías CIC.', 'Incidencia en planes de desarrollo local (alcaldías y gobernaciones).', 'Transferencia del modelo a otros territorios del Caribe.', 'Gobernanza descentralizada: red de satélites 100 % autónoma.'],
  ]));
pagina(actual => 'implementacion', seo_titulo => 'Implementación del CIC · fases, indicadores y hoja de ruta', h1_corto => 'Implementación y seguimiento',
  desc => 'Cómo se implementa el CIC: fases del primer ciclo de seis meses, diagnóstico, indicadores y metas, riesgos y hoja de ruta estratégica 2026-2030.',
  eyebrow => 'Implementación y seguimiento', h1 => 'Seis meses, cuatro fases y un modelo que aprende.',
  lead => 'El primer ciclo empieza con una socialización y avanza por cuatro fases: diagnóstico, transferencia y formación, capitalización y cierre. Cada fase deja resultados verificables, y lo aprendido actualiza el modelo antes del siguiente ciclo.',
  cifras => [[6, 'meses por ciclo'], [8, 'indicadores de resultado'], [200, 'planes de inversión'], [5, 'años de hoja de ruta']],
  cuerpo => $cuerpo);
}

# ================================================================ 4. Proceso formativo
{
my $cuerpo = '';
$cuerpo .= seccion(id => 'objetivos', eyebrow => 'Objetivos del proceso formativo', titulo => 'Formar a quienes acompañan para llegar a cada emprendedora', decor => 'patron-puntos',
  html => <<'HTML');
                <aside class="recuadro calido aparece" style="max-width:52rem;margin-top:1.4rem"><p class="recuadro-titulo">Objetivo general</p><p>Fortalecer las capacidades socioemocionales, técnicas, administrativas y comerciales de las 200 emprendedoras de la Red de Mujeres del Caribe —y, a través de ellas, de sus familias, sus negocios y sus comunidades— mediante una ruta formativa en cascada, basada en el Diseño Centrado en las Personas, que forma a las 24 dinamizadoras territoriales para acompañarlas hacia su autonomía económica y el ejercicio de su liderazgo comunitario.</p></aside>
                <div class="dos-col" style="margin-top:1.6rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Metodológicos</h3>
                        <ol class="requisitos">
                            <li>Una ruta semana a semana —secuencia, tiempos, actividades, trabajo autónomo, evidencias y guías— que cada satélite adapte sin perder fidelidad al modelo.</li>
                            <li>Formar a las 24 dinamizadoras, con la plataforma y la transferencia semanal de la Secretaría Técnica, para replicar la ruta con las 200 emprendedoras.</li>
                            <li>Dejar en la plataforma una caja de herramientas permanente para la Red y los CIC.</li>
                        </ol>
                    </div>
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Técnicos</h3>
                        <ol class="requisitos">
                            <li>Herramientas prácticas de costos y finanzas básicas, comercialización y administración.</li>
                            <li>Desarrollo socioemocional, autoestima, resiliencia y proyecto de vida.</li>
                            <li>Conocimiento de los derechos de las mujeres, prevención de violencias basadas en género (VBG) y participación ciudadana.</li>
                        </ol>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'cascada', eyebrow => 'Formación en cascada', titulo => 'De la Secretaría a los satélites, y de los satélites a cada mujer',
  intro => 'El propósito no es dictar talleres, sino instalar capacidades en el territorio: que, al terminar el proyecto, las organizaciones de la Red sigan fortaleciendo por sí mismas a sus emprendedoras.',
  html => tabla('Esquema operativo de la cascada formativa del CIC.', ['Nivel', 'Qué recibe', 'Cómo lo recibe', 'Qué entrega al siguiente nivel'], [
    ['1. Secretaría Técnica (5 personas)', 'El modelo metodológico completo del CIC.', '32 horas de transferencia metodológica.', 'La ruta traducida a la realidad de cada satélite y la transferencia de cada semana antes de ejecutarla.'],
    ['2. Satélites (8 satélites, 24 dinamizadoras)', 'El curso de gestión del CIC y la transferencia semanal de la ruta.', 'Curso virtual de 2 horas en la plataforma y encuentros de transferencia con la Secretaría.', 'Las seis sesiones individuales del HACER y los cuatro talleres del SER.'],
    ['3. Emprendedoras (200 mujeres)', 'La ruta HACER-SER.', '28 horas: sesiones individuales presenciales y talleres presenciales y virtuales.', 'Evidencias, datos y retroalimentación que suben a la plataforma y mejoran el modelo.'],
  ]) . <<'HTML' . tabla('Horas del proceso formativo. Por emprendedora, la formación directa suma 28 horas.', ['Componente', 'Quién participa', 'Horas'], [
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Por qué en cascada</h3>
                        <p class="texto-suave">Las capacidades deben fortalecerse a la vez en las personas, las organizaciones y su entorno (PNUD, 2009), y solo se sostienen si se construyen desde adentro, no si se entregan desde afuera (Eade, 1997). El riesgo de la cascada es que el mensaje se diluya de un nivel a otro (Hayes, 2000). El CIC lo previene así:</p>
                        <ul class="lista-check" style="margin-top:.8rem">
                            <li>Guías de facilitación y guiones de sesión verificados por la Secretaría Técnica.</li>
                            <li>Transferencia semana a semana, antes de que cada dinamizadora ejecute la sesión.</li>
                            <li>Retroalimentación constante: plataforma, encuesta después de cada sesión y comités de seguimiento.</li>
                        </ul>
                    </div>
                    <div class="tarjeta aparece" style="background:var(--crema-2)">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Educación popular</h3>
                        <p class="texto-suave">En la tradición de Freire (1970), la formación parte de la experiencia de las participantes y la problematiza, en lugar de «depositar» contenidos. Por eso la ruta siempre trabaja sobre el negocio real de cada emprendedora, con enfoque de desarrollo empresarial: el aprendizaje se mide en decisiones y cambios concretos.</p>
                        <p class="cita" style="font-size:1.05rem">El ser no se aprende sentado en una silla, sino en el roce humano diario.</p>
                    </div>
                </div>
HTML
    ['Formación de la Secretaría Técnica', '5 integrantes', '32 h'],
    ['Curso asincrónico de gestión del CIC', '24 dinamizadoras y Secretaría Técnica', '2 h'],
    ['Ruta HACER (6 semanas × 2 h)', '200 emprendedoras, de forma individual', '12 h'],
    ['Ruta SER (4 talleres × 4 h)', '200 emprendedoras, en grupos', '16 h'],
    ['<b>Total del proceso formativo</b>', '', '<b>62 h</b>'],
  ]));
$cuerpo .= seccion(id => 'alcance', eyebrow => 'Alcance y modalidad', titulo => 'Qué cubre, dónde y de qué forma', decor => 'patron-ondas animado', lado => 'izquierda',
  html => tabla('Modalidad de cada contenido. Para lo virtual, el contrato prevé paquetes de datos para celular.', ['Contenido', 'Para quién', 'Modalidad', 'Dónde'], [
    ['Formación de la Secretaría Técnica', 'Secretaría Técnica', 'Mixta, virtual y presencial', 'Sala virtual (3 jornadas de 4 horas) y dos jornadas de 10 horas de trabajo'],
    ['<a class="enlace" href="{{P}}cursos/gestion-cic/">Curso de gestión del CIC</a> (5 módulos)', 'Dinamizadoras y Secretaría Técnica', 'Virtual asincrónica', 'Plataforma'],
    ['Transferencia semanal de la ruta', 'Dinamizadoras', 'Presencial o virtual sincrónica, con guías en la plataforma', 'Sede del satélite o sala virtual'],
    ['<a class="enlace" href="{{P}}rutas/hacer/">Ruta HACER</a>, semanas 1 a 6', 'Emprendedoras', 'Presencial, individual', 'Lugar de trabajo de la emprendedora o sede del satélite'],
    ['<a class="enlace" href="{{P}}rutas/ser/">Talleres SER 1 y SER 3</a>', 'Emprendedoras, en grupo', 'Presencial', 'Espacios de las organizaciones o centros comunitarios'],
    ['Talleres SER 2 y SER 4', 'Emprendedoras, en grupo', 'Virtual sincrónica', 'Sala virtual, con materiales en la plataforma'],
    ['Guías de la emprendedora y <a class="enlace" href="{{P}}recursos/">caja de herramientas</a>', 'Emprendedoras, organizaciones y CIC', 'Virtual asincrónica', 'Plataforma'],
  ]) . <<'HTML');
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Qué cubre</h3>
                        <ul class="lista-check">
                            <li>La formación de las 24 dinamizadoras: el curso de gestión del CIC y la transferencia semanal de la ruta.</li>
                            <li>La ruta de las 200 emprendedoras: 12 horas individuales (HACER) y 16 horas en grupo (SER).</li>
                            <li>8 satélites en 7 departamentos y 13 municipios.</li>
                            <li>La plataforma digital, que aloja el curso, las guías, la caja de herramientas y las constancias.</li>
                        </ul>
                    </div>
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Qué no cubre</h3>
                        <ul class="lista-check">
                            <li>La constitución formal de las UMC y la meta de 10 grupos de financiamiento solidario: tienen su propio documento técnico.</li>
                            <li>La dotación de activos productivos: la ruta prepara el plan de inversión para alinearse con ella.</li>
                            <li>La herramienta digital de gestión del centro, planteada como una fase posterior.</li>
                        </ul>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'participantes', eyebrow => 'Población', titulo => 'Quiénes participan',
  intro => 'La unidad productiva es el negocio; la emprendedora es la mujer que lo lidera. La formación se dirige a ella, porque es quien transforma su mentalidad y lleva el cambio a su familia, su negocio y su comunidad.',
  html => tarjetas('r3',
    ['bg-menta', '200', 'Emprendedoras', 'Mujeres de la economía popular del Caribe con negocios activos, individuales o asociativos, vinculadas a la Red a través de sus organizaciones. Se priorizan mujeres de comunidades étnicas, víctimas del conflicto, con discapacidad o en pobreza extrema, jóvenes, rurales y urbanas.'],
    ['bg-durazno', '24', 'Dinamizadoras territoriales', 'Mujeres de la Red, tres por satélite (acompañamiento, acceso a mercados y acceso a financiamiento), con experiencia comunitaria y reconocimiento en su territorio.'],
    ['bg-agua', '5', 'Secretaría Técnica', 'Dirección Ejecutiva, Dirección Estratégica y Política del Proyecto, y las secretarías de Acompañamiento, Acceso a Mercados y Acceso a Financiamiento.'],
  ) . <<'HTML');
                <div class="tarjeta aparece" style="margin-top:1.6rem">
                    <h3 style="font-size:1.25rem;margin-bottom:.4rem">Lo que suele encontrarse en el territorio</h3>
                    <p class="texto-suave" style="margin-bottom:.9rem">Rasgos frecuentes que cada dinamizadora confirma o descarta en el primer encuentro. Los negocios van de la agroindustria y los alimentos a las artesanías, las confecciones, el turismo comunitario, los servicios y la economía cultural y ambiental.</p>
                    <ul class="lista-check columnas-2">
                        <li>Se vende a familiares, amigos y vecinos; casi nunca fuera de ese círculo.</li>
                        <li>El dinero del negocio y el del hogar se mezclan.</li>
                        <li>El precio se fija mirando a la competencia, sin contar los costos invisibles.</li>
                        <li>Miedo a los números y poca práctica de registro.</li>
                        <li>Dependencia del crédito informal «gota a gota».</li>
                        <li>Poco contacto con actores de soporte, compradores y entidades financieras.</li>
                        <li>Alta carga de trabajo de cuidado: la formación debe ser corta, práctica y cercana.</li>
                        <li>Trayectorias diversas: hay mujeres con mucha «chispa» y otras en duelo o alta vulnerabilidad. La ruta acoge ambas.</li>
                    </ul>
                </div>
HTML
$cuerpo .= seccion(id => 'metodologia', eyebrow => 'Metodología', titulo => 'Diseño Centrado en las Personas', decor => 'patron-puntos',
  intro => 'Por ser un centro de innovación, el CIC necesita una forma de gestionar la innovación. Adopta el Diseño Centrado en las Personas (<i>Human-Centered Design</i>, HCD) de IDEO.org (2015), creado para comunidades de bajos ingresos: quienes enfrentan un problema son quienes mejor lo conocen, y las soluciones se diseñan con ellas. Sus tres fases no son lineales y se aplican en dos niveles a la vez.',
  html => tabla('Las tres fases del HCD aplicadas al CIC.', ['Fase', 'Pregunta', 'En la gestión del centro', 'En el acompañamiento a la emprendedora', 'Dónde ocurre'], [
    ['Inspiración', '¿Quiénes son las personas y qué necesitan de verdad?', 'Leer el territorio y escuchar a las mujeres «originarias» y a las organizaciones de la Red.', 'Entender la dinámica real del negocio sin juzgar y mirar el mercado más allá de la cuadra.', 'Semanas 1 y 3; SER 1'],
    ['Ideación', '¿Qué oportunidades hay y cómo podrían resolverse?', 'Priorizar necesidades por satélite, ajustar el plan de capacitación y diseñar alianzas.', 'Describir el negocio, explorar nuevas fuentes de ingreso, prototipar un cambio y recalcular el precio.', 'Semanas 2 y 4; SER 2'],
    ['Implementación', '¿Cómo se lleva a la vida real y se sostiene?', 'Pilotear servicios y usar los datos de la plataforma, las encuestas y los comités para mejorar.', 'Salir a vender con un plan comercial, formular el plan de inversión y vincularse a la UMC.', 'Semanas 5 y 6; SER 3 y SER 4'],
  ]) . <<'HTML');
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Siete actitudes que se cultivan</h3>
                        <p class="texto-suave">En la Secretaría, en las dinamizadoras y en las emprendedoras:</p>
                        <div class="llevas" style="margin-top:.8rem"><span class="chip bg-menta">Confianza creativa</span><span class="chip bg-durazno">Hacer para pensar</span><span class="chip bg-coral">Aprender del fracaso</span><span class="chip bg-mantequilla">Empatía</span><span class="chip bg-agua">Abrazar la ambigüedad</span><span class="chip bg-lavanda">Optimismo</span><span class="chip bg-menta">Iterar</span></div>
                    </div>
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Los cinco momentos de cada sesión</h3>
                        <p class="texto-suave">Inspirados en el ciclo de aprendizaje experiencial de Kolb (1984): se aprende haciendo, reflexionando y volviendo a aplicar.</p>
                        <ol class="requisitos" style="margin-top:.9rem">
                            <li><span><b>Empatía (antes de la sesión):</b> la dinamizadora se prepara y ajusta los materiales.</span></li>
                            <li><span><b>Introducción:</b> para qué sirve la sesión y cómo se conecta con lo anterior.</span></li>
                            <li><span><b>Asimilación:</b> la herramienta o el concepto, con ejemplos del territorio.</span></li>
                            <li><span><b>Aplicación:</b> la emprendedora la usa en su propio negocio o su propia vida.</span></li>
                            <li><span><b>Cierre y trabajo autónomo:</b> se registra la evidencia y se acuerda la tarea.</span></li>
                        </ol>
                    </div>
                </div>
HTML
$cuerpo .= seccion(id => 'macrotemas', eyebrow => 'Contenidos', titulo => '19 temáticas en siete macrotemas',
  intro => 'Las 19 temáticas del contrato se agrupan en cuatro macrotemas del HACER y tres del SER. Como la ruta dura seis semanas, se prioriza lo infaltable y lo demás se profundiza con la caja de herramientas. Cada temática tiene un código: C1 es el componente del SER y C2 el del HACER.',
  html => tabla('Qué logra la emprendedora en cada macrotema.', ['Macrotema', 'Ruta', 'Qué logra la emprendedora', 'Temáticas', 'Prioridad'], [
    ['Costos y finanzas básicas', 'HACER', 'Calcula lo que le cuesta producir, fija su precio con criterio, conoce su punto de equilibrio y separa el dinero del hogar y del negocio.', 'C2.3', 'Núcleo infaltable'],
    ['Comercialización y mercados', 'HACER', 'Entiende su mercado, arma su oferta y su <i>pitch</i>, y busca clientes nuevos más allá de su círculo cercano.', 'C2.4 · C2.5 · C2.8', 'Núcleo infaltable'],
    ['Administración básica y planeación', 'HACER', 'Registra su negocio a diario, lo describe con claridad y planea con metas y un plan de inversión.', 'C2.2 · C2.1', 'Núcleo infaltable'],
    ['Sostenibilidad: innovación, asociatividad y formalización', 'HACER', 'Prueba cambios de bajo costo, conoce el ahorro y crédito entre pares y da un primer paso de formalización.', 'C2.9 · C2.6 · C2.7', 'Se introduce y se profundiza con la caja de herramientas'],
    ['Habilidades socioemocionales', 'SER', 'Se reconoce como gerenta, maneja el miedo, decide con información y proyecta su vida a un año.', 'C1.1 · C1.3 · C1.4 · C1.6', 'Núcleo del SER'],
    ['Liderazgo, convivencia y participación', 'SER', 'Lidera, se comunica con asertividad, resuelve conflictos y participa en espacios comunitarios.', 'C1.2 · C1.5 · C1.7 · C1.10', 'Núcleo del SER'],
    ['Derechos y vida libre de violencias', 'SER', 'Conoce sus derechos y las rutas de atención y protección de su territorio.', 'C1.8 · C1.9', 'Núcleo del SER'],
  ]) . <<'HTML');
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <p class="eyebrow">C1 · Componente SER</p>
                        <ul class="codigos">
                            <li><b>C1.1</b> Autoestima y confianza personal</li>
                            <li><b>C1.2</b> Liderazgo comunitario y participación ciudadana</li>
                            <li><b>C1.3</b> Resiliencia y habilidades socioemocionales</li>
                            <li><b>C1.4</b> Proyecto de vida</li>
                            <li><b>C1.5</b> Comunicación asertiva y trabajo en equipo</li>
                            <li><b>C1.6</b> Toma de decisiones y autonomía económica</li>
                            <li><b>C1.7</b> Resolución pacífica de conflictos</li>
                            <li><b>C1.8</b> Derechos de las mujeres y mecanismos de protección</li>
                            <li><b>C1.9</b> Prevención de violencias basadas en género</li>
                            <li><b>C1.10</b> Incidencia en espacios comunitarios y organizativos</li>
                        </ul>
                    </div>
                    <div class="tarjeta aparece">
                        <p class="eyebrow">C2 · Componente HACER</p>
                        <ul class="codigos">
                            <li><b>C2.1</b> Planeación estratégica</li>
                            <li><b>C2.2</b> Administración básica</li>
                            <li><b>C2.3</b> Costos y finanzas</li>
                            <li><b>C2.4</b> Comercialización y mercadeo</li>
                            <li><b>C2.5</b> Marketing digital y relacional</li>
                            <li><b>C2.6</b> Economía solidaria y asociatividad</li>
                            <li><b>C2.7</b> Formalización progresiva</li>
                            <li><b>C2.8</b> Acceso a nuevos mercados</li>
                            <li><b>C2.9</b> Innovación y sostenibilidad empresarial</li>
                        </ul>
                    </div>
                </div>
HTML
my @hilo = (
  ['Lo que la emprendedora ya sabe de su negocio', 'Radiografía del negocio y registro diario', 'El Canvas (semana 2) y los costos (semana 4)'],
  ['La radiografía del negocio', 'Canvas de la Esquina y prototipo de una nueva fuente de ingreso', 'La lectura de tendencias (semana 3) y la oferta comercial (semana 5)'],
  ['El prototipo en prueba', 'Matriz de tendencias y ajuste del prototipo', 'El nuevo precio (semana 4) y el plan comercial (semana 5)'],
  ['El registro diario y el prototipo ajustado', 'Nuevo precio y punto de equilibrio', 'La meta comercial (semana 5) y el plan de inversión (semana 6)'],
  ['El precio, el punto de equilibrio y la nueva fuente de ingreso', 'Plan comercial, «Mi CRM» y meta de ventas', 'Las necesidades de inversión (semana 6)'],
  ['Los resultados comerciales, el flujo de caja y el PyG', 'Plan de inversión e interés en la UMC', 'La dotación de activos y las Unidades de Microfinanciamiento Comunitario'],
);
my @ser_semana = (1 => 1, 3 => 2, 5 => 3, 6 => 4);
my %ser_semana = @ser_semana;
my @nombres_ser = ('', 'Autoestima, identidad de gerenta y proyecto de vida · presencial', 'Pensamiento crítico, resiliencia y toma de decisiones · virtual', 'Liderazgo, derechos y vida libre de violencias · presencial', 'Tejido social, comunicación asertiva y resolución de conflictos · virtual');
my $n = 0;
my $filas_hilo = [ map { $n++; my $s = $ser_semana{$n};
    [qq{<a class="enlace" href="{{P}}rutas/hacer/semana-$n/">Semana $n</a>}, $_->[0], $_->[1], $_->[2],
     $s ? qq{<a class="enlace" href="{{P}}rutas/ser/taller-$s/">SER $s</a><br><small>$nombres_ser[$s]</small>} : '—'] } @hilo ];
$cuerpo .= seccion(id => 'hilo', eyebrow => 'Ruta HACER-SER', titulo => 'Un hilo conductor de seis semanas', decor => 'patron-ondas animado', lado => 'izquierda',
  intro => 'Cada semana parte de lo producido en la anterior y deja un insumo para la siguiente: la ruta no es un conjunto de talleres sueltos, sino una sola línea de trabajo sobre el negocio de cada emprendedora. El HACER es individual (2 horas por semana); el SER, grupal (4 horas por taller), y cada taller dedica una hora a aplicar lo vivido en el negocio.',
  html => tabla('Cómo se encadenan las semanas del HACER y los talleres del SER (secuencia sugerida).', ['Semana', 'Parte de', 'Produce', 'Alimenta', 'Taller SER'], $filas_hilo)
    . qq{                <p class="texto-suave aparece" style="margin-top:1.2rem;max-width:52rem">Cada satélite programa la ruta en su <b>plan de capacitación</b> (anexo A21): define fechas, asigna emprendedoras a cada dinamizadora, programa los talleres y registra los ajustes locales, respetando sesiones, horas y evidencias. Las guías de cada semana y taller están en <a class="enlace" href="{{P}}#rutas">Talleres</a>.</p>\n});
$cuerpo .= seccion(id => 'secretaria', eyebrow => 'Donde empieza la cascada', titulo => 'La formación de la Secretaría Técnica',
  intro => 'Sus cinco integrantes recibieron 32 horas de transferencia metodológica. Cada metodología tuvo una fase de fundamentación y otra de práctica sobre un caso común, un cuestionario y una tarea, y quedó en una guía de estudio. Después, la Secretaría las tradujo al lenguaje del barrio y la vereda y las convirtió en las seis semanas del HACER.',
  html => tabla('Las cinco metodologías transferidas a la Secretaría Técnica y su traducción en la ruta.', ['Metodología', 'Qué permite', 'Pilar', 'Dónde llega a las emprendedoras'], [
    ['Método Insight', 'Declarar un problema (persona, necesidad, dificultad y expectativa) y construir una solución a partir de un hallazgo no evidente. Once pasos, de construcción propia.', 'Acompañamiento integral', 'Semana 1: las cinco preguntas del negocio.'],
    ['Tren fundamental', 'Encontrar una oportunidad significativa emergente cruzando necesidades básicas, innovaciones presentes y conductores de cambio.', 'Acceso a mercados', 'Semana 3: la matriz de tendencias.'],
    ['Lean Startup', 'Validar productos y modelos de negocio rápido y con poco dinero, con un producto mínimo viable y ciclos de construir, lanzar y aprender.', 'Acompañamiento y mercados', 'Semana 2: el prototipo. Semana 5: la prueba con clientes nuevos.'],
    ['Lienzo de modelo de negocio', 'Entender un negocio en nueve bloques (deseabilidad, factibilidad y viabilidad) y explorar otras fuentes de ingreso.', 'Acompañamiento y mercados', 'Semana 2: Canvas de la Esquina. Semana 6: la nueva configuración de valor.'],
    ['Gestión financiera', 'Fijar el precio con tres referentes (costo, mercado y valor percibido), construir el estado de resultados y la cascada de utilidades, y fijar una política de bolsillos.', 'Acceso a financiamiento', 'Semana 4: costos, precio y punto de equilibrio. Semana 6: flujo de caja y plan de inversión.'],
  ]));
$cuerpo .= seccion(id => 'plataforma', eyebrow => 'La plataforma', titulo => 'Qué aloja la plataforma de formación', decor => 'patron-puntos',
  intro => 'Un entorno web en la nube, con registro de usuarias y seguimiento del avance. Es esta plataforma.',
  html => tarjetas('r4',
    ['bg-agua', '1', 'Curso de gestión del CIC', 'Obligatorio para dinamizadoras y Secretaría Técnica. <a class="enlace" href="{{P}}cursos/gestion-cic/">Ver el curso</a>'],
    ['bg-durazno', '2', 'Ruta HACER', 'Por semana: guía de facilitación con video, guion verificado por la Secretaría y plantillas. <a class="enlace" href="{{P}}cursos/acompanar-hacer/">Ver el curso</a>'],
    ['bg-lavanda', '3', 'Ruta SER', 'Las guías de los cuatro talleres y sus materiales. <a class="enlace" href="{{P}}cursos/facilitar-ser/">Ver el curso</a>'],
    ['bg-mantequilla', '4', 'Caja de herramientas', 'Guías, plantillas (A1 a A24) y profundización para usar después del proyecto. <a class="enlace" href="{{P}}recursos/">Ver la biblioteca</a>'],
  ) . qq{                <p class="texto-suave aparece" style="margin-top:1.2rem;max-width:52rem">Además: grabaciones y material audiovisual, foros para preguntas entre sesiones, registro de asistencia, avance de cada emprendedora y su negocio, y expedición de constancias. Las emprendedoras consultan la guía de cada semana, que les explica paso a paso sus actividades.</p>\n});
my @evid = (
  ['Semana 1', 'Diario de Empatía Financiera y Productiva. Registro diario iniciado. Ficha de la unidad productiva creada.', 'C1.1, C2.2, C2.3, C2.4'],
  ['Semana 2', 'Canvas de la Esquina con nuevas fuentes de ingreso. Prototipo de cambio y plan de prueba.', 'C2.1, C2.4, C2.9'],
  ['Semana 3', 'Matriz de tendencias. Ajuste al prototipo de la semana 2.', 'C1.3, C1.6, C2.1, C2.4, C2.9'],
  ['Semana 4', 'Ejercicio de los dos bolsillos. Costos, nuevo precio y punto de equilibrio. Registro diario activo y tarea guiada.', 'C1.6, C2.2, C2.3'],
  ['Semana 5', 'Plan comercial de una página con meta. «Mi CRM» con al menos cinco clientes potenciales. Paso de formalización identificado.', 'C1.1, C1.2, C2.4, C2.5, C2.7, C2.8'],
  ['Semana 6', 'Plan de inversión simplificado. Portafolio completo del HACER. Interés de vincularse a una UMC.', 'C1.6, C1.10, C2.1, C2.3, C2.6, C2.9'],
  ['SER 1', 'Árbol de vida, mapa de sueños y tarjeta de «gerenta».', 'C1.1, C1.4, C2.4'],
  ['SER 2', 'Decisión analizada con su primer paso y registro «lo que ya no me da miedo».', 'C1.3, C1.6, C2.4, C2.9'],
  ['SER 3', 'Directorio de rutas de atención, mapa de espacios de participación y compromiso de liderazgo.', 'C1.1, C1.2, C1.8, C1.9, C1.10, C2.4'],
  ['SER 4', 'Protocolo de resolución de conflictos practicado y acuerdos de corresponsabilidad del grupo.', 'C1.5, C1.7, C1.10, C2.6'],
);
$cuerpo .= seccion(id => 'evaluacion', eyebrow => 'Evaluación y constancias', titulo => 'Cómo se verifica lo aprendido',
  intro => 'El interés de fondo es tener datos: saber qué pasa con cada emprendedora, cuánto apropió y dónde tuvo dificultades, para mejorar la ruta en cada ciclo.',
  html => <<'HTML' . tabla('Portafolio de evidencias de la emprendedora y temáticas que verifica cada sesión.', ['Sesión', 'Evidencia', 'Temáticas que verifica'], \@evid) . <<'HTML2');
                <div class="dos-col" style="margin-top:1.4rem">
                    <div class="tarjeta aparece">
                        <p class="eyebrow">Dinamizadoras</p>
                        <h3 style="font-size:1.25rem;margin:.4rem 0 .9rem">Cuestionario por módulo</h3>
                        <p class="texto-suave">Cada módulo del curso termina con un cuestionario y hay dos intentos: si en el segundo la calificación es inferior al 70 %, el módulo se bloquea hasta repetirlo. Además, la Secretaría verifica en la transferencia semanal que cada dinamizadora domine la sesión.</p>
                    </div>
                    <div class="tarjeta aparece">
                        <p class="eyebrow">Emprendedoras</p>
                        <h3 style="font-size:1.25rem;margin:.4rem 0 .9rem">Un portafolio, no un examen</h3>
                        <p class="texto-suave">Se evalúa con el portafolio de evidencias: las herramientas diligenciadas, o con un avance importante. Como cada evidencia sale de actividades ligadas a temáticas concretas, el portafolio muestra qué trabajó cada una.</p>
                    </div>
                </div>
HTML
                <div class="dos-col" style="margin-top:2rem">
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Instrumentos de seguimiento</h3>
                        <ul class="lista-check">
                            <li><span><b>Lista de chequeo por sesión (A18):</b> asistencia, momentos de la agenda y evidencias.</span></li>
                            <li><span><b>Bitácora de avance (A19):</b> cambios y dificultades de cada unidad productiva.</span></li>
                            <li><span><b>Evidencias en tiempo real:</b> fotos del espacio y de las herramientas al terminar cada sesión.</span></li>
                            <li><span><b>Encuesta a la dinamizadora (A20):</b> las dificultades reales de la emprendedora para aprender.</span></li>
                            <li><span><b>Reporte semanal del satélite:</b> se genera con lo registrado y llega a la Secretaría.</span></li>
                        </ul>
                        <p class="texto-suave" style="margin-top:.9rem;font-size:.92rem">La Secretaría entrena a las dinamizadoras antes de cada semana, revisa los reportes y hace al menos tres comités de seguimiento presenciales con el equipo territorial.</p>
                    </div>
                    <div class="tarjeta aparece" style="background:var(--crema-2)">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Requisitos de la constancia</h3>
                        <p style="font-weight:700;color:var(--bosque)">Dinamizadora territorial</p>
                        <ul class="lista-check" style="margin:.5rem 0 1rem">
                            <li>Curso de gestión del CIC completo: 5 módulos aprobados con al menos 70 %.</li>
                            <li>Participación en la transferencia de la ruta.</li>
                            <li>Ruta facilitada con su grupo, con listas de chequeo, bitácoras y evidencias al día.</li>
                        </ul>
                        <p style="font-weight:700;color:var(--bosque)">Emprendedora</p>
                        <ul class="lista-check" style="margin-top:.5rem">
                            <li>Las 6 semanas del HACER. Si falta a una, la recupera con dos sesiones la semana siguiente.</li>
                            <li>Al menos 3 de los 4 talleres del SER.</li>
                            <li>Portafolio con las evidencias de las sesiones.</li>
                        </ul>
                        <p class="texto-suave" style="margin-top:.9rem;font-size:.9rem">La constancia la expide la plataforma tras verificar asistencia y requisitos. No es un título académico. <a class="enlace" href="{{P}}#verificar">Verificar una constancia</a></p>
                    </div>
                </div>
HTML2
$cuerpo .= seccion(id => 'paso-a-paso', eyebrow => 'En resumen', titulo => 'El proceso, paso a paso', decor => 'patron-ondas animado', lado => 'izquierda',
  html => <<'HTML');
                <div class="dos-col" style="margin-top:1.4rem">
                    <ol class="requisitos tarjeta aparece">
                        <li>La Secretaría Técnica recibe el modelo completo y lo traduce a la realidad de cada satélite.</li>
                        <li>Las 24 dinamizadoras completan el curso de gestión del CIC en la plataforma.</li>
                        <li>Cada satélite elabora su plan de capacitación con el cronograma de temáticas.</li>
                        <li>Antes de cada semana, la Secretaría transfiere la sesión a las dinamizadoras.</li>
                        <li>Las dinamizadoras hacen las seis sesiones del HACER con cada emprendedora y los cuatro talleres del SER.</li>
                        <li>Cada sesión deja evidencias, registros y una encuesta en la plataforma.</li>
                        <li>La Secretaría revisa los reportes semanales y ajusta lo necesario en los comités.</li>
                        <li>Al cerrar la ruta se verifican los requisitos y se expiden las constancias.</li>
                    </ol>
                    <div class="tarjeta aparece">
                        <h3 style="font-size:1.25rem;margin-bottom:.9rem">Recomendaciones</h3>
                        <ul class="lista-check">
                            <li>Entrenar muy bien cada semana antes de ejecutarla: la calidad de la cascada depende de eso.</li>
                            <li>Respetar la esencia de cada sesión, adaptando ejemplos y casos al territorio: la ruta es un marco, no un libreto rígido.</li>
                            <li>Priorizar la acción: cada sesión termina con un compromiso concreto.</li>
                            <li>Cuidar el registro de datos desde el primer día: sin datos no hay evaluación ni mejora.</li>
                            <li>Alinear los planes de inversión con la dotación de activos, y el interés en las UMC con el documento de grupos de financiamiento solidario.</li>
                        </ul>
                        <p class="texto-suave" style="margin-top:1rem;font-size:.92rem">El documento formativo se aplica a sí mismo el diseño centrado en las personas: es un prototipo. Al cerrar cada ciclo, la Secretaría analiza los datos, revisa las encuestas, recoge las adaptaciones de cada satélite y publica una nueva versión.</p>
                    </div>
                </div>
HTML
pagina(actual => 'formacion', seo_titulo => 'Proceso formativo del CIC · formación en cascada', h1_corto => 'Proceso formativo del CIC',
  desc => 'El proceso formativo del CIC: formación en cascada, Diseño Centrado en las Personas, 19 temáticas, ruta HACER-SER de 28 horas, evaluación y constancias.',
  eyebrow => 'Proceso formativo', h1 => 'Formar a quien forma: el conocimiento baja en cascada.',
  lead => 'La formación está dirigida a las mujeres emprendedoras: son ellas quienes transforman su forma de pensar y de actuar, y ese cambio llega a su familia, su negocio y su comunidad. La Secretaría Técnica, las dinamizadoras y la plataforma existen para que ese aprendizaje ocurra con calidad en cada territorio.',
  cifras => [[62, 'horas de formación'], [28, 'horas por emprendedora'], [19, 'temáticas'], [7, 'macrotemas']],
  cuerpo => $cuerpo);
}

# ================================================================ 5. Glosario
{
my @TERMINOS = (
  ['APRODEFA', 'Asociación Pro-desarrollo de Familias. Ejecuta el proyecto en representación de la Red de Mujeres del Caribe.'],
  ['Bloque aplicado al HACER', 'Última hora de cada taller del SER, en la que el grupo aplica lo vivido en el taller a lo trabajado en su negocio esa semana.'],
  ['Canvas de la Esquina', 'Versión simplificada del lienzo de modelo de negocio de Osterwalder y Pigneur (2010), traducida al lenguaje del barrio y la vereda, con tres preguntas vitales: amplitud perceptual, atributo de valor y diversificación de ingresos.'],
  ['Cascada de utilidades', 'Forma de ver cuánto gana de verdad el negocio en tres escalones: utilidad operacional, utilidad neta (después de intereses e impuestos) y utilidad líquida (lo que queda disponible para ahorrar, reinvertir o repartir).'],
  ['CIC', 'Centro de Innovación Comunitaria: institución de gestión del conocimiento y de «software social» para la autonomía económica de las mujeres de la Red de Mujeres del Caribe.'],
  ['Círculos de Aprendizaje Subregionales', 'Grupos de dinamizadoras de una misma subregión que se transfieren soluciones de un satélite a otro.'],
  ['Constancia de participación', 'Documento que expide la plataforma cuando una participante cumple los requisitos de asistencia y evidencias. No es un título académico.'],
  ['Convenio 432', 'Convenio entre el Ministerio de Igualdad y Equidad y FUPAD, en el marco del Fondo de Igualdad (FONIGUALDAD), del que se deriva el proyecto.'],
  ['CRM', 'Gestión de relaciones con clientes (<i>Customer Relationship Management</i>). En la ruta, «Mi CRM» es un formato sencillo para registrar clientes potenciales, sus datos y quién puede conectar con ellos.'],
  ['Dinamizadora territorial', 'Mujer de la Red de Mujeres del Caribe que acompaña a las emprendedoras en su satélite. Hay 24, tres por satélite: acompañamiento, acceso a mercados y acceso a financiamiento.'],
  ['Diseño Centrado en las Personas (HCD)', 'Metodología de innovación de IDEO.org que diseña soluciones con las personas, en tres fases: inspiración, ideación e implementación.'],
  ['Emprendedora', 'Mujer que lidera una unidad productiva. Es la destinataria de la formación.'],
  ['FUCOLDE', 'Fundación Colombiana para el Desarrollo. Entidad contratante del proceso formativo con APRODEFA.'],
  ['FUPAD', 'Fundación Panamericana para el Desarrollo. Operador del Convenio 432.'],
  ['Gota a gota', 'Préstamo informal de muy alto interés y cobro diario, frecuente en la economía popular.'],
  ['Hito cognitivo', 'Lo que se espera a los seis meses: que la emprendedora problematice con rigor, extraiga hallazgos de su entorno y prototipe y valide soluciones.'],
  ['IDEO / IDEO.org', 'IDEO es una firma de diseño de Estados Unidos que difundió el pensamiento de diseño; IDEO.org es su organización sin ánimo de lucro para comunidades de bajos ingresos.'],
  ['Margen de contribución', 'Lo que queda de cada venta después de pagar el costo variable de la unidad vendida; sirve para cubrir los costos fijos y generar ganancia.'],
  ['Matriz de Madurez Organizacional (MMO)', 'Evaluación de 1 a 100 que aplica un tercero independiente a las organizaciones candidatas a satélite, en gobernanza, infraestructura y capacidad de absorción.'],
  ['Nodo', 'Estructura departamental de la Red de Mujeres del Caribe. Hay 7, uno por departamento; no es lo mismo que un satélite.'],
  ['Pensamiento de diseño', 'Enfoque de innovación que busca soluciones deseables para las personas, factibles técnicamente y viables económicamente (Brown, 2009). El HCD es su adaptación al trabajo social.'],
  ['Pitch', 'Presentación corta y convincente del negocio o del producto ante un posible cliente o aliado.'],
  ['Pivotar', 'Cambiar la forma en que el negocio gana dinero sin perder lo que ya hace bien.'],
  ['Plan MEL', 'Plan de Monitoreo y Evaluación del proyecto, con seis indicadores contractuales (I1 a I6).'],
  ['Prototipo', 'Versión sencilla y barata de una idea (un cartel, una oferta, una muestra) para probarla antes de invertir.'],
  ['Punto de equilibrio', 'Cantidad que hay que vender en un periodo (día, semana o mes) para cubrir todos los costos sin ganar ni perder.'],
  ['PyG', 'Estado de pérdidas y ganancias o estado de resultados: resumen de ingresos, costos y gastos de un periodo.'],
  ['Red de Mujeres del Caribe', 'Red de organizaciones de mujeres del Caribe colombiano con más de 30 años de trayectoria, dueña de la metodología del CIC.'],
  ['RUES / RUT', 'Registro Único Empresarial y Social / Registro Único Tributario. Registros básicos para formalizar un negocio en Colombia.'],
  ['Satélite', 'Unidad operativa del CIC en el territorio. Hay 8: uno por departamento, excepto Cesar, que tiene dos.'],
  ['Secretaría Técnica', 'Equipo central del CIC, de 5 personas: Dirección Ejecutiva, Dirección Estratégica y Política del Proyecto, y las secretarías de Acompañamiento, Acceso a Mercados y Acceso a Financiamiento.'],
  ['Software social', 'Conjunto de hábitos, reglas, roles y formas de pensar que el CIC instala en las personas y organizaciones, por oposición a la infraestructura física.'],
  ['Solucionismo', 'Riesgo de instalar soluciones tecnológicas o metodológicas complejas sin atacar la raíz de los problemas locales (Morozov, 2013).'],
  ['UMC', 'Unidad de Microfinanciamiento Comunitario: grupo de hasta 19 personas que ahorra y se presta entre sí con reglas propias. Corresponde a los «grupos de financiamiento solidario» o «bankomunales» del contrato.'],
  ['Unidad productiva', 'El negocio o emprendimiento (el puesto, el taller, la iniciativa económica), individual o asociativo. No es la persona.'],
  ['VBG', 'Violencias basadas en género.'],
);
sub ancla { my $t = lc shift; $t =~ tr/áéíóúñü/aeiounu/; $t =~ s/[^a-z0-9]+/-/g; $t =~ s/^-|-$//g; return $t }
my %letras;
my $dl = join "\n", map {
    my ($t, $d) = @$_; my $l = uc substr($t, 0, 1); my $id = ancla($t);
    my $marca = $letras{$l}++ ? '' : qq{ data-letra="$l"};
    qq{                    <div id="$id"$marca class="aparece"><dt>$t</dt><dd>$d</dd></div>}
} @TERMINOS;
# El índice salta al primer término de cada letra
my %primera; for (@TERMINOS) { my $l = uc substr($_->[0], 0, 1); $primera{$l} //= ancla($_->[0]) }
my $indice = join '', map { qq{<a href="#$primera{$_}">$_</a>} } sort keys %primera;
my $refs = join "\n", map { "                        <li>$_</li>" } (
  'Bandura, A. (1997). <i>Self-efficacy: The exercise of control</i>. W. H. Freeman.',
  'Blank, S. (2013). <i>The four steps to the epiphany</i> (2.ª ed.). K&amp;S Ranch.',
  'Brown, T. (2009). <i>Change by design</i>. HarperBusiness.',
  'Brown, T., y Wyatt, J. (2010). Design thinking for social innovation. <i>Stanford Social Innovation Review</i>, 8(1), 30-35.',
  'Dagnino, R. (2010). <i>Tecnologia social: ferramenta para construir outra sociedade</i>. Komedi.',
  'Durston, J. (2000). <i>¿Qué es el capital social comunitario?</i> CEPAL, Serie Políticas Sociales n.º 38.',
  'Eade, D. (1997). <i>Capacity-building: An approach to people-centred development</i>. Oxfam.',
  'Freire, P. (1970). <i>Pedagogía del oprimido</i>. Siglo XXI Editores.',
  'Hasso Plattner Institute of Design at Stanford. (2010). <i>An introduction to design thinking: Process guide</i>.',
  'Hayes, D. (2000). Cascade training and teachers\' professional development. <i>ELT Journal</i>, 54(2), 135-145.',
  'IDEO. (2012). <i>Design thinking for educators</i> (2.ª ed.).',
  'IDEO.org. (2015). <i>The field guide to human-centered design</i>.',
  'Isenberg, D. J. (2010). How to start an entrepreneurial revolution. <i>Harvard Business Review</i>, 88(6), 40-50.',
  'Isenberg, D. J. (2011). <i>The entrepreneurship ecosystem strategy as a new paradigm for economic policy</i>. Babson College.',
  'Kliksberg, B., y Tomassini, L. (comps.). (2000). <i>Capital social y cultura: claves estratégicas para el desarrollo</i>. BID / Fondo de Cultura Económica.',
  'Kolb, D. A. (1984). <i>Experiential learning</i>. Prentice Hall.',
  'Manzini, E. (2015). <i>Design, when everybody designs</i>. MIT Press.',
  'Max-Neef, M. A. (1993). <i>Desarrollo a escala humana</i>. Nordan-Comunidad.',
  'Mello, D. (14 de marzo de 2024). Nascido em Paraisópolis, banco quer ser «BNDES da favela». <i>Agência Brasil</i>.',
  'Morozov, E. (2013). <i>To save everything, click here</i>. PublicAffairs.',
  'Osterwalder, A., y Pigneur, Y. (2010). <i>Business model generation</i>. John Wiley &amp; Sons.',
  'Ostrom, E. (1990). <i>Governing the commons</i>. Cambridge University Press.',
  'Porter, M. E. (1998). Clusters and the new economics of competition. <i>Harvard Business Review</i>, 76(6), 77-90.',
  'Programa de las Naciones Unidas para el Desarrollo. (2009). <i>Capacity development: A UNDP primer</i>.',
  'Putnam, R. D. (2000). <i>Bowling alone</i>. Simon &amp; Schuster.',
  'Radjou, N., Prabhu, J., y Ahuja, S. (2012). <i>Jugaad innovation</i>. Jossey-Bass.',
  'Ries, E. (2011). <i>The lean startup</i>. Crown Business.',
  'Sen, A. (1999). <i>Development as freedom</i>. Oxford University Press.',
  'Yunus, M. (2007). <i>Creating a world without poverty</i>. PublicAffairs.',
);
my $terminos_ld = join ",\n", map { my $d = $_->[1]; $d =~ s/<[^>]+>//g; qq{            { "\@type": "DefinedTerm", "name": "@{[ attr($_->[0]) ]}", "description": "@{[ attr($d) ]}", "url": "$BASE/el-cic/glosario/#@{[ ancla($_->[0]) ]}" }} } @TERMINOS;
my $cuerpo = seccion(id => 'terminos', eyebrow => 'De la A a la V', titulo => 'Términos y siglas', decor => 'patron-puntos',
  intro => 'Para que cualquier lectora o lector —incluidos evaluadores externos y entes de control— entienda el modelo sin ambigüedades. Los términos se usan con el mismo sentido en todos los documentos del proyecto.',
  html => qq{                <nav class="letras" aria-label="Índice alfabético">$indice</nav>\n                <dl class="glosario">\n$dl\n                </dl>\n})
  . seccion(id => 'referencias', eyebrow => 'Bibliografía', titulo => 'Referencias del modelo',
  html => qq{                <div class="tarjeta aparece" style="margin-top:1.4rem">\n                    <ul class="refs">\n$refs\n                    </ul>\n                    <p class="texto-suave" style="margin-top:1rem;font-size:.9rem"><b>Documentos del proyecto:</b> Anexo Técnico del Convenio 432 de 2025; contrato de los procesos formativos entre FUCOLDE y APRODEFA (2026); Modelo Metodológico de los Centros de Innovación Comunitaria (2026).</p>\n                </div>\n});
pagina(actual => 'glosario', seo_titulo => 'Glosario del CIC · términos y siglas del modelo', h1_corto => 'Glosario del CIC',
  desc => 'Glosario del Centro de Innovación Comunitaria: software social, satélite, nodo, UMC, Canvas de la Esquina, punto de equilibrio y más términos y siglas del modelo.',
  eyebrow => 'Glosario', h1 => 'Las palabras del CIC, en claro.',
  lead => 'Los términos y siglas que aparecen en el modelo, en la formación y en las guías: qué significan y cómo se usan en el Centro de Innovación Comunitaria.',
  jsonld => qq{{ "\@type": "DefinedTermSet", "name": "Glosario del Centro de Innovación Comunitaria", "url": "$BASE/el-cic/glosario/", "inLanguage": "es-CO", "hasDefinedTerm": [\n$terminos_ld\n          ] }},
  cuerpo => $cuerpo);
}
