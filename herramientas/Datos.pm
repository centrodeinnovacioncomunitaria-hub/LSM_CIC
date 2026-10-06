package Datos;
# Datos únicos del portal: satélites, semanas de la ruta HACER, talleres SER y pilares.
# Los usan los generadores de páginas y assets/datos-cic.js (que lee la plataforma).
# Si cambia un satélite, una semana o una descarga, se edita aquí y se ejecuta:
#   perl herramientas/generar_rutas.pl   (rutas y assets/datos-cic.js)
#   perl herramientas/generar_el_cic.pl  (página El CIC)
#   perl herramientas/aplicar_plantilla.pl (inicio y biblioteca)
use strict;
use warnings;
use utf8;
use Exporter 'import';
our @EXPORT_OK = qw(@SATELITES @HACER @SER @PILARES descarga mapa_caribe satelites_lista bloque_mapa pilares_lista);

# ---------------------------------------------------------------- Satélites
# lon/lat de cada municipio (aproximados) para ubicarlos en el mapa.
our @SATELITES = (
    { id => 'la-guajira',   codigo => 'GUA', nombre => 'La Guajira',   departamento => 'La Guajira', municipios => [['Riohacha', -72.91, 11.54], ['Albania', -72.59, 11.16]] },
    { id => 'magdalena',    codigo => 'MAG', nombre => 'Magdalena',    departamento => 'Magdalena',  municipios => [['Santa Marta', -74.20, 11.24]] },
    { id => 'valledupar',   codigo => 'VAL', nombre => 'Valledupar',   departamento => 'Cesar',      municipios => [['Valledupar', -73.25, 10.47]] },
    { id => 'pueblo-bello', codigo => 'PBE', nombre => 'Pueblo Bello', departamento => 'Cesar',      municipios => [['Pueblo Bello', -73.59, 10.42]] },
    { id => 'atlantico',    codigo => 'ATL', nombre => 'Atlántico',    departamento => 'Atlántico',  municipios => [['Baranoa', -74.92, 10.79], ['Campo de la Cruz', -74.88, 10.38]] },
    { id => 'bolivar',      codigo => 'BOL', nombre => 'Bolívar',      departamento => 'Bolívar',    municipios => [['Cartagena', -75.51, 10.39], ['María la Baja', -75.30, 9.98]] },
    { id => 'sucre',        codigo => 'SUC', nombre => 'Sucre',        departamento => 'Sucre',      municipios => [['Sincelejo', -75.40, 9.30], ['Tolú', -75.58, 9.52]] },
    { id => 'cordoba',      codigo => 'COR', nombre => 'Córdoba',      departamento => 'Córdoba',    municipios => [['Montería', -75.88, 8.75], ['Tierralta', -76.06, 8.17]] },
);

# ---------------------------------------------------------------- Descargas
# [ruta dentro de descargas/, etiqueta]
sub descarga {
    my ($ruta, $etiqueta) = @_;
    my ($ext) = $ruta =~ /\.(\w+)$/;
    return { ruta => "descargas/$ruta", etiqueta => $etiqueta, tipo => ($ext eq 'xlsx' ? 'Excel' : 'Word') };
}

# ---------------------------------------------------------------- Ruta HACER (individual, 2 horas por semana)
our @HACER = (
    { n => 1, titulo => 'Cuéntame tu negocio', tema => 'Primer encuentro: entender tu negocio', ser => 1,
      resumen => 'Tu dinamizadora visita tu negocio para conocerlo. Juntas lo describen y empiezas a anotar lo que entra y lo que sale.',
      haras => ['Contar tu negocio con cinco preguntas sencillas', 'Empezar tu registro diario de ingresos y gastos', 'Acordar tu primera tarea'],
      descargas => [descarga('hacer/semana-1/CIC_S1_Guia_Emprendedora.docx', 'Guía de la semana 1'), descarga('hacer/semana-1/CIC_S1_A3_Registro_Diario.xlsx', 'A3 · Registro diario')] },
    { n => 2, titulo => 'Mi negocio puede ganar de otra forma', tema => 'Modelo de negocio: el Canvas de la Esquina',
      resumen => 'Dibujas tu negocio en una sola hoja y buscas una nueva forma de ganar dinero con lo que ya sabes hacer.',
      haras => ['Llenar tu Canvas de la Esquina', 'Explorar nuevas fuentes de ingreso', 'Elegir un cambio pequeño para probar'],
      descargas => [descarga('hacer/semana-2/CIC_S2_Guia_Emprendedora.docx', 'Guía de la semana 2')] },
    { n => 3, titulo => 'Mirar más allá de mi cuadra', tema => 'Análisis de mercado', ser => 2,
      resumen => 'Miras qué está cambiando en tu mercado para decidir qué ajustar en tu negocio.',
      haras => ['Llenar tu matriz de tendencias', 'Revisar cómo te fue con el cambio que probaste', 'Tomar una decisión de cambio'],
      descargas => [descarga('hacer/semana-3/CIC_S3_Guia_Emprendedora.docx', 'Guía de la semana 3')] },
    { n => 4, titulo => 'El bolsillo separado', tema => 'Costos y finanzas',
      resumen => 'Separas el dinero de tu casa y el de tu negocio, calculas tus costos y fijas un precio que sí cubre lo que gastas.',
      haras => ['Hacer el ejercicio de los dos bolsillos', 'Calcular tus costos y tu nuevo precio', 'Conocer tu punto de equilibrio'],
      descargas => [descarga('hacer/semana-4/CIC_S4_Guia_Emprendedora.docx', 'Guía de la semana 4'), descarga('hacer/semana-4/CIC_S4_A8_Costos_Precio_PE.xlsx', 'A8 · Costos, precio y punto de equilibrio'), descarga('hacer/semana-4/CIC_S4_A9_Flujo_PyG_Bolsillos.xlsx', 'A9 · Flujo de caja y bolsillos')] },
    { n => 5, titulo => 'Cómo vender más', tema => 'Acceso a mercados', ser => 3,
      resumen => 'Armas tu plan para vender a clientes nuevos, más allá de tu familia y tus vecinos.',
      haras => ['Hacer tu plan comercial de una página', 'Anotar al menos cinco clientes posibles en Mi CRM', 'Fijar tu meta de ventas'],
      descargas => [descarga('hacer/semana-5/CIC_S5_Guia_Emprendedora.docx', 'Guía de la semana 5'), descarga('hacer/semana-5/CIC_S5_A11_Mi_CRM.xlsx', 'A11 · Mi CRM')] },
    { n => 6, titulo => 'Crecer con orden', tema => 'Plan de inversión y financiamiento', ser => 4,
      resumen => 'Revisas tus resultados, decides en qué invertir para crecer y conoces el ahorro en grupo.',
      haras => ['Revisar tu flujo de caja y tus ganancias', 'Hacer tu plan de inversión', 'Conocer la Unidad de Microfinanciamiento Comunitario'],
      descargas => [descarga('hacer/semana-6/CIC_S6_Guia_Emprendedora.docx', 'Guía de la semana 6'), descarga('hacer/semana-6/CIC_S6_A12_Plan_Inversion.xlsx', 'A12 · Plan de inversión'), descarga('hacer/semana-4/CIC_S4_A9_Flujo_PyG_Bolsillos.xlsx', 'A9 · Flujo de caja y bolsillos')] },
);

# ---------------------------------------------------------------- Ruta SER (en grupo, 4 horas por taller)
our @SER = (
    { n => 1, titulo => 'De la subsistencia a la gerencia', semana => 1, modalidad => 'Presencial',
      resumen => 'Te reconoces como gerenta de tu negocio y piensas en tu proyecto de vida a un año.',
      haras => ['Tu árbol de vida', 'Tu mapa de sueños', 'Presentar tu negocio en un minuto'],
      descargas => [descarga('ser/taller-1/CIC_SER1_Guia_Emprendedora.docx', 'Guía del taller 1')] },
    { n => 2, titulo => 'De la visión de túnel a la visión panorámica', semana => 3, modalidad => 'Virtual',
      resumen => 'Aprendes a tomar decisiones con información y sin miedo.',
      haras => ['Analizar una decisión difícil', 'Leer lo que viene en tu mercado', 'Dar el primer paso'],
      descargas => [descarga('ser/taller-2/CIC_SER2_Guia_Emprendedora.docx', 'Guía del taller 2')] },
    { n => 3, titulo => 'Mi liderazgo, mis derechos, mi protección', semana => 5, modalidad => 'Presencial',
      resumen => 'Conoces tus derechos, las rutas de atención de tu municipio y tu forma de liderar.',
      haras => ['Conocer tus derechos y los tipos de violencia', 'Ubicar las rutas de atención de tu municipio', 'Hacer tu compromiso de liderazgo'],
      descargas => [descarga('ser/taller-3/CIC_SER3_Guia_Emprendedora.docx', 'Guía del taller 3')] },
    { n => 4, titulo => 'La confianza que sostiene', semana => 6, modalidad => 'Virtual',
      resumen => 'Fortaleces la confianza en el grupo para ahorrar y crecer juntas.',
      haras => ['Comunicarte con asertividad', 'Resolver conflictos con una matriz sencilla', 'Hacer acuerdos para ahorrar en grupo'],
      descargas => [descarga('ser/taller-4/CIC_SER4_Guia_Emprendedora.docx', 'Guía del taller 4')] },
);

# ---------------------------------------------------------------- Pilares
our @PILARES = (
    ['bg-menta',       'Acompañamiento integral',   'Cada emprendedora recibe acompañamiento en su negocio: autoestima, modelo de negocio y finanzas.'],
    ['bg-coral',       'Acceso a mercados',         'Conectar los negocios con clientes nuevos, ferias, gremios y aliados comerciales.'],
    ['bg-mantequilla', 'Acceso a financiamiento',   'Educación financiera y ahorro y crédito en grupo, para no depender del «gota a gota».'],
    ['bg-agua',        'Apropiación del ecosistema','Cada satélite conoce y activa los actores de su territorio.'],
    ['bg-lavanda',     'Desarrollo del ser',        'La base de todo: confianza, liderazgo, derechos y cuidado de cada mujer.'],
);

# ---------------------------------------------------------------- Mapa de la región Caribe
# Proyección simple: x = (lon + 77) · 100 + 20, y = (12.75 − lat) · 100. Es un mapa esquemático.
sub _xy { my ($lon, $lat) = @_; return (sprintf('%.0f', ($lon + 77) * 100 + 20), sprintf('%.0f', (12.75 - $lat) * 100)) }
sub _poligono { return join ' ', map { join ',', _xy(@$_) } @_ }

my %DEPARTAMENTOS = (
    'La Guajira' => { color => 'var(--mantequilla)', etiqueta => [-72.05, 11.98], borde => [
        [-73.56, 11.25], [-73.20, 11.30], [-72.91, 11.54], [-72.44, 11.78], [-72.17, 12.20], [-71.95, 12.28], [-71.66, 12.46], [-71.40, 12.30],
        [-71.32, 11.85], [-71.98, 11.40], [-72.25, 11.10], [-72.55, 10.85], [-72.85, 10.48], [-73.10, 10.70], [-73.35, 10.88]] },
    'Magdalena' => { color => 'var(--menta)', etiqueta => [-74.30, 10.25], borde => [
        [-73.56, 11.25], [-73.35, 10.88], [-73.85, 10.30], [-73.80, 9.60], [-73.98, 9.00], [-74.35, 9.25], [-74.65, 9.75], [-74.80, 10.25],
        [-74.82, 10.70], [-74.85, 11.08], [-74.55, 10.98], [-74.25, 11.02], [-74.20, 11.25], [-73.90, 11.33]] },
    'Cesar' => { color => 'var(--durazno)', etiqueta => [-73.45, 9.25], borde => [
        [-73.35, 10.88], [-73.10, 10.70], [-72.85, 10.48], [-72.95, 9.95], [-73.15, 9.30], [-73.30, 8.70], [-73.45, 7.80], [-73.75, 7.75],
        [-73.88, 8.10], [-73.92, 8.60], [-73.98, 9.00], [-73.80, 9.60], [-73.85, 10.30]] },
    'Atlántico' => { color => 'var(--lavanda)', etiqueta => [-74.95, 11.30], borde => [
        [-74.85, 11.08], [-74.96, 11.00], [-75.12, 10.92], [-75.27, 10.79], [-75.18, 10.55], [-75.05, 10.35], [-74.80, 10.25], [-74.82, 10.70]] },
    'Bolívar' => { color => 'var(--agua)', etiqueta => [-74.40, 8.25], borde => [
        [-75.27, 10.79], [-75.45, 10.60], [-75.55, 10.42], [-75.60, 10.15], [-75.65, 9.90], [-75.35, 9.85], [-75.10, 9.55], [-74.95, 9.15],
        [-74.85, 8.75], [-74.95, 8.35], [-74.90, 7.90], [-74.60, 7.35], [-74.20, 7.05], [-73.95, 7.35], [-73.88, 8.10], [-73.92, 8.60],
        [-73.98, 9.00], [-74.35, 9.25], [-74.65, 9.75], [-74.80, 10.25], [-75.05, 10.35], [-75.18, 10.55]] },
    'Sucre' => { color => 'var(--coral)', etiqueta => [-75.15, 8.85], borde => [
        [-75.65, 9.90], [-75.55, 9.70], [-75.60, 9.52], [-75.68, 9.42], [-75.55, 9.15], [-75.35, 8.80], [-75.20, 8.55], [-74.95, 8.35],
        [-74.85, 8.75], [-74.95, 9.15], [-75.10, 9.55], [-75.35, 9.85]] },
    'Córdoba' => { color => 'var(--menta)', etiqueta => [-75.95, 7.85], borde => [
        [-76.30, 8.95], [-76.10, 9.25], [-75.90, 9.38], [-75.68, 9.42], [-75.55, 9.15], [-75.35, 8.80], [-75.20, 8.55], [-74.95, 8.35],
        [-75.30, 7.90], [-75.70, 7.45], [-76.15, 7.45], [-76.45, 7.95], [-76.55, 8.45]] },
);

# Mapa SVG con los departamentos, los municipios, los 8 satélites y su conexión con la Secretaría Técnica.
sub mapa_caribe {
    my ($st_x, $st_y) = (160, 64);   # Secretaría Técnica, en el mar
    my $deptos = join "\n", map {
        my $d = $DEPARTAMENTOS{$_};
        my ($lx, $ly) = _xy(@{ $d->{etiqueta} });
        qq{            <polygon class="mapa-depto" points="@{[ _poligono(@{ $d->{borde} }) ]}" style="fill:$d->{color}"/>\n}
      . qq{            <text class="mapa-depto-nombre" x="$lx" y="$ly" text-anchor="middle">$_</text>}
    } sort keys %DEPARTAMENTOS;
    my ($lineas, $pines) = ('', '');
    my $n = 0;
    for my $s (@SATELITES) {
        $n++;
        my ($px, $py) = _xy(@{ $s->{municipios}[0] }[1, 2]);
        my ($cx, $cy) = (($st_x + $px) / 2, ($st_y + $py) / 2 - 40);
        $lineas .= qq{            <path class="mapa-linea" data-sat="$s->{id}" d="M$st_x,@{[ $st_y + 22 ]} Q$cx,$cy $px,$py"/>\n};
        for my $m (@{ $s->{municipios} }[1 .. $#{ $s->{municipios} }]) {
            my ($mx, $my) = _xy(@$m[1, 2]);
            $pines .= qq{            <circle class="mapa-municipio" data-sat="$s->{id}" cx="$mx" cy="$my" r="4.5"/>\n};
        }
        $pines .= qq{            <g class="mapa-pin" data-sat="$s->{id}" transform="translate($px $py)"><circle r="14"/><text y="5" text-anchor="middle">$n</text></g>\n};
    }
    return <<"SVG";
        <svg class="mapa-svg" viewBox="20 10 600 580" role="img" aria-labelledby="mapa-titulo mapa-desc">
            <title id="mapa-titulo">Mapa de los satélites del CIC en la región Caribe</title>
            <desc id="mapa-desc">Mapa esquemático de siete departamentos del Caribe colombiano. La Secretaría Técnica se conecta con 8 satélites: La Guajira, Magdalena, Valledupar, Pueblo Bello, Atlántico, Bolívar, Sucre y Córdoba.</desc>
            <text class="mapa-mar" x="70" y="200">Mar Caribe</text>
$deptos
$lineas
$pines
            <g class="mapa-st" transform="translate($st_x $st_y)">
                <rect x="-78" y="-22" width="156" height="44" rx="22"/>
                <use href="#isotipo-neg" x="-68" y="-14" width="28" height="28"/>
                <text x="10" y="-2" text-anchor="middle">Secretaría</text>
                <text x="10" y="13" text-anchor="middle">Técnica</text>
            </g>
        </svg>
SVG
}

# Bloque completo: mapa + lista de satélites + ficha del satélite elegido (la interacción está en assets/sitio.js).
sub bloque_mapa {
    return <<"HTML";
                <div class="mapa-cic">
                    <figure class="mapa-figura aparece">
@{[ mapa_caribe() ]}                        <figcaption>Mapa esquemático. Las líneas muestran cómo la Secretaría Técnica acompaña a cada satélite.</figcaption>
                    </figure>
                    <div class="mapa-panel aparece">
                        <p class="mapa-panel-titulo">Los 8 satélites</p>
                        <ol class="satelites-lista">
@{[ satelites_lista() ]}
                        </ol>
                        <div class="satelite-info" aria-live="polite"><p>Toca un satélite para ver sus municipios y su equipo.</p></div>
                    </div>
                </div>
HTML
}

# Tarjetas de los cinco pilares (inicio y El CIC).
sub pilares_lista {
    my $n = 0;
    return join "
", map {
        my ($color, $titulo, $texto) = @$_;
        $n++;
        my $base = $titulo eq q{Desarrollo del ser} ? q{ pilar-base} : q{};
        qq{                    <li class="tarjeta pilar aparece$base"><span class="numero $color">$n</span><h3>$titulo</h3><p>$texto</p></li>}
    } @PILARES;
}

# Lista accesible de satélites que acompaña al mapa.
sub satelites_lista {
    my $n = 0;
    return join "\n", map {
        $n++;
        my $munis = join ' · ', map { $_->[0] } @{ $_->{municipios} };
        qq{                    <li><button type="button" class="satelite-btn" data-sat="$_->{id}" data-nombre="Satélite $_->{nombre}" data-depto="$_->{departamento}" data-municipios="$munis" aria-pressed="false"><span class="satelite-num">$n</span><span><b>$_->{nombre}</b><small>$munis</small></span></button></li>}
    } @SATELITES;
}

1;
