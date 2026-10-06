#!/usr/bin/perl
# Genera las páginas de lección (rutas/hacer/semana-N y rutas/ser/taller-N) a partir de las
# «Guías de la emprendedora» del Drive del CIC, y copia sus descargas a /descargas.
# Uso (desde la carpeta LSM_CIC): perl herramientas/generar_lecciones.pl ../material_cursos
use strict;
use warnings;
use utf8;
use File::Path qw(make_path);
use File::Copy qw(copy);
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(simbolos nav pie);
binmode STDOUT, ':encoding(UTF-8)';

my $material = shift // '../material_cursos';
my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';

my @HACER = (
    { n => 1, lead => 'Partes de lo que ya sabes de tu negocio, lo miras sin juzgarlo y empiezas a anotar cada día lo que entra y lo que sale.',
      excel => [['CIC_S1_A3_Registro_Diario.xlsx', 'A3 · Registro diario de ingresos y egresos']] },
    { n => 2, lead => 'Describes tu negocio en una sola hoja con el Canvas de la Esquina y defines una nueva forma de ganar para probar durante la semana.', excel => [] },
    { n => 3, lead => 'Miras el mercado más allá de tu cuadra: qué se vende más, qué cambia en precios y gustos, y qué ajustas en lo que ofreces.', excel => [] },
    { n => 4, lead => 'Separas el bolsillo del hogar y el del negocio, calculas tus costos, fijas un precio que sí cubre lo que gastas y conoces tu punto de equilibrio.',
      excel => [['CIC_S4_A8_Costos_Precio_PE.xlsx', 'A8 · Costos, precio y punto de equilibrio'], ['CIC_S4_A9_Flujo_PyG_Bolsillos.xlsx', 'A9 · Flujo de caja, PyG y bolsillos']] },
    { n => 5, lead => 'Armas tu plan comercial, organizas a tus clientes en tu CRM, preparas tu pitch de un minuto y fijas tu meta de ventas.',
      excel => [['CIC_S5_A11_Mi_CRM.xlsx', 'A11 · Mi CRM']] },
    { n => 6, lead => 'Revisas lo que dicen tus números, armas tu plan de inversión paso a paso y conoces cómo ahorrar en red con una UMC.',
      excel => [['CIC_S6_A12_Plan_Inversion.xlsx', 'A12 · Plan de inversión simplificado']] },
);
my @SER = (
    { n => 1, modo => 'Presencial', lead => 'Reconoces tus raíces y tus fortalezas, sueñas hacia dónde quieres llevar tu vida y tu negocio, y te presentas como gerenta.' },
    { n => 2, modo => 'Virtual', lead => 'Analizas una decisión real de tu negocio o de tu vida, separas el miedo de la información y defines el primer paso.' },
    { n => 3, modo => 'Presencial', lead => 'Conoces tus derechos y las rutas de atención de tu municipio, identificas dónde participar y asumes un compromiso de liderazgo.' },
    { n => 4, modo => 'Virtual', lead => 'Construyes con tu grupo acuerdos para ahorrar, apoyarse y resolver los conflictos que aparezcan en el camino.' },
);

sub leer { my $f = shift; open(my $fh, '<:encoding(UTF-8)', $f) or die "No pude leer $f\n"; local $/; my $x = <$fh>; close $fh; return $x }
sub escribir { my ($f, $x) = @_; open(my $fh, '>:encoding(UTF-8)', $f) or die "No pude escribir $f\n"; print $fh $x; close $fh }
sub kb { my $f = shift; my $s = -s $f; return $s ? sprintf('%d KB', ($s + 1023) / 1024) : '' }
sub attr { my $t = shift; $t =~ s/&/&amp;/g; $t =~ s/"/&quot;/g; $t =~ s/</&lt;/g; return $t }
sub plano { my $t = shift; $t =~ s/<[^>]+>//g; $t =~ s/&amp;/&/g; $t =~ s/&quot;/"/g; return $t }

sub convertir {
    my ($docx, $prefijo) = @_;
    open(my $fh, '-|', 'perl', 'herramientas/guia_a_html.pl', $docx, $prefijo) or die "No pude convertir $docx\n";
    binmode $fh, ':encoding(UTF-8)';
    local $/; my $salida = <$fh>; close $fh;
    my ($titulo, $indice, $html) = $salida =~ /^TITULO\t(.*?)\nINDICE\t(.*?)\n(.*)$/s or die "Salida inesperada de $docx\n";
    my @indice = map { [split /\|/, $_, 2] } grep { length } split /;;/, $indice;
    return ($titulo, \@indice, $html);
}

my $P = '../../../';
sub cabecera {
    my ($ruta) = @_;
    return <<"HTML" . nav($P, $ruta) . <<"HTML2";
    <a class="saltar" href="#contenido">Saltar al contenido</a>

    <header class="cabecera">
        <div class="contenedor">
            <a href="$P" class="logo" aria-label="CIC · Centro de Innovación Comunitaria, inicio">
                <svg aria-hidden="true"><use href="#isotipo"/></svg>
                <span><span class="logo-palabra">cic</span><span class="logo-sub">Centro de Innovación Comunitaria</span></span>
            </a>
HTML
            <div class="acciones">
                <a class="btn btn-primario btn-pequeno" href="${P}#ingresar">Ingresar <span aria-hidden="true">›</span></a>
                <button type="button" id="menu-btn" class="menu-btn" aria-controls="nav-publica" aria-expanded="false" aria-label="Abrir menú">
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>
        </div>
    </header>
HTML2
}
my $PIE = pie($P);
my $SIMBOLOS = simbolos();

my @paginas;
for my $l (@HACER) { push @paginas, { %$l, ruta => 'hacer', nombre_ruta => 'Ruta HACER', unidad => 'Semana', slug => "semana-$l->{n}", color => 'bg-durazno',
    dura => '2 horas', modo => 'Presencial, en tu negocio', docx => "$material/hacer/semana-$l->{n}/CIC_S$l->{n}_Guia_Emprendedora.docx", dir_material => "$material/hacer/semana-$l->{n}", total => scalar @HACER } }
for my $l (@SER) { push @paginas, { %$l, ruta => 'ser', nombre_ruta => 'Ruta SER', unidad => 'Taller', slug => "taller-$l->{n}", color => 'bg-lavanda',
    dura => '4 horas', excel => [], docx => "$material/ser/taller-$l->{n}/CIC_SER$l->{n}_Guia_Emprendedora.docx", dir_material => "$material/ser/taller-$l->{n}", total => scalar @SER } }

my %titulos;
for my $pg (@paginas) { my ($t) = convertir($pg->{docx}, 'x'); $titulos{"$pg->{ruta}-$pg->{n}"} = $t }

for my $pg (@paginas) {
    my ($ruta, $n, $slug) = @$pg{qw(ruta n slug)};
    my ($titulo, $indice, $cuerpo) = convertir($pg->{docx}, "$ruta-$slug");
    my $unidad_n = "$pg->{unidad} $n";
    my $url = "$BASE/rutas/$ruta/$slug/";

    # Descargas: la guía en Word y, en HACER, las plantillas en Excel
    my $dir_descarga = "descargas/$ruta/$slug";
    make_path($dir_descarga);
    my @descargas;
    (my $nombre_guia = $pg->{docx}) =~ s{.*/}{};
    copy($pg->{docx}, "$dir_descarga/$nombre_guia") or die "No pude copiar $nombre_guia\n";
    push @descargas, [$nombre_guia, "Guía de la emprendedora · $unidad_n", 'Word, para imprimir o llenar', 'DOCX', 'bg-agua'];
    for my $x (@{ $pg->{excel} }) {
        copy("$pg->{dir_material}/$x->[0]", "$dir_descarga/$x->[0]") or die "No pude copiar $x->[0]\n";
        push @descargas, [$x->[0], $x->[1], 'Plantilla de Excel', 'XLSX', 'bg-menta'];
    }
    my $descargas_html = join "\n", map {
        my ($archivo, $nombre, $tipo, $ext, $color) = @$_;
        my $peso = kb("$dir_descarga/$archivo");
        qq{                            <a class="descarga" href="${P}$dir_descarga/$archivo" download><span class="icono $color">$ext</span><span><b>$nombre</b><small>$tipo · $peso</small></span></a>}
    } @descargas;

    my $indice_html = join "\n", map { qq{                        <li><a href="#$_->[0]">$_->[1]</a></li>} } @$indice;

    my ($ant, $sig) = ($n - 1, $n + 1);
    my $u = lc $pg->{unidad};
    my $pasos = '';
    $pasos .= qq{<a href="../$u-$ant/"><small>← Anterior · $pg->{unidad} $ant</small><b>$titulos{"$ruta-$ant"}</b></a>} if $n > 1;
    $pasos .= qq{<a class="siguiente-leccion" href="../$u-$sig/"><small>Siguiente · $pg->{unidad} $sig →</small><b>$titulos{"$ruta-$sig"}</b></a>} if $n < $pg->{total};
    my $vuelta = $n == $pg->{total}
        ? qq{<a class="siguiente-leccion" href="../"><small>Terminaste la ruta →</small><b>Volver a la $pg->{nombre_ruta}</b></a>} : '';

    my $modo_chip = $pg->{modo};
    my $nota_equipo = $ruta eq 'hacer'
        ? qq{¿Eres dinamizadora? La preparación de esta sesión está en el curso <a href="${P}cursos/acompanar-hacer/#semana-$n">Acompañar la ruta HACER</a>.}
        : qq{¿Eres dinamizadora? La facilitación de este taller está en el curso <a href="${P}cursos/facilitar-ser/#taller-$n">Facilitar la ruta SER</a>.};
    my $titulo_seo = plano("$unidad_n: $titulo · $pg->{nombre_ruta} · CIC");
    my $desc = attr($pg->{lead});
    my $jsonld = <<"JSON";
    {
      "\@context": "https://schema.org",
      "\@graph": [
        { "\@type": "LearningResource", "name": "@{[ attr(plano("$unidad_n · $titulo")) ]}", "description": "$desc", "url": "$url", "inLanguage": "es-CO",
          "learningResourceType": "Guía de aprendizaje", "timeRequired": "@{[ $ruta eq 'hacer' ? 'PT2H' : 'PT4H' ]}", "isAccessibleForFree": true,
          "isPartOf": { "\@type": "Course", "name": "$pg->{nombre_ruta}", "url": "$BASE/rutas/$ruta/" } },
        { "\@type": "BreadcrumbList", "itemListElement": [
            { "\@type": "ListItem", "position": 1, "name": "Inicio", "item": "$BASE/" },
            { "\@type": "ListItem", "position": 2, "name": "$pg->{nombre_ruta}", "item": "$BASE/rutas/$ruta/" },
            { "\@type": "ListItem", "position": 3, "name": "$unidad_n" } ] }
      ]
    }
JSON

    my $pagina = <<"HTML";
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>$titulo_seo</title>
    <meta name="description" content="$desc">
    <link rel="canonical" href="$url">
    <meta name="theme-color" content="#2E4A3E">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="es_CO">
    <meta property="og:site_name" content="Centro de Innovación Comunitaria (CIC)">
    <meta property="og:title" content="@{[ attr(plano("$unidad_n · $titulo · $pg->{nombre_ruta}")) ]}">
    <meta property="og:description" content="$desc">
    <meta property="og:url" content="$url">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='12 12 96 96'%3E%3Cpath d='M60,104 C30,100 14,78 18,44 C44,50 58,70 60,104 Z' fill='%239ED0B7'/%3E%3Cpath d='M60,104 C90,100 106,78 102,44 C76,50 62,70 60,104 Z' fill='%23F2B592'/%3E%3Ccircle cx='60' cy='30' r='12' fill='%23EE9884'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght\@6..12,400;6..12,600;6..12,700&family=Quicksand:wght\@600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${P}assets/cic.css">
    <script type="application/ld+json">
$jsonld    </script>
    <script>document.documentElement.classList.add('js');</script>
</head>
<body data-leccion="$ruta-$slug">
$SIMBOLOS
@{[ cabecera($ruta) ]}
    <main id="contenido" class="pagina-ruta">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol>
                <li><a href="$P">Inicio</a></li>
                <li><a href="../">$pg->{nombre_ruta}</a></li>
                <li><span aria-current="page">$unidad_n</span></li>
            </ol>
        </nav>

        <div class="contenedor">
            <section class="ruta-heroe $pg->{color}" aria-labelledby="titulo-leccion">
                <div class="patron-hojas animado" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" data-color="rgba(255,255,255,.75)" aria-hidden="true"></div>
                <div class="ruta-heroe-grid">
                    <div>
                        <span class="chip" style="background:rgba(255,255,255,.6)">$pg->{nombre_ruta} · $unidad_n · $pg->{dura} · $modo_chip</span>
                        <h1 id="titulo-leccion">$titulo</h1>
                        <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                        <p class="lead">$pg->{lead}</p>
                        <div class="video-pendiente" style="margin-top:1.4rem"><span class="video-boton" aria-hidden="true"></span><span><b>Video de la lección</b><br>En producción. Mientras tanto, trabaja con la guía y tu dinamizadora.</span></div>
                        <p class="nota-equipo">$nota_equipo</p>
                    </div>
                    <aside class="ficha-tarjeta" aria-label="Descargas de la lección">
                        <p class="eyebrow" style="margin-bottom:.8rem">Descargas</p>
                        <div class="descargas">
$descargas_html
                        </div>
                    </aside>
                </div>
            </section>

            <div class="leccion-grid">
                <nav class="indice-leccion" aria-label="Contenido de la lección">
                    <p>En esta lección</p>
                    <ol>
$indice_html
                    </ol>
                </nav>
                <div>
                    <article class="guia" aria-labelledby="titulo-leccion">
$cuerpo
                    </article>
                    <div class="leccion-estado">
                        <span id="estado-respuestas" role="status"></span>
                        <span class="botones" style="margin:0">
                            <button type="button" id="imprimir-leccion" class="btn btn-borde btn-pequeno">Imprimir</button>
                            <button type="button" id="borrar-respuestas" class="btn btn-borde btn-pequeno">Borrar mis respuestas</button>
                        </span>
                    </div>
                    <nav class="pasos-leccion" aria-label="Otras lecciones">
                        $pasos$vuelta
                    </nav>
                </div>
            </div>
        </div>
    </main>

$PIE
    <script src="${P}assets/sitio.js"></script>
    <script src="${P}assets/leccion.js"></script>
</body>
</html>
HTML
    make_path("rutas/$ruta/$slug");
    escribir("rutas/$ruta/$slug/index.html", $pagina);
    printf "%-22s %-46s secciones=%d descargas=%d\n", "rutas/$ruta/$slug", plano($titulo), scalar @$indice, scalar @descargas;
}
