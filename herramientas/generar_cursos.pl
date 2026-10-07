#!/usr/bin/perl
# Genera la puerta de entrada a los cursos del equipo (dinamizadoras y Secretaría Técnica):
#   cursos/  → página cerrada: los cursos solo se ven al ingresar con cédula y contraseña.
#   cursos/gestion-cic/ · cursos/acompanar-hacer/ · cursos/facilitar-ser/ → llevan a cursos/.
#   rutas/gestion-cic/ (dirección anterior) → lleva a cursos/.
# El temario, los videos, el material y los cuestionarios viven dentro de la plataforma
# (index.html → «Mis cursos») y en el servidor; aquí no se publica nada de su contenido.
# Uso (desde la carpeta LSM_CIC): perl herramientas/generar_cursos.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(simbolos nav pie cabeza cuerpo_inicio final_pagina escribir attr);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';

# ---------------------------------------------------------------- Página cerrada
{
    my $P = '../';
    my $html = cabeza(P => $P, noindex => 1, titulo => 'Cursos del equipo · acceso con cédula y contraseña', desc => 'Los cursos del CIC son solo para dinamizadoras y Secretaría Técnica, y se abren al ingresar con cédula y contraseña.', url => "$BASE/cursos/", og => 'Cursos del equipo · Centro de Innovación Comunitaria')
      . cuerpo_inicio($P, 'cursos') . <<"HTML";

    <main id="contenido" class="pagina-ruta">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol><li><a href="$P">Inicio</a></li><li><span aria-current="page">Cursos del equipo</span></li></ol>
        </nav>
        <div class="contenedor">
            <section class="puerta-cerrada" aria-labelledby="titulo-cursos">
                <div class="patron-hojas animado" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                <div class="puerta-contenido">
                    <span class="puerta-candado" aria-hidden="true"><svg><use href="#candado"/></svg></span>
                    <p class="eyebrow eyebrow-claro">Solo para el equipo del CIC</p>
                    <h1 id="titulo-cursos">Los cursos se abren con tu cédula y tu contraseña.</h1>
                    <p class="lead">Son para dinamizadoras y Secretaría Técnica. Al ingresar verás tus cursos, en orden: cada uno se abre al aprobar el anterior.</p>
                    <div class="botones">
                        <a class="btn btn-claro" href="${P}#ingresar-dinamizadora">Ingresar como dinamizadora</a>
                        <a class="btn btn-borde-claro" href="${P}#ingresar-secretaria">Ingresar como secretaria</a>
                    </div>
                </div>
            </section>
        </div>

        <section class="bloque" aria-labelledby="titulo-acceso">
            <div class="contenedor rejilla r3">
                <div class="tarjeta paso-puerta aparece">
                    <span class="numero bg-menta">1</span>
                    <h2 id="titulo-acceso">¿Primera vez?</h2>
                    <p>Activa tu cuenta con el código de 6 números que te envía la Secretaría Técnica y crea tu contraseña.</p>
                </div>
                <div class="tarjeta paso-puerta aparece">
                    <span class="numero bg-durazno">2</span>
                    <h2>¿Olvidaste tu contraseña?</h2>
                    <p>Pide un código nuevo desde «Ingresar» o a la Secretaría Técnica.</p>
                </div>
                <div class="tarjeta paso-puerta aparece">
                    <span class="numero bg-lavanda">3</span>
                    <h2>¿Eres emprendedora?</h2>
                    <p>Tus talleres están en la <a class="enlace" href="${P}rutas/ser/">ruta SER</a>. Tu dinamizadora te acompaña en tu negocio.</p>
                </div>
            </div>
        </section>
    </main>
HTML
    $html .= final_pagina($P);
    escribir('cursos/index.html', $html);
}

# ---------------------------------------------------------------- Direcciones anteriores → página cerrada
sub redireccion {
    my ($archivo, $destino) = @_;
    escribir($archivo, <<"HTML");
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <title>Cursos del equipo · CIC</title>
    <meta name="robots" content="noindex">
    <link rel="canonical" href="$BASE/cursos/">
    <meta http-equiv="refresh" content="0; url=$destino">
</head>
<body>
    <p>Los cursos del equipo se abren al ingresar con tu cédula y contraseña: <a href="$destino">ir a Cursos del equipo</a>.</p>
    <script>location.replace('$destino');</script>
</body>
</html>
HTML
}
redireccion("cursos/$_/index.html", '../') for qw(gestion-cic acompanar-hacer facilitar-ser);
redireccion('rutas/gestion-cic/index.html', '../../cursos/');
print "Listo: cursos/ cerrada y 4 redirecciones.\n";
