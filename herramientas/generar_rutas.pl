#!/usr/bin/perl
# Genera las páginas de los talleres para emprendedoras y los datos que usa la plataforma:
#   rutas/hacer/ · rutas/ser/            (resumen de cada semana o taller y sus descargas)
#   rutas/hacer/semana-N/ · rutas/ser/taller-N/   (redirigen a su semana: las guías ahora se descargan)
#   assets/datos-cic.js                  (satélites, semanas, talleres y descargas para «Mi semana»)
# Los datos salen de herramientas/Datos.pm. Uso (desde la carpeta LSM_CIC): perl herramientas/generar_rutas.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use JSON::PP;
use Plantilla qw(cabeza cuerpo_inicio final_pagina escribir attr);
use Datos qw(@SATELITES @HACER @SER);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';

# Tamaño legible de cada descarga (y aviso si falta el archivo)
for my $d (map { @{ $_->{descargas} } } @HACER, @SER) {
    my $bytes = -s $d->{ruta} or die "Falta la descarga $d->{ruta}\n";
    $d->{kb} = int($bytes / 1024 + .5);
}
sub tamano { my $kb = shift; return $kb >= 1024 ? sprintf('%.1f MB', $kb / 1024) =~ s/\./,/r : "$kb KB" }

sub botones_descarga {
    my ($P, $lista) = @_;
    return join "\n", map {
        my $icono = $_->{tipo} eq 'Excel' ? 'bg-menta' : 'bg-agua';
        qq{                            <a class="descarga" href="$P$_->{ruta}" download><span class="descarga-icono $icono" aria-hidden="true">@{[ $_->{tipo} eq 'Excel' ? 'XLS' : 'DOC' ]}</span><span><b>$_->{etiqueta}</b><small>$_->{tipo} · @{[ tamano($_->{kb}) ]}</small></span><span class="descarga-flecha" aria-hidden="true">↓</span></a>}
    } @$lista;
}

sub tarjeta {
    my ($P, %t) = @_;
    my $haras = join '', map { "<li>$_</li>" } @{ $t{haras} };
    my $extra = $t{extra} ? qq{\n                        <p class="semana-extra">$t{extra}</p>} : '';
    return <<"HTML";
                    <article id="$t{id}" class="semana-card aparece">
                        <div class="semana-cab">
                            <span class="numero $t{color}">$t{marca}</span>
                            <div><p class="semana-meta">$t{meta}</p><h3>$t{titulo}</h3></div>
                        </div>
                        <p>$t{resumen}</p>
                        <p class="semana-sub">Qué vas a hacer</p>
                        <ul class="lista-check">$haras</ul>
                        <p class="semana-sub">Descarga</p>
                        <div class="descargas">
@{[ botones_descarga($P, $t{descargas}) ]}
                        </div>$extra
                    </article>
HTML
}

sub pagina_ruta {
    my (%r) = @_;
    my $P = '../../';
    my $url = "$BASE/rutas/$r{slug}/";
    my $ficha = join "\n", map { qq{                            <dt>$_->[0]</dt><dd>$_->[1]</dd>} } @{ $r{ficha} };
    my $pasos = join "\n", map { qq{                    <li class="tarjeta tarjeta-num aparece"><span class="numero $r{color}">$_->[0]</span><h3>$_->[1]</h3><p>$_->[2]</p></li>} } @{ $r{pasos} };
    my $items = join ",\n", map { qq{            { "\@type": "ListItem", "position": $_->[0], "name": "@{[ attr($_->[1]) ]}", "url": "$url#$_->[2]" }} } @{ $r{indice} };
    my $jsonld = <<"JSON";
    {
      "\@context": "https://schema.org",
      "\@graph": [
        { "\@type": "Course", "name": "$r{titulo}", "description": "@{[ attr($r{desc}) ]}", "url": "$url",
          "provider": { "\@type": "EducationalOrganization", "name": "Centro de Innovación Comunitaria (CIC)", "url": "$BASE/" },
          "inLanguage": "es-CO", "isAccessibleForFree": true, "educationalCredentialAwarded": "Constancia de participación",
          "hasPart": { "\@type": "ItemList", "itemListElement": [
$items
          ] } },
        { "\@type": "BreadcrumbList", "itemListElement": [
            { "\@type": "ListItem", "position": 1, "name": "Inicio", "item": "$BASE/" },
            { "\@type": "ListItem", "position": 2, "name": "$r{titulo}" } ] }
      ]
    }
JSON
    my $html = cabeza(P => $P, titulo => $r{seo_titulo}, desc => $r{desc}, url => $url, jsonld => $jsonld, og => "$r{titulo} · CIC")
      . cuerpo_inicio($P, $r{slug}) . <<"HTML";

    <main id="contenido" class="pagina-ruta">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol><li><a href="$P">Inicio</a></li><li><span aria-current="page">$r{titulo}</span></li></ol>
        </nav>
        <div class="contenedor">
            <section class="ruta-heroe $r{color}" aria-labelledby="titulo-ruta">
                <div class="patron-hojas animado" aria-hidden="true"></div>
                <div class="ruta-heroe-grid">
                    <div>
                        <span class="chip" style="background:rgba(255,255,255,.6)">$r{chip}</span>
                        <h1 id="titulo-ruta">$r{titulo}</h1>
                        <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                        <p class="lead">$r{lead}</p>
                        <div class="botones" style="margin-top:1.6rem">
                            <a class="btn btn-primario" href="${P}#crear-cuenta">Inscribirme</a>
                            <a class="btn btn-borde" href="#$r{indice}[0][2]">$r{ver}</a>
                        </div>
                    </div>
                    <aside class="ficha-tarjeta" aria-label="Ficha de la ruta">
                        <dl class="ficha">
$ficha
                        </dl>
                    </aside>
                </div>
            </section>
        </div>

        <section class="bloque" aria-labelledby="titulo-como">
            <div class="contenedor">
                <p class="eyebrow">Cómo funciona</p>
                <h2 id="titulo-como" style="margin-top:.4rem">$r{como}</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <ol class="rejilla r3 lista-limpia">
$pasos
                </ol>
            </div>
        </section>

        <section class="bloque" aria-labelledby="titulo-semanas">
            <div class="contenedor">
                <p class="eyebrow">$r{eyebrow_lista}</p>
                <h2 id="titulo-semanas" style="margin-top:.4rem">$r{titulo_lista}</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <p class="intro">$r{intro_lista}</p>
                <div class="semanas">
$r{tarjetas}
                </div>
                <div class="cta-banda">
                    <div class="patron-hojas animado" aria-hidden="true"></div>
                    <div>
                        <h2>¿Ya te inscribiste?</h2>
                        <p>Al ingresar verás qué toca esta semana, quién es tu dinamizadora y tus descargas.</p>
                    </div>
                    <div class="botones" style="margin:0">
                        <a class="btn btn-claro" href="${P}#crear-cuenta">Inscribirme</a>
                        <a class="btn btn-claro" href="${P}#ingresar">Ingresar</a>
                    </div>
                </div>
            </div>
        </section>
    </main>
HTML
    $html .= final_pagina($P);
    escribir("rutas/$r{slug}/index.html", $html);
}

# ---------------------------------------------------------------- Ruta HACER
pagina_ruta(
    slug => 'hacer', titulo => 'Ruta HACER', color => 'bg-durazno', chip => 'Para emprendedoras · 6 semanas',
    seo_titulo => 'Ruta HACER · 6 semanas para ordenar tu negocio · CIC',
    desc => 'Seis semanas de acompañamiento en tu negocio, con tu dinamizadora: costos, precio, ventas y plan de inversión. Descarga la guía y las plantillas de cada semana.',
    lead => 'Seis semanas de acompañamiento en tu propio negocio, con tu dinamizadora, para ordenar tus costos, tu precio y tus ventas.',
    ver => 'Ver las 6 semanas',
    ficha => [['Duración', '6 semanas · 2 horas cada una'], ['Dónde', 'En tu negocio o en la sede de tu satélite'], ['Con quién', 'Tu dinamizadora, solo contigo'], ['Necesitas', 'Tu celular para descargar las guías'], ['Al terminar', 'Constancia de participación']],
    como => 'Una visita por semana, una tarea para la siguiente',
    pasos => [['1', 'Tu dinamizadora te visita', 'Dos horas en tu negocio para trabajar el tema de la semana.'], ['2', 'Descargas tu guía', 'La guía y las plantillas de la semana, en Word o Excel, para llenar en papel o en el celular.'], ['3', 'Haces tu tarea', 'Antes de la siguiente visita aplicas lo aprendido. Tu dinamizadora la revisa contigo.']],
    eyebrow_lista => 'Las 6 semanas', titulo_lista => 'Qué toca cada semana', intro_lista => 'Cada semana parte de lo que hiciste en la anterior. Descarga solo lo de tu semana: no necesitas internet para llenarlo.',
    indice => [map { [$_->{n}, "Semana $_->{n}: $_->{titulo}", "semana-$_->{n}"] } @HACER],
    tarjetas => join('', map {
        my $s = $_;
        my $t = $s->{ser} ? $SER[$s->{ser} - 1] : undef;
        tarjeta('../../', id => "semana-$s->{n}", color => 'bg-durazno', marca => $s->{n}, meta => "Semana $s->{n} · $s->{tema}", titulo => $s->{titulo},
            resumen => $s->{resumen}, haras => $s->{haras}, descargas => $s->{descargas},
            extra => $t ? qq{Esta semana también: <a class="enlace" href="../ser/#taller-$t->{n}">Taller SER $t->{n} · $t->{titulo}</a> (@{[ lc $t->{modalidad} ]}).} : '')
    } @HACER),
);

# ---------------------------------------------------------------- Ruta SER
pagina_ruta(
    slug => 'ser', titulo => 'Ruta SER', color => 'bg-lavanda', chip => 'Para emprendedoras · 4 talleres en grupo',
    seo_titulo => 'Ruta SER · 4 talleres en grupo para emprendedoras · CIC',
    desc => 'Cuatro talleres en grupo de confianza, decisiones, liderazgo, derechos y ahorro colectivo. Dos presenciales y dos virtuales, con grabación.',
    lead => 'Cuatro talleres en grupo para fortalecer a la mujer que sostiene el negocio: confianza, decisiones, liderazgo, derechos y ahorro.',
    ver => 'Ver los 4 talleres',
    ficha => [['Duración', '4 talleres · 4 horas cada uno'], ['Dónde', '2 presenciales y 2 virtuales'], ['Con quién', 'Emprendedoras de tu satélite y sus dinamizadoras'], ['Grabaciones', 'Los talleres virtuales quedan en tu panel'], ['Al terminar', 'Constancia: asiste al menos a 3 de 4']],
    como => 'En grupo, con tu satélite',
    pasos => [['1', 'Te reúnes con tu grupo', 'Los talleres 1 y 3 son presenciales; el 2 y el 4, virtuales.'], ['2', 'Descargas tu guía', 'Cada taller tiene su guía para llevar o tener a mano en el celular.'], ['3', 'Lo llevas a tu negocio', 'La última hora de cada taller aplica lo vivido a tu semana de la ruta HACER.']],
    eyebrow_lista => 'Los 4 talleres', titulo_lista => 'Qué se vive en cada taller', intro_lista => 'Si no pudiste conectarte a un taller virtual, su grabación aparecerá en tu panel al ingresar.',
    indice => [map { [$_->{n}, "Taller $_->{n}: $_->{titulo}", "taller-$_->{n}"] } @SER],
    tarjetas => join('', map {
        tarjeta('../../', id => "taller-$_->{n}", color => 'bg-lavanda', marca => $_->{n}, meta => "Taller $_->{n} · $_->{modalidad} · semana $_->{semana}", titulo => $_->{titulo},
            resumen => $_->{resumen}, haras => $_->{haras}, descargas => $_->{descargas},
            extra => qq{Va junto con la <a class="enlace" href="../hacer/#semana-$_->{semana}">semana $_->{semana} de la ruta HACER</a>.} . ($_->{modalidad} eq 'Virtual' ? ' Se graba para quien no pudo conectarse.' : ''))
    } @SER),
);

# ---------------------------------------------------------------- Direcciones anteriores de las guías
sub redireccion {
    my ($archivo, $destino, $titulo) = @_;
    escribir($archivo, <<"HTML");
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>$titulo · CIC</title>
    <meta http-equiv="refresh" content="0; url=$destino">
    <link rel="canonical" href="$destino">
</head>
<body>
    <p>Esta guía ahora se descarga desde su ruta: <a href="$destino">ir a $titulo</a>.</p>
</body>
</html>
HTML
}
redireccion("rutas/hacer/semana-$_->{n}/index.html", "../#semana-$_->{n}", "Semana $_->{n}") for @HACER;
redireccion("rutas/ser/taller-$_->{n}/index.html", "../#taller-$_->{n}", "Taller $_->{n}") for @SER;

# ---------------------------------------------------------------- Datos para la plataforma
my $json = JSON::PP->new->canonical->indent->indent_length(2);
my $datos = {
    satelites => [map { { id => $_->{id}, codigo => $_->{codigo}, nombre => $_->{nombre}, departamento => $_->{departamento}, municipios => [map { $_->[0] } @{ $_->{municipios} }] } } @SATELITES],
    hacer => [map { { n => $_->{n}, titulo => $_->{titulo}, tema => $_->{tema}, resumen => $_->{resumen}, haras => $_->{haras}, ser => $_->{ser}, descargas => $_->{descargas} } } @HACER],
    ser   => [map { { n => $_->{n}, titulo => $_->{titulo}, semana => $_->{semana}, modalidad => $_->{modalidad}, resumen => $_->{resumen}, haras => $_->{haras}, descargas => $_->{descargas} } } @SER],
};
escribir('assets/datos-cic.js', "// Generado por herramientas/generar_rutas.pl a partir de herramientas/Datos.pm. No editar a mano.\nwindow.CIC_DATOS = " . $json->encode($datos) . ";\n");
