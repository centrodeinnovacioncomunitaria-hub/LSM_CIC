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

# Guías (PDF) y plantillas (Excel) de las emprendedoras: salen del catálogo privado (functions/archivos_catalogo.json).
# No se publican en la página: se descargan desde la plataforma al ingresar (la Cloud Function las entrega con sesión).
my $catalogo = do { local $/; open my $fh, '<:raw', "$FindBin::Bin/../functions/archivos_catalogo.json" or die "Falta functions/archivos_catalogo.json: corre node herramientas/archivos/catalogo.js\n"; JSON::PP->new->utf8->decode(<$fh>) };
sub guias_de {
    my ($prefijo) = @_;
    my @ids = sort { ($a =~ /guia$/ ? 0 : 1) <=> ($b =~ /guia$/ ? 0 : 1) || $a cmp $b }
        grep { /^\Q$prefijo\E-/ && $catalogo->{archivos}{$_}{publico} eq 'emprendedoras' } keys %{ $catalogo->{archivos} };
    return [map {
        my $a = $catalogo->{archivos}{$_};
        my $bytes = -s "$FindBin::Bin/../functions/archivos/$a->{archivo}";
        { id => $_, etiqueta => $a->{nombre}, tipo => ($a->{tipo} eq 'XLSX' ? 'Excel' : 'PDF'), kb => ($bytes ? int($bytes / 1024 + .5) : 0) }
    } @ids];
}
$_->{descargas} = guias_de("hacer-$_->{n}") for @HACER;
$_->{descargas} = guias_de("ser-$_->{n}") for @SER;
sub tamano { my $kb = shift; return $kb >= 1024 ? sprintf('%.1f MB', $kb / 1024) =~ s/\./,/r : "$kb KB" }

sub botones_descarga {
    my ($P, $lista) = @_;
    return join "\n", map {
        my $icono = $_->{tipo} eq 'Excel' ? 'bg-menta' : 'bg-coral';
        qq{                            <a class="descarga descarga-bloqueada" href="${P}#ingresar-emprendedora"><span class="descarga-icono $icono" aria-hidden="true">@{[ $_->{tipo} eq 'Excel' ? 'XLS' : 'PDF' ]}</span><span><b>$_->{etiqueta}</b><small>$_->{tipo} · @{[ tamano($_->{kb}) ]} · ingresa para descargar</small></span><svg class="descarga-candado" aria-hidden="true"><use href="#candado"/></svg></a>}
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
@{[ @{ $t{descargas} } ? qq{                        <p class="semana-sub">Guías para descargar <span class="chip">Con tu cuenta</span></p>\n                        <div class="descargas">\n} . botones_descarga($P, $t{descargas}) . qq{\n                        </div>} : qq{                        <p class="semana-extra">Las herramientas de esta semana te las entrega tu dinamizadora en la sesión.</p>} ]}$extra
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
            <nav class="subnav-cic subnav-fija" aria-label="En esta página"><ol><li><a href="#como">Cómo funciona</a></li><li><a href="#vivir">Cómo se vive</a></li><li><a href="#lista">$r{eyebrow_lista}</a></li></ol></nav>
        </div>

        <section id="como" class="bloque bloque-banda" aria-labelledby="titulo-como">
            <div class="contenedor">
                <p class="eyebrow">Cómo funciona</p>
                <h2 id="titulo-como" style="margin-top:.4rem">$r{como}</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <ol class="rejilla r3 lista-limpia">
$pasos
                </ol>
            </div>
        </section>

        <section id="vivir" class="bloque" aria-labelledby="titulo-vivir">
            <div class="contenedor franja-foto aparece">
                <div class="franja-img hoja"><img class="foto-duo" style="filter:url(#$r{duo})" referrerpolicy="no-referrer" loading="lazy" width="800" height="600" alt="$r{foto_alt}" src="$r{foto}"></div>
                <div class="franja-texto">
                    <p class="eyebrow">Cómo se vive</p>
                    <h2 id="titulo-vivir" style="margin-top:.4rem">$r{frase}</h2>
                    <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                    <ul class="franja-datos lista-limpia">
$r{datos}
                    </ul>
                </div>
            </div>
        </section>

        <section id="lista" class="bloque" aria-labelledby="titulo-semanas">
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
                        <p>Al ingresar verás tu próximo taller, quién es tu dinamizadora y la guía para descargar.</p>
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
    slug => 'hacer', titulo => 'Ruta HACER', color => 'bg-durazno', duo => 'duo-durazno',
    foto => 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgnlDPWIXl4bQVqs74nRqDFAzFGXWFCXTPt3sufw3YsOl0hgW36kFEL6xA7w77UPSlcg5uB-P3bYXrSdZugbnzhbLOXxE9JwKIDIGS8LMBof2JiftJH_sC7GpVCMHYwPjVDHZiIHVb60XQ/s800/IMG_6618.JPG',
    foto_alt => 'Emprendedoras trabajando con sus herramientas', frase => 'Tu negocio, una semana a la vez.',
    datos => join("
", map { qq{                        <li><b>$_->[0]</b><span>$_->[1]</span></li>} } (['6', 'visitas de tu dinamizadora'], ['2 h', 'por visita, en tu negocio'], ['1', 'tarea para la semana siguiente'])), chip => 'Para emprendedoras · 6 semanas',
    seo_titulo => 'Ruta HACER · 6 semanas para ordenar tu negocio · CIC',
    desc => 'Seis semanas de acompañamiento en tu negocio, con tu dinamizadora: costos, precio, ventas y plan de inversión. Descarga la guía y las plantillas de cada semana.',
    lead => 'Seis semanas de acompañamiento en tu propio negocio, con tu dinamizadora, para ordenar tus costos, tu precio y tus ventas.',
    ver => 'Ver las 6 semanas',
    ficha => [['Duración', '6 semanas · 2 horas cada una'], ['Dónde', 'En tu negocio o en la sede de tu satélite'], ['Con quién', 'Tu dinamizadora, solo contigo'], ['Necesitas', 'Tu celular para descargar las guías'], ['Al terminar', 'Constancia de participación']],
    como => 'Una visita por semana, una tarea para la siguiente',
    pasos => [['1', 'Tu dinamizadora te visita', 'Dos horas en tu negocio para trabajar el tema de la semana.'], ['2', 'Trabajas con tus herramientas', 'Tu dinamizadora te entrega la guía y las plantillas de la semana, en papel o en el celular.'], ['3', 'Haces tu tarea', 'Antes de la siguiente visita aplicas lo aprendido. Tu dinamizadora la revisa contigo.']],
    eyebrow_lista => 'Las 6 semanas', titulo_lista => 'Qué toca cada semana', intro_lista => 'Cada semana parte de lo que hiciste en la anterior. Las herramientas te las entrega tu dinamizadora en cada visita.',
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
    slug => 'ser', titulo => 'Ruta SER', color => 'bg-lavanda', duo => 'duo-verde',
    foto => 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgkaFUGQ0lPFM6brzHzL_IpVWq1-TNBT09i9fsvGLFzL9xLCLwIwXAvQrNSRSFfO0YGUrww76EF6ipz-koMBblKLzogX8BmWFiyR5SAm5yjcVIxCCxAXAslyDUhedAtzoGcDtzMJ2Xzapk/s800/IMG_6604.JPG',
    foto_alt => 'Una facilitadora conversa con un grupo de mujeres', frase => 'Aprender en grupo, crecer juntas.',
    datos => join("
", map { qq{                        <li><b>$_->[0]</b><span>$_->[1]</span></li>} } (['4', 'talleres en grupo'], ['2 + 2', 'presenciales y virtuales'], ['3 de 4', 'para tu constancia'])), chip => 'Para emprendedoras · 4 talleres en grupo',
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
