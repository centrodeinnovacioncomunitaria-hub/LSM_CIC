#!/usr/bin/perl
# Aplica el menú principal y el pie de Plantilla.pm a las páginas que no se generan automáticamente.
# Uso (desde la carpeta LSM_CIC): perl herramientas/aplicar_plantilla.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(nav pie);
binmode STDOUT, ':encoding(UTF-8)';

my @PAGINAS = (
    ['index.html',             '',       ''],
    ['recursos/index.html',    '../',    'recursos'],
    ['rutas/hacer/index.html', '../../', 'hacer'],
    ['rutas/ser/index.html',   '../../', 'ser'],
);
my $FLECHA = '<symbol id="flecha" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>';

for my $p (@PAGINAS) {
    my ($archivo, $P, $actual) = @$p;
    open(my $fh, '<:encoding(UTF-8)', $archivo) or die "No pude leer $archivo\n";
    local $/; my $html = <$fh>; close $fh;
    my $n = $html =~ s{            <nav id="nav-publica".*?</nav>\n}{nav($P, $actual)}se;
    my $m = $html =~ s{    <footer class="pie">.*?</footer>\n}{pie($P)}se;
    # El menú usa el símbolo #flecha: se agrega si la página no lo tiene
    $html =~ s{(<svg width="0" height="0"[^>]*>\n)}{$1        $FLECHA\n} unless $html =~ /id="flecha"/;
    open($fh, '>:encoding(UTF-8)', $archivo) or die "No pude escribir $archivo\n";
    print $fh $html; close $fh;
    printf "%-24s menú=%s pie=%s\n", $archivo, $n ? 'ok' : 'NO ENCONTRADO', $m ? 'ok' : 'NO ENCONTRADO';
}
