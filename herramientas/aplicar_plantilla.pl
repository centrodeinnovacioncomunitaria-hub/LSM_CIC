#!/usr/bin/perl
# Aplica el menú principal y el pie de Plantilla.pm a las páginas escritas a mano (inicio y biblioteca),
# y en el inicio llena los bloques generados: pilares y mapa de satélites (de Datos.pm).
# Uso (desde la carpeta LSM_CIC): perl herramientas/aplicar_plantilla.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(nav pie);
use Datos qw(bloque_mapa pilares_lista);
binmode STDOUT, ':encoding(UTF-8)';

my @PAGINAS = (
    ['index.html',          '',    ''],
    ['recursos/index.html', '../', 'recursos'],
);
my $FLECHA = '<symbol id="flecha" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>';
my %BLOQUES = (PILARES => pilares_lista() . "\n", MAPA => bloque_mapa());

for my $p (@PAGINAS) {
    my ($archivo, $P, $actual) = @$p;
    open(my $fh, '<:encoding(UTF-8)', $archivo) or die "No pude leer $archivo\n";
    local $/; my $html = <$fh>; close $fh;
    $html =~ s/\r\n/\n/g;
    my $n = $html =~ s{            <nav id="nav-publica".*?</nav>\n}{nav($P, $actual)}se;
    my $m = $html =~ s{    <footer class="pie">.*?</footer>\n}{pie($P)}se;
    # El menú usa el símbolo #flecha: se agrega si la página no lo tiene
    $html =~ s{(<svg width="0" height="0"[^>]*>\n)}{$1        $FLECHA\n} unless $html =~ /id="flecha"/;
    my @llenos;
    for my $b (sort keys %BLOQUES) {
        push @llenos, $b if $html =~ s{(<!-- $b:inicio -->\n).*?(<!-- $b:fin -->)}{$1$BLOQUES{$b}$2}s;
    }
    open($fh, '>:encoding(UTF-8)', $archivo) or die "No pude escribir $archivo\n";
    print $fh $html; close $fh;
    printf "%-22s menú=%s pie=%s %s\n", $archivo, $n ? 'ok' : 'NO ENCONTRADO', $m ? 'ok' : 'NO ENCONTRADO', @llenos ? "bloques: @llenos" : '';
}
