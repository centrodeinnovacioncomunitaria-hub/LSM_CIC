package Plantilla;
# Piezas comunes de todas las páginas del portal: símbolos SVG, menú principal y pie.
# $P es el prefijo hacia la raíz del sitio ('' en el inicio, '../' en /recursos, '../../' en /cursos/x, etc.).
# $actual marca la página o sección actual: hacer, ser, talleres, cursos, gestion, acompanar-hacer, facilitar-ser, recursos.
use strict;
use warnings;
use utf8;
use Exporter 'import';
use File::Path qw(make_path);
our @EXPORT_OK = qw(simbolos nav pie cabeza cuerpo_inicio final_pagina escribir attr);

sub simbolos {
    return <<'HTML';
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
        <filter id="duo-verde" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues=".18 .66"/><feFuncG type="table" tableValues=".29 .85"/><feFuncB type="table" tableValues=".24 .75"/></feComponentTransfer></filter>
        <filter id="duo-durazno" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues=".45 .98"/><feFuncG type="table" tableValues=".24 .84"/><feFuncB type="table" tableValues=".17 .72"/></feComponentTransfer></filter>
        <filter id="duo-coral" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues=".40 .97"/><feFuncG type="table" tableValues=".18 .78"/><feFuncB type="table" tableValues=".15 .70"/></feComponentTransfer></filter>
        <symbol id="isotipo" viewBox="12 12 96 96"><path d="M60,104 C30,100 14,78 18,44 C44,50 58,70 60,104 Z" fill="#9ED0B7" style="mix-blend-mode:multiply"/><path d="M60,104 C90,100 106,78 102,44 C76,50 62,70 60,104 Z" fill="#F2B592" style="mix-blend-mode:multiply"/><circle cx="60" cy="30" r="12" fill="#EE9884"/></symbol>
        <symbol id="isotipo-neg" viewBox="12 12 96 96"><path d="M60,104 C30,100 14,78 18,44 C44,50 58,70 60,104 Z" fill="#fff" fill-opacity=".6"/><path d="M60,104 C90,100 106,78 102,44 C76,50 62,70 60,104 Z" fill="#fff" fill-opacity=".85"/><circle cx="60" cy="30" r="12" fill="#fff"/></symbol>
        <symbol id="trazo" viewBox="0 0 152 16"><path d="M3 11 C 30 2, 52 2, 76 9 S 124 15, 149 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></symbol>
        <symbol id="flecha" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="candado" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
    </svg>
HTML
}

sub nav {
    my ($P, $actual) = @_;
    $actual //= '';
    my $f = '<svg aria-hidden="true"><use href="#flecha"/></svg>';
    my $cur = sub { $_[0] eq $actual ? ' aria-current="page"' : '' };
    my $grupo = sub { my %en = map { $_ => 1 } @_; $en{$actual} ? ' actual' : '' };
    my $talleres = $grupo->(qw(hacer ser talleres));
    my $cursos = $grupo->(qw(cursos gestion acompanar-hacer facilitar-ser));
    my $recursos = $grupo->('recursos');
    my $cic = $grupo->(qw(el-cic como-funciona implementacion formacion glosario));
    return <<"HTML";
            <nav id="nav-publica" class="nav" aria-label="Principal">
                <div class="submenu">
                    <button type="button" class="submenu-btn$talleres" aria-expanded="false" aria-controls="sub-talleres">Talleres $f</button>
                    <ul id="sub-talleres" class="submenu-lista" hidden>
                        <li><a href="${P}rutas/hacer/"@{[ $cur->('hacer') ]}><span class="punto bg-durazno"></span><span><b>Ruta HACER</b><small>Emprendedoras · 6 sesiones en tu negocio</small></span></a></li>
                        <li><a href="${P}rutas/ser/"@{[ $cur->('ser') ]}><span class="punto bg-lavanda"></span><span><b>Ruta SER</b><small>Emprendedoras · 4 talleres en grupo</small></span></a></li>
                        <li><a class="todas" href="${P}#rutas">Ver los talleres</a></li>
                    </ul>
                </div>
                <div class="submenu">
                    <button type="button" class="submenu-btn$cursos" aria-expanded="false" aria-controls="sub-cursos">Cursos del equipo $f</button>
                    <ul id="sub-cursos" class="submenu-lista" hidden>
                        <li><a href="${P}cursos/gestion-cic/"@{[ $cur->('gestion') ]}><span class="punto bg-agua"></span><span><b>Gestión del CIC</b><small>Dinamizadoras y Secretaría · 5 módulos</small></span></a></li>
                        <li><a href="${P}cursos/acompanar-hacer/"@{[ $cur->('acompanar-hacer') ]}><span class="punto bg-durazno"></span><span><b>Acompañar la ruta HACER</b><small>Dinamizadoras · 6 semanas</small></span></a></li>
                        <li><a href="${P}cursos/facilitar-ser/"@{[ $cur->('facilitar-ser') ]}><span class="punto bg-lavanda"></span><span><b>Facilitar la ruta SER</b><small>Dinamizadoras · 4 talleres</small></span></a></li>
                        <li><a class="todas" href="${P}cursos/"@{[ $cur->('cursos') ]}>Ver todos los cursos</a></li>
                    </ul>
                </div>
                <div class="submenu">
                    <button type="button" class="submenu-btn$recursos" aria-expanded="false" aria-controls="sub-recursos">Recursos $f</button>
                    <ul id="sub-recursos" class="submenu-lista" hidden>
                        <li><a href="${P}recursos/"@{[ $cur->('recursos') ]}><span class="punto bg-mantequilla"></span><span><b>Biblioteca completa</b><small>13 plantillas gratuitas</small></span></a></li>
                        <li><a href="${P}recursos/#tema-finanzas"><span class="punto bg-menta"></span><span><b>Finanzas</b><small>Costos, precio y flujo de caja</small></span></a></li>
                        <li><a href="${P}recursos/#tema-ventas"><span class="punto bg-durazno"></span><span><b>Ventas</b><small>Clientes, tendencias y plan comercial</small></span></a></li>
                        <li><a href="${P}recursos/#punto-equilibrio"><span class="punto bg-coral"></span><span><b>Calculadora de punto de equilibrio</b><small>Cuánto necesitas vender al mes</small></span></a></li>
                    </ul>
                </div>
                <div class="submenu">
                    <button type="button" class="submenu-btn$cic" aria-expanded="false" aria-controls="sub-cic">Sobre el CIC $f</button>
                    <ul id="sub-cic" class="submenu-lista" hidden>
                        <li><a href="${P}el-cic/"@{[ $cur->(q{el-cic}) ]}><span class="punto bg-menta"></span><span><b>Qué es el CIC</b><small>Modelo, objetivos y estructura en red</small></span></a></li>
                        <li><a href="${P}el-cic/como-funciona/"@{[ $cur->(q{como-funciona}) ]}><span class="punto bg-durazno"></span><span><b>Cómo funciona</b><small>Pilares, financiamiento y desarrollo del ser</small></span></a></li>
                        <li><a href="${P}el-cic/implementacion/"@{[ $cur->(q{implementacion}) ]}><span class="punto bg-coral"></span><span><b>Implementación y seguimiento</b><small>Fases, indicadores y hoja de ruta 2026-2030</small></span></a></li>
                        <li><a href="${P}el-cic/formacion/"@{[ $cur->(q{formacion}) ]}><span class="punto bg-lavanda"></span><span><b>Proceso formativo</b><small>Formación en cascada, 62 horas y constancias</small></span></a></li>
                        <li><a href="${P}#territorio"><span class="punto bg-mantequilla"></span><span><b>Territorio</b><small>8 satélites · 13 municipios</small></span></a></li>
                        <li><a class="todas" href="${P}el-cic/glosario/"@{[ $cur->(q{glosario}) ]}>Glosario de términos y siglas</a></li>
                    </ul>
                </div>
                <div class="submenu">
                    <button type="button" class="submenu-btn" aria-expanded="false" aria-controls="sub-ayuda">Ayuda $f</button>
                    <ul id="sub-ayuda" class="submenu-lista" hidden>
                        <li><a href="${P}#ayuda"><span class="punto bg-agua"></span><span><b>Preguntas frecuentes</b><small>Ingreso, celular y constancias</small></span></a></li>
                        <li><a href="${P}#verificar"><span class="punto bg-menta"></span><span><b>Verificar constancia</b><small>Con el código de la constancia</small></span></a></li>
                        <li><a href="${P}#politica-datos"><span class="punto bg-lavanda"></span><span><b>Política de datos</b><small>Ley 1581 de 2012</small></span></a></li>
                    </ul>
                </div>
            </nav>
HTML
}

sub pie {
    my ($P) = @_;
    my $inicio = $P eq '' ? '#inicio' : $P;
    return <<"HTML";
    <footer class="pie">
        <div class="contenedor">
            <div class="pie-rejilla">
                <div>
                    <a href="$inicio" class="logo" aria-label="CIC, volver al inicio">
                        <svg aria-hidden="true"><use href="#isotipo"/></svg>
                        <span><span class="logo-palabra">cic</span><span class="logo-sub" style="display:block">Centro de Innovación Comunitaria</span></span>
                    </a>
                    <p class="texto-suave" style="margin-top:1rem;font-size:.93rem">Formación y acompañamiento para la autonomía económica de las mujeres emprendedoras del Caribe, en red con la Red de Mujeres del Caribe.</p>
                </div>
                <div>
                    <h2>Emprendedoras</h2>
                    <ul><li><a href="${P}rutas/hacer/">Ruta HACER</a></li><li><a href="${P}rutas/ser/">Ruta SER</a></li><li><a href="${P}recursos/">Biblioteca de recursos</a></li></ul>
                </div>
                <div>
                    <h2>Equipo del CIC</h2>
                    <ul><li><a href="${P}cursos/">Cursos del equipo</a></li><li><a href="${P}cursos/gestion-cic/">Gestión del CIC</a></li><li><a href="${P}cursos/acompanar-hacer/">Acompañar la ruta HACER</a></li><li><a href="${P}cursos/facilitar-ser/">Facilitar la ruta SER</a></li></ul>
                </div>
                <div>
                    <h2>El CIC</h2>
                    <ul><li><a href="${P}el-cic/">Qué es el CIC</a></li><li><a href="${P}el-cic/como-funciona/">Cómo funciona</a></li><li><a href="${P}el-cic/implementacion/">Implementación</a></li><li><a href="${P}el-cic/formacion/">Proceso formativo</a></li><li><a href="${P}el-cic/glosario/">Glosario</a></li><li><a href="${P}#aliados">Aliados</a></li></ul>
                </div>
                <div>
                    <h2>Ayuda</h2>
                    <ul><li><a href="${P}#ayuda">Centro de ayuda</a></li><li><a href="${P}#verificar">Verificar constancia</a></li><li><a href="${P}#politica-datos">Política de datos</a></li></ul>
                </div>
            </div>
            <div class="pie-legal">
                <span>© 2026 Centro de Innovación Comunitaria · Convenio 432 · Fondo de Igualdad</span>
                <span>Emprender es florecer · Innovación con raíz caribe</span>
            </div>
        </div>
    </footer>
HTML
}

# Escribe un archivo en UTF-8, creando las carpetas que falten.
sub escribir { my ($f, $x) = @_; make_path($f =~ s{/[^/]+$}{}r); open(my $fh, q{>:encoding(UTF-8)}, $f) or die "No pude escribir $f
"; print $fh $x; close $fh; print "$f
" }
# Escapa un texto para usarlo dentro de un atributo HTML.
sub attr { my $t = shift; $t =~ s/&/&amp;/g; $t =~ s/"/&quot;/g; $t =~ s/</&lt;/g; return $t }

# Cabeza HTML de una página interna: titulo, desc, url, P, og, jsonld y noindex.
sub cabeza {
    my (%o) = @_;
    my $P = $o{P};
    my $robots = $o{noindex} ? qq{\n    <meta name="robots" content="noindex">} : '';
    my $jsonld = $o{jsonld} ? qq{    <script type="application/ld+json">\n$o{jsonld}    </script>\n} : '';
    return <<"HTML";
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>$o{titulo}</title>
    <meta name="description" content="@{[ attr($o{desc}) ]}">
    <link rel="canonical" href="$o{url}">$robots
    <meta name="theme-color" content="#2E4A3E">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="es_CO">
    <meta property="og:site_name" content="Centro de Innovación Comunitaria (CIC)">
    <meta property="og:title" content="@{[ attr($o{og} // $o{titulo}) ]}">
    <meta property="og:description" content="@{[ attr($o{desc}) ]}">
    <meta property="og:url" content="$o{url}">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='12 12 96 96'%3E%3Cpath d='M60,104 C30,100 14,78 18,44 C44,50 58,70 60,104 Z' fill='%239ED0B7'/%3E%3Cpath d='M60,104 C90,100 106,78 102,44 C76,50 62,70 60,104 Z' fill='%23F2B592'/%3E%3Ccircle cx='60' cy='30' r='12' fill='%23EE9884'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght\@6..12,400;6..12,600;6..12,700&family=Quicksand:wght\@600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${P}assets/cic.css">
$jsonld    <script>document.documentElement.classList.add('js');</script>
</head>
HTML
}

# Apertura del cuerpo: símbolos SVG, enlace para saltar y cabecera con el menú.
sub cuerpo_inicio {
    my ($P, $actual) = @_;
    return "<body>\n" . simbolos() . <<"HTML";

    <a class="saltar" href="#contenido">Saltar al contenido</a>

    <header class="cabecera">
        <div class="contenedor">
            <a href="$P" class="logo" aria-label="CIC · Centro de Innovación Comunitaria, inicio">
                <svg aria-hidden="true"><use href="#isotipo"/></svg>
                <span><span class="logo-palabra">cic</span><span class="logo-sub">Centro de Innovación Comunitaria</span></span>
            </a>
@{[ nav($P, $actual) ]}            <div class="acciones">
                <a class="btn btn-primario btn-pequeno" href="${P}#ingresar">Ingresar <span aria-hidden="true">›</span></a>
                <button type="button" id="menu-btn" class="menu-btn" aria-controls="nav-publica" aria-expanded="false" aria-label="Abrir menú">
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>
        </div>
    </header>
HTML
}

# Pie, guion del sitio y cierre de la página.
sub final_pagina { my $P = shift; return "\n" . pie($P) . qq{\n    <script src="${P}assets/sitio.js"></script>\n</body>\n</html>\n} }

1;
