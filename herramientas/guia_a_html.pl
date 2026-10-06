#!/usr/bin/perl
# Convierte una «Guía de la emprendedora» (.docx) en el cuerpo HTML de una lección del portal.
# Uso: perl guia_a_html.pl archivo.docx prefijo-de-campos > leccion.html
# Primera línea de salida: «TITULO<tab>título de la guía»; segunda: «INDICE<tab>id|texto;;id|texto…»; luego el HTML.
#   · Títulos de Word (Heading1/2/3)        → h2 / h3 / h4
#   · Listas de Word                       → ul / ol según el formato de numeración
#   · Cuadro de una celda sin color        → campo para escribir (label + ayuda + textarea)
#   · Cuadro de una celda con color        → recuadro destacado
#   · Tabla con encabezado                 → tabla; las filas vacías se vuelven campos para llenar
#   · La portada (antes del primer título) se omite; de ella sale el título de la lección.
use strict;
use warnings;
use utf8;
binmode STDOUT, ':encoding(UTF-8)';

my ($archivo, $prefijo) = @ARGV;
die "Uso: $0 archivo.docx prefijo\n" unless $archivo && $prefijo;

sub leer_zip {
    my ($parte) = @_;
    open(my $fh, '-|', 'unzip', '-p', $archivo, $parte) or die "No pude abrir $parte\n";
    binmode $fh, ':encoding(UTF-8)';
    local $/;
    my $x = <$fh>;
    close $fh;
    return $x // '';
}

my $doc = leer_zip('word/document.xml');
my $num = leer_zip('word/numbering.xml');

# Formato de cada lista: numId → abstractNumId → numFmt del nivel 0
my (%abstracto, %formato);
while ($num =~ /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>(.*?)<\/w:abstractNum>/gs) {
    my ($id, $cuerpo) = ($1, $2);
    my ($fmt) = $cuerpo =~ /<w:lvl w:ilvl="0"[^>]*>.*?<w:numFmt w:val="([^"]+)"/s;
    $formato{$id} = $fmt // 'bullet';
}
while ($num =~ /<w:num w:numId="(\d+)"[^>]*>.*?<w:abstractNumId w:val="(\d+)"/gs) { $abstracto{$1} = $2 }
sub tipo_lista { my $n = shift; my $f = $formato{ $abstracto{$n} // '' } // 'bullet'; return $f eq 'bullet' ? 'ul' : 'ol' }

sub esc { my $t = shift; $t =~ s/&/&amp;/g; $t =~ s/</&lt;/g; $t =~ s/>/&gt;/g; $t =~ s/"/&quot;/g; return $t }
sub des { my $t = shift; $t =~ s/&lt;/</g; $t =~ s/&gt;/>/g; $t =~ s/&quot;/"/g; $t =~ s/&apos;/'/g; $t =~ s/&amp;/&/g; return $t }

# Texto de un párrafo, con negritas y cursivas
sub runs {
    my ($p) = @_;
    my $html = '';
    while ($p =~ /<w:r\b[^>]*>(.*?)<\/w:r>/gs) {
        my $r = $1;
        my ($rpr) = $r =~ /<w:rPr>(.*?)<\/w:rPr>/s;
        $rpr //= '';
        my $b = $rpr =~ /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/ ? 1 : 0;
        my $i = $rpr =~ /<w:i(?:\s+w:val="(?:1|true|on)")?\s*\/>/ ? 1 : 0;
        my $t = '';
        while ($r =~ /(<w:t\b[^>]*>(.*?)<\/w:t>|<w:t\b[^>]*\/>|<w:tab\/>|<w:br[^>]*\/>)/gs) {
            my $pieza = $1;
            if (defined $2) { $t .= esc(des($2)) }
            elsif ($pieza =~ /<w:tab/) { $t .= ' ' }
            elsif ($pieza =~ /<w:br/) { $t .= '<br>' }
        }
        next if $t eq '';
        $t = "<em>$t</em>" if $i;
        $t = "<strong>$t</strong>" if $b;
        $html .= $t;
    }
    $html =~ s/<\/strong><strong>//g;
    $html =~ s/<\/em><em>//g;
    return $html;
}
sub texto_plano { my $h = shift; $h =~ s/<[^>]+>//g; $h =~ s/&nbsp;/ /g; $h =~ s/\s+/ /g; $h =~ s/^\s+|\s+$//g; return $h }

sub estilo { my $p = shift; my ($s) = $p =~ /<w:pStyle w:val="([^"]+)"/; return $s // '' }
sub nivel_titulo { my $s = shift; return $s =~ /^(?:Heading|Ttulo|T\x{ed}tulo)(\d)$/ ? $1 : ($s eq 'Title' ? 1 : 0) }

my $campo = 0;
sub nuevo_id { $campo++; return "$prefijo-$campo" }

# Párrafos (fuera o dentro de celdas) → HTML, agrupando listas
sub parrafos_html {
    my (@ps) = @_;
    my ($html, $lista) = ('', '');
    for my $p (@ps) {
        my $contenido = runs($p);
        my $vacio = texto_plano($contenido) eq '';
        my ($numid) = $p =~ /<w:numPr>.*?<w:numId w:val="(\d+)"/s;
        if ($numid && !$vacio) {
            my $tipo = tipo_lista($numid);
            if ($lista ne $tipo) { $html .= "</$lista>" if $lista; $html .= "<$tipo>"; $lista = $tipo }
            $html .= "<li>$contenido</li>";
            next;
        }
        if ($lista) { $html .= "</$lista>"; $lista = '' }
        next if $vacio;
        my $n = nivel_titulo(estilo($p));
        if ($n) { my $h = $n + 1; $h = 4 if $h > 4; (my $c = $contenido) =~ s{</?strong>}{}g; $html .= "<h$h>$c</h$h>" }
        else { $html .= "<p>$contenido</p>" }
    }
    $html .= "</$lista>" if $lista;
    return $html;
}

sub celdas { my $fila = shift; return ($fila =~ /<w:tc>(.*?)<\/w:tc>/gs) }
sub ps_de { my $x = shift; return ($x =~ /(<w:p\b.*?<\/w:p>|<w:p\b[^>]*\/>)/gs) }

sub tabla_html {
    my ($t) = @_;
    my @filas = $t =~ /<w:tr\b.*?<\/w:tr>/gs;
    my @cols = map { scalar(() = /<w:tc>/g) } @filas;
    my ($relleno) = $t =~ /<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/;

    # Una sola celda: campo para escribir o recuadro destacado
    if (@filas == 1 && $cols[0] == 1) {
        my @ps = ps_de((celdas($filas[0]))[0]);
        my @con_texto = grep { texto_plano(runs($_)) ne '' } @ps;
        if (!$relleno) {
            my $id = nuevo_id();
            my ($etiqueta, @ayuda) = map { runs($_) } @con_texto;
            $etiqueta //= 'Escribe aquí';
            my $ayuda = @ayuda ? '<small>' . join(' ', @ayuda) . '</small>' : '';
            my $alto = @ps - @con_texto > 3 ? 5 : 3;
            return qq{<div class="respuesta"><label for="$id">$etiqueta</label>$ayuda<textarea id="$id" rows="$alto" data-guardar></textarea></div>};
        }
        my ($titulo, @resto) = @con_texto;
        my $cuerpo = parrafos_html(@resto);
        my $tono = lc($relleno) =~ /^f/ ? 'calido' : 'fresco';
        return qq{<aside class="recuadro $tono"><p class="recuadro-titulo">} . texto_plano(runs($titulo // '')) . qq{</p>$cuerpo</aside>};
    }

    # Tabla con encabezado; las filas vacías se vuelven campos
    my $html = '<div class="tabla-caja tabla-guia"><table>';
    for my $i (0 .. $#filas) {
        my @cs = celdas($filas[$i]);
        my @contenidos = map { parrafos_html(ps_de($_)) } @cs;
        my $vacia = !grep { texto_plano($_) ne '' } @contenidos;
        if ($i == 0) {
            $html .= '<thead><tr>' . join('', map { '<th scope="col">' . texto_plano($_) . '</th>' } @contenidos) . '</tr></thead><tbody>';
            next;
        }
        $html .= '<tr>';
        for my $c (@contenidos) {
            if ($vacia || texto_plano($c) eq '') {
                my $id = nuevo_id();
                $html .= qq{<td><input id="$id" aria-label="Completar" data-guardar></td>};
            } else {
                (my $limpio = $c) =~ s/^<p>(.*)<\/p>$/$1/s;
                $html .= "<td>$limpio</td>";
            }
        }
        $html .= '</tr>';
    }
    return $html . '</tbody></table></div>';
}

my ($cuerpo) = $doc =~ /<w:body>(.*)<\/w:body>/s;
my ($titulo, $html, $en_portada) = ('', '', 1);
my (@indice, @pendientes);
my $parrafos_portada = 0;
my $flush = sub { if (@pendientes) { $html .= parrafos_html(@pendientes); @pendientes = () } };

while ($cuerpo =~ /\G\s*(<w:tbl>.*?<\/w:tbl>|<w:p\b.*?<\/w:p>|<w:p\b[^>]*\/>|<w:sectPr.*?<\/w:sectPr>|<w:bookmark\w+[^>]*\/>|<[^>]+\/>)/gs) {
    my $e = $1;
    if ($en_portada) {
        if ($e =~ /^<w:p\b/ && nivel_titulo(estilo($e)) == 1) { $en_portada = 0 }
        else {
            if ($e =~ /^<w:p\b/) { my $t = texto_plano(runs($e)); $parrafos_portada++ if $t ne ''; $titulo = $t if $parrafos_portada == 2 }
            next;
        }
    }
    if ($e =~ /^<w:tbl>/) { $flush->(); $html .= tabla_html($e); next }
    next unless $e =~ /^<w:p\b/;
    if (nivel_titulo(estilo($e)) == 1) {
        $flush->();
        my $t = texto_plano(runs($e));
        next if $t eq '';
        my $id = lc($t);
        $id =~ tr/áéíóúüñ/aeiouun/;
        $id =~ s/[^a-z0-9]+/-/g; $id =~ s/^-|-$//g;
        push @indice, "$id|$t";
        $html .= qq{<h2 id="$id">$t</h2>};
        next;
    }
    push @pendientes, $e;
}
$flush->();

print "TITULO\t$titulo\n";
print "INDICE\t" . join(';;', @indice) . "\n";
print $html, "\n";
