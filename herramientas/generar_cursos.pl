#!/usr/bin/perl
# Genera las páginas públicas de los cursos del equipo (dinamizadoras y Secretaría Técnica):
#   cursos/ · cursos/gestion-cic/ · cursos/acompanar-hacer/ · cursos/facilitar-ser/
# y la redirección de la dirección anterior rutas/gestion-cic/.
# Los datos salen del material de estudio y de los guiones del Drive (Material Plataforma).
# El contenido privado (videos, material de estudio y cuestionarios) se abre al ingresar.
# Uso (desde la carpeta LSM_CIC): perl herramientas/generar_cursos.pl
use strict;
use warnings;
use utf8;
use FindBin;
use lib $FindBin::Bin;
use Plantilla qw(simbolos nav pie cabeza cuerpo_inicio final_pagina escribir attr);
binmode STDOUT, ':encoding(UTF-8)';

my $BASE = 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC';

# ---------------------------------------------------------------- Datos de los cursos
my %CURSOS = (
  'gestion-cic' => {
    actual => 'gestion', color => 'bg-agua', titulo => 'Gestión del CIC',
    chip => 'Dinamizadoras y Secretaría Técnica · ≈ 2 horas',
    lead => 'El curso virtual para entender cómo funciona el Centro de Innovación Comunitaria: qué es, cómo se relaciona con su territorio, cómo opera, qué información registra y qué hace cada pilar. Es el primer curso que aprueba todo el equipo.',
    seo_titulo => 'Curso Gestión del CIC para dinamizadoras y Secretaría',
    seo_desc => 'Curso virtual de 5 módulos (≈ 2 horas) para dinamizadoras y Secretaría Técnica: cómo funciona el Centro de Innovación Comunitaria y su ecosistema.',
    ficha => [
      ['Para quién', 'Las 24 dinamizadoras de los 8 satélites y la Secretaría Técnica'],
      ['Acceso', 'Con tu cédula, si estás en la base de datos del equipo'],
      ['Duración', '≈ 2 horas · 5 módulos de 15 a 35 minutos'],
      ['Modalidad', '100 % virtual, a tu ritmo'],
      ['Evaluación', 'Cuestionario por módulo: 5 preguntas, se aprueba con 4 de 5, 2 intentos'],
      ['Al terminar', 'Constancia al aprobar los 5 módulos'],
    ],
    pasos_titulo => 'Cómo es cada módulo',
    pasos => [
      ['Mira el video', 'Entre 8 y 10 minutos, en formato entrevista.'],
      ['Estudia la guía', 'Ideas clave, un ejemplo, mitos y realidades, un paso a paso y una plantilla.'],
      ['Haz la actividad', 'Aplicas el módulo a tu satélite: por ejemplo, el mapa de actores de tu territorio.'],
      ['Responde el cuestionario', '5 preguntas; apruebas con 4. Si no apruebas en el segundo intento, el módulo se bloquea hasta volver a ver el video y el material de refuerzo.'],
    ],
    unidad => 'Módulo', abrev => 'M', ancla => 'modulo',
    temario_intro => 'Cinco módulos en orden: cada uno se abre al aprobar el anterior.',
    unidades => [
      { t => 'Introducción a la gestión de centros de innovación', meta => '20 min · video de 10 min',
        p => 'Qué significa gestionar un centro de innovación y qué hace diferente a un Centro de Innovación Comunitario para la autonomía económica de la mujer.',
        logra => 'Explicas con tus palabras qué es el CIC y cuál es tu lugar en él.' },
      { t => 'El ecosistema emprendedor y el papel del CIC', meta => '25 min · video de 9 min',
        p => 'El ecosistema de emprendimiento del territorio, sus seis dimensiones y cómo el centro se inserta en él como actor articulador.',
        logra => 'Elaboras un mapa rápido de actores de tu territorio, organizado por dimensión.' },
      { t => 'Cómo opera el centro', meta => '25 min · video de 9 min',
        p => 'Las funciones de la Secretaría Técnica, la relación con los satélites, el flujo semanal de reportes y la gobernanza con la Red de Mujeres del Caribe.',
        logra => 'Conoces tu rol, a quién reportas, cuándo lo haces y qué hacer cuando algo no sale como se planeó.' },
      { t => 'La información del centro', meta => '15 min · video de 8 min',
        p => 'Cómo registrar en la plataforma la información de cada emprendedora y de cada sesión, con calidad y cuidando los datos personales.',
        logra => 'Registras correctamente una sesión de prueba.' },
      { t => 'Los pilares en acción', meta => '35 min · video de 9 min',
        p => 'Qué hace en la práctica cada pilar —acompañamiento, acceso a financiamiento y acceso a mercados— y cómo se traduce en acciones concretas del satélite.',
        logra => 'Identificas las acciones concretas de tu pilar en tu satélite.' },
    ],
    faq => [
      ['¿Quién debe hacer este curso?', 'Las 24 dinamizadoras de los 8 satélites y el equipo de la Secretaría Técnica. Es el primer curso del equipo.'],
      ['¿Cómo entro?', 'Toca «Ingresar», elige «Dinamizadora» o «Secretaria» y escribe tu cédula. La primera vez, toca «Activar mi cuenta» y usa el código que te llega al correo o que te envía la Secretaría Técnica; ahí creas tu contraseña y te llegará un correo de confirmación.'],
      ['¿Qué pasa si no apruebo un cuestionario?', 'Tienes dos intentos. Si en el segundo no llegas a 4 de 5, el módulo se bloquea hasta que vuelvas a ver el video y el material de refuerzo.'],
      ['¿Puedo hacerlo desde el celular?', 'Sí. Los videos son cortos y la plataforma guarda tu avance para que sigas donde lo dejaste.'],
    ],
  },
  'acompanar-hacer' => {
    actual => 'acompanar-hacer', color => 'bg-durazno', titulo => 'Acompañar la ruta HACER',
    chip => 'Dinamizadoras de acompañamiento · 6 semanas',
    lead => 'La preparación de cada semana de la ruta HACER: qué pasa en la sesión con la emprendedora, cómo conducirla paso a paso y cómo registrarla. Se estudia antes de cada visita.',
    seo_titulo => 'Acompañar la ruta HACER · curso para dinamizadoras del CIC',
    seo_desc => 'Curso para dinamizadoras: cómo preparar, conducir y registrar cada una de las 6 sesiones de la ruta HACER con las emprendedoras del Caribe.',
    ficha => [
      ['Para quién', 'Dinamizadoras de acompañamiento de los 8 satélites'],
      ['Acceso', 'Con tu cédula, si estás en la base de datos del equipo'],
      ['Duración', '6 semanas · una por cada sesión de la ruta HACER'],
      ['Cada semana', 'Video (≤ 10 min) · material de estudio · cuestionario · verificación de la sesión'],
      ['Evaluación', 'Cuestionario: 5 preguntas al azar de un banco de 10, se aprueba con 4 · verificación con rúbrica de evidencias'],
      ['Revisa', 'La Secretaría Técnica'],
    ],
    pasos_titulo => 'Cómo es cada semana',
    pasos => [
      ['Mira el video', 'En menos de diez minutos entiendes qué se hace en la sesión de la semana.'],
      ['Estudia el material', 'La sesión paso a paso, frases útiles, situaciones difíciles, el caso de Marta y la lista de chequeo.'],
      ['Responde el cuestionario', 'Antes de la visita: 5 preguntas de un banco de 10; apruebas con 4. Tienes 2 intentos.'],
      ['Acompaña y registra', 'Conduces la sesión con la emprendedora y la registras el mismo día. La Secretaría revisa las evidencias.'],
    ],
    unidad => 'Semana', abrev => 'S', ancla => 'semana', guia => 'rutas/hacer/#semana-',
    temario_intro => 'Cada semana prepara una sesión de 2 horas con la emprendedora, en su negocio. La guía de la emprendedora de cada sesión es pública.',
    unidades => [
      { t => 'Primer encuentro: entender la dinámica real del negocio', sesion => 'Cuéntame tu negocio',
        idea => 'Escuchar antes de enseñar: en esta sesión no se enseña ni se corrige; se aprende cómo funciona el negocio.',
        aprende => ['Aplicar el protocolo de primer encuentro: escucha activa, confianza y cero juicios.', 'Conducir las cinco preguntas del negocio y reformularlas cuando la emprendedora duda.', 'Llevar la conversación guiada con el Diario de Empatía Financiera y Productiva.', 'Acompañar el primer registro de ventas, gastos e inventario y cerrar con «Lo que entendí de tu negocio».'],
        momentos => ['Las cinco preguntas · 25 min', 'Conversación guiada · 30 min', 'Primer registro · 50 min', 'Cierre · 15 min'] },
      { t => 'Modelo de negocio: el Canvas de la Esquina y nuevas fuentes de ingreso', sesion => 'Mi negocio puede ganar de otra forma',
        idea => 'El negocio no se cambia, se amplía: otra forma de ganar con lo que ya sabe hacer, probada en pequeño.',
        aprende => ['Prearmar el Canvas de la Esquina con lo que se escuchó en la semana 1.', 'Revisar el lienzo bloque por bloque y hacer las tres preguntas vitales.', 'Presentar las siete fuentes de ingreso y explicar qué es pivotar.', 'Ayudar a elegir una fuente y diseñar un prototipo pequeño con su plan de prueba.'],
        momentos => ['Qué haremos hoy · 10 min', 'El modelo de mi negocio · 35 min', 'Nuevas fuentes de ingreso · 45 min', 'Elijo y prototipo · 15 min', 'Plan de la semana · 15 min'] },
      { t => 'Análisis de mercado: ¿qué va a pasar mañana?', sesion => 'Mirar más allá de mi cuadra',
        idea => 'Los clientes cambian aunque el negocio no cambie: se trata de prepararse, no de adivinar el futuro.',
        aprende => ['Explicar con palabras sencillas mercado, sector, tendencia y moda.', 'Usar la vida de un producto para pensar en los próximos cinco años.', 'Acompañar la matriz de tendencias dejando que la emprendedora hable primero.', 'Conectar las tendencias con el prototipo y cerrar con una decisión de cambio.'],
        momentos => ['Por qué mirar tendencias · 15 min', 'Mercado y sector · 20 min', 'Matriz de tendencias · 45 min', 'Conecto con mi prototipo · 25 min', 'Mi decisión de cambio · 15 min'] },
      { t => 'Costos y finanzas frugales: el bolsillo separado', sesion => 'El bolsillo separado',
        idea => 'Si no separa la plata del hogar y la del negocio, no sabe si su negocio gana o pierde.',
        aprende => ['Conducir el ejercicio de los dos bolsillos y leer su resultado con la clave (A7).', 'Acompañar el costeo del producto principal, incluida la mano de obra propia.', 'Ayudar a decidir un nuevo precio con piso y techo.', 'Calcular el punto de equilibrio por mes, semana o día, con calculadora.'],
        momentos => ['Los dos bolsillos · 15 min', '¿Cómo definí mi precio? · 20 min', 'Costos y nuevo precio · 45 min', 'Punto de equilibrio · 25 min', 'Registro y tarea guiada · 15 min'] },
      { t => 'Acceso a mercados: mi plan comercial', sesion => 'Cómo vender más',
        idea => 'Pasar de «le vendo a cualquiera» a nombres concretos, acciones con fecha y una meta de ventas.',
        aprende => ['Conducir las cinco preguntas del plan comercial y convertir cada respuesta en una acción con fecha.', 'Acompañar «Mi CRM» y orientar lo básico de WhatsApp Business.', 'Armar y ensayar con ella un pitch de un minuto.', 'Fijar la meta comercial con la regla del punto de equilibrio y un primer paso de formalización.'],
        momentos => ['¿Cómo lo llevo afuera? · 15 min', 'Plan comercial · 40 min', 'Mi CRM y mi pitch · 35 min', 'Lo que pide el comprador · 15 min', 'Plan y meta · 15 min'] },
      { t => 'Plan de inversión y acceso a financiamiento', sesion => 'Crecer con orden',
        idea => 'Crecer con orden: se invierte en lo que el mercado ya pidió y los números pueden pagar.',
        aprende => ['Revisar la tarea guiada de la semana 4 y los resultados del plan comercial.', 'Acompañar un plan de inversión simplificado y calcular su recuperación.', 'Presentar la UMC sin presión y compararla con el préstamo «gota a gota».', 'Cerrar la ruta HACER: portafolio, próximos pasos, retroalimentación y requisitos de la constancia.'],
        momentos => ['Revisión de la tarea · 20 min', 'Configuración de valor · 25 min', 'Plan de inversión · 45 min', 'Invitación a la UMC · 15 min', 'Cierre de la ruta · 15 min'] },
    ],
    faq => [
      ['¿Cuándo estudio cada semana?', 'Antes de la visita a la emprendedora: primero el video y el material, después el cuestionario. Así llegas lista a la sesión.'],
      ['¿Qué es la verificación de la sesión?', 'Es la segunda parte de la evaluación: al cerrar la sesión registras sus resultados y evidencias en la plataforma, y la Secretaría Técnica los revisa con una rúbrica. Si falta algo, te da retroalimentación antes de la semana siguiente.'],
      ['¿Qué ve la emprendedora?', 'Su guía de cada sesión, que es pública, y las plantillas de la biblioteca. El material de estudio y los cuestionarios son solo para el equipo.'],
      ['¿Necesito haber hecho el curso de Gestión del CIC?', 'Sí: es el primer curso del equipo y explica cómo opera el centro y cómo se registra la información.'],
    ],
  },
  'facilitar-ser' => {
    actual => 'facilitar-ser', color => 'bg-lavanda', titulo => 'Facilitar la ruta SER',
    chip => 'Las tres dinamizadoras de cada satélite · 4 talleres',
    lead => 'La preparación de los cuatro talleres grupales de la ruta SER: cómo abrir un espacio de confianza, facilitar cada momento minuto a minuto, cuidar al grupo —también en lo virtual— y registrar el taller.',
    seo_titulo => 'Facilitar la ruta SER · curso para dinamizadoras del CIC',
    seo_desc => 'Curso para dinamizadoras: cómo preparar y facilitar los 4 talleres grupales de la ruta SER, presenciales y virtuales, con protocolos de cuidado.',
    ficha => [
      ['Para quién', 'Las tres dinamizadoras de cada satélite: acompañamiento, mercados y financiamiento'],
      ['Acceso', 'Con tu cédula, si estás en la base de datos del equipo'],
      ['Duración', '4 talleres de 4 horas: 2 presenciales y 2 virtuales'],
      ['Cada taller', 'Video (≤ 10 min) · guía de facilitación · evaluación'],
      ['Incluye', 'Protocolos de cuidado, facilitación virtual y baja conectividad'],
      ['Revisa', 'La Secretaría Técnica'],
    ],
    pasos_titulo => 'Cómo es cada taller',
    pasos => [
      ['Mira el video', 'En diez minutos entiendes de qué trata el taller y cómo se vive.'],
      ['Estudia la guía de facilitación', 'El taller minuto a minuto: consignas, frases útiles, protocolo de cuidado y un caso.'],
      ['Prepara con tu equipo', 'Las tres dinamizadoras del satélite se reparten los roles, la convocatoria y los materiales.'],
      ['Facilita y registra', 'Conduces el taller y registras el mismo día la asistencia, las evidencias y la bitácora.'],
    ],
    unidad => 'Taller', abrev => 'T', ancla => 'taller', guia => 'rutas/ser/#taller-',
    temario_intro => 'Cada taller dura 4 horas y reúne a las emprendedoras del satélite. La guía de la emprendedora de cada taller es pública.',
    unidades => [
      { t => 'Autoestima, identidad de gerenta y proyecto de vida', sesion => 'De la subsistencia a la gerencia', modo => 'Presencial',
        idea => 'No se trata de enseñar a gerenciar, sino de que cada emprendedora se reconozca como la gerenta que ya es.',
        aprende => ['Abrir un espacio de confianza con acuerdos de cuidado y la ronda de saberes heredados.', 'Acompañar el paso de «vendedora» a «gerenta», incluido el reconocimiento del trabajo de cuidado.', 'Conducir el árbol de vida y cuidar al grupo cuando aparecen recuerdos dolorosos.', 'Acompañar el mapa de sueños y organizar «Presento mi negocio» en un minuto.'],
        momentos => ['Saberes heredados · 20 min', 'El lenguaje construye realidad · 30 min', 'Árbol de vida · 50 min', 'Mapa de sueños · 60 min', 'Presento mi negocio · 60 min', 'Tarjeta de gerenta · 20 min'] },
      { t => 'Pensamiento crítico, resiliencia y toma de decisiones', sesion => 'De la visión de túnel a la visión panorámica', modo => 'Virtual',
        idea => 'La resiliencia se entrena: decidir con información, sin dejar que el miedo decida.',
        aprende => ['Preparar un taller virtual: enlace, prueba de conexión, salas pequeñas y plan B.', 'Ejercer los tres roles de la sala virtual: anfitriona, chat y soporte, salas pequeñas.', 'Acompañar el miedo a «los números» sin minimizarlo ni reforzarlo.', 'Guiar el análisis de una decisión difícil con la A15 y construir el mapa de tendencias del territorio.'],
        momentos => ['Cómo llego hoy · 20 min', 'Túnel y panorama · 30 min', 'La resiliencia se entrena · 50 min', 'Mi decisión difícil · 60 min', 'Lo que viene en nuestro mercado · 60 min', 'Lo que ya no me da miedo · 20 min'] },
      { t => 'Liderazgo, derechos y vida libre de violencias', sesion => 'Mi liderazgo, mis derechos, mi protección', modo => 'Presencial',
        idea => 'Un espacio seguro y confidencial para reconocer derechos, rutas de atención y espacios de participación.',
        aprende => ['Explicar los derechos de las mujeres y los tipos de violencia, en especial la económica y patrimonial.', 'Preparar con la Secretaría un directorio de rutas de atención verificado.', 'Aplicar con calma el protocolo de cuidado si una participante cuenta una situación de violencia.', 'Acompañar el ensayo del pitch frente al grupo y el compromiso de liderazgo.'],
        momentos => ['Acuerdos de cuidado · 20 min', 'Un caso para pensar · 30 min', 'Derechos y tipos de violencia · 50 min', 'Rutas y espacios del territorio · 60 min', 'De conocidos a desconocidos · 60 min', 'Compromiso de liderazgo · 20 min'] },
      { t => 'Tejido social, comunicación asertiva y resolución de conflictos', sesion => 'La confianza que sostiene', modo => 'Virtual',
        idea => 'La red de confianza sostiene el negocio: hablar claro, resolver desacuerdos y ahorrar juntas.',
        aprende => ['Facilitar con poca conectividad: audio primero, consignas escritas y plan B por WhatsApp.', 'Enseñar la comunicación asertiva con la fórmula de cuatro partes.', 'Acompañar el protocolo de tres pasos para resolver desacuerdos.', 'Conducir «Ahorrar juntas», registrar el interés en la UMC y cerrar la ruta SER.'],
        momentos => ['Una persona que me ayudó · 20 min', 'Gota a gota o red de confianza · 30 min', 'Comunicación asertiva · 50 min', 'Resolución de conflictos · 60 min', 'Ahorrar juntas · 60 min', 'Acuerdos de corresponsabilidad · 20 min'] },
    ],
    faq => [
      ['¿Quiénes facilitan cada taller?', 'Las tres dinamizadoras del satélite —acompañamiento, acceso a mercados y acceso a financiamiento—, con los roles repartidos de antemano.'],
      ['¿Cómo se facilitan los talleres virtuales?', 'La guía trae los tres roles de la sala, los acuerdos de la sala virtual, cómo usar salas pequeñas, qué hacer con baja conectividad y el protocolo si alguien se cae de la conexión.'],
      ['¿Qué pasa si una participante cuenta una situación de violencia?', 'El curso incluye un protocolo de cuidado para actuar con calma durante y después del taller, y el directorio de rutas de atención del territorio verificado con la Secretaría Técnica.'],
      ['¿Qué ve la emprendedora?', 'Su guía de cada taller, que es pública. La guía de facilitación y la evaluación son solo para el equipo.'],
    ],
  },
);
my @ORDEN = ('gestion-cic', 'acompanar-hacer', 'facilitar-ser');


sub botones_ingreso {
    my ($P, $clase) = @_;
    $clase //= 'btn-primario';
    return qq{<a class="btn $clase" href="${P}#ingresar-dinamizadora">Ingresar como dinamizadora</a>\n                            <a class="btn btn-claro" href="${P}#ingresar-secretaria">Ingresar como secretaria</a>};
}

# ---------------------------------------------------------------- Página de cada curso
for my $slug (@ORDEN) {
    my $c = $CURSOS{$slug};
    my $P = '../../';
    my $url = "$BASE/cursos/$slug/";
    my $ficha = join "\n", map { qq{                            <dt>$_->[0]</dt><dd>$_->[1]</dd>} } @{ $c->{ficha} };
    my $pasos = join "\n", map { qq{                        <li><span><b>$_->[0].</b> $_->[1]</span></li>} } @{ $c->{pasos} };
    my $n = 0;
    my $temario = join "\n", map {
        my $u = $_; $n++;
        my $titulo = $u->{t};
        my $meta = $u->{meta} // ($c->{unidad} eq 'Semana' ? 'Sesión de 2 horas · video de 10 min' : "$u->{modo} · 4 horas · video de 10 min");
        my $sesion = $u->{sesion} ? qq{<p class="texto-suave" style="margin-top:.2rem">Sesión con las emprendedoras: <b>«$u->{sesion}»</b></p>} : '';
        my $idea = $u->{idea} ? qq{<p class="logra"><b>Idea central:</b> $u->{idea}</p>} : '';
        my $aprende = $u->{aprende} ? '<p style="font-weight:700;margin-top:.9rem;color:var(--bosque)">Qué vas a aprender</p><ul class="lista-check">' . join('', map { "<li>$_</li>" } @{ $u->{aprende} }) . '</ul>' : '';
        my $logra = $u->{logra} ? qq{<p class="logra"><b>Resultado esperado:</b> $u->{logra}</p>} : '';
        my $momentos = $u->{momentos} ? '<div class="llevas"><span>La sesión:</span>' . join('', map { "<span class=\"chip\">$_</span>" } @{ $u->{momentos} }) . '</div>' : '';
        my $guia = $c->{guia} ? qq{<a class="abrir-leccion" href="$P$c->{guia}$n">Ver la semana de la emprendedora y sus descargas →</a>} : '';
        my $privado = qq{<p class="privado"><svg aria-hidden="true"><use href="#candado"/></svg>Video, material de estudio y cuestionario: al ingresar con tu cédula</p>};
        <<"LI";
                    <li id="$c->{ancla}-$n" class="paso-ruta aparece">
                        <span class="numero $c->{color}">$c->{abrev}$n</span>
                        <div class="tarjeta">
                            <span class="meta">$c->{unidad} $n · $meta</span>
                            <h3>$titulo</h3>
                            $sesion
                            $idea
                            @{[ $u->{p} ? "<p>$u->{p}</p>" : '' ]}
                            $aprende
                            $logra
                            $momentos
                            $privado
                            $guia
                        </div>
                    </li>
LI
    } @{ $c->{unidades} };
    my $faq = join "\n", map { qq{                        <details><summary>$_->[0]</summary><p>$_->[1]</p></details>} } @{ $c->{faq} };
    my $otros = join "\n", map {
        my $o = $CURSOS{$_};
        qq{                    <a class="otra-ruta $o->{color} aparece" href="../$_/"><small class="eyebrow" style="color:var(--bosque)">$o->{chip}</small><h3>$o->{titulo}</h3><span>Ver el curso →</span></a>}
    } grep { $_ ne $slug } @ORDEN;
    my $syllabus = join ",\n", map { qq{            { "\@type": "Syllabus", "name": "@{[ attr($_->{t}) ]}" }} } @{ $c->{unidades} };
    my $jsonld = <<"JSON";
    {
      "\@context": "https://schema.org",
      "\@graph": [
        { "\@type": "Course", "name": "$c->{titulo}", "description": "@{[ attr($c->{seo_desc}) ]}", "url": "$url",
          "provider": { "\@type": "EducationalOrganization", "name": "Centro de Innovación Comunitaria (CIC)", "url": "$BASE/" },
          "inLanguage": "es-CO", "audience": { "\@type": "Audience", "audienceType": "Dinamizadoras y Secretaría Técnica del CIC" },
          "isAccessibleForFree": true, "educationalCredentialAwarded": "Constancia de participación",
          "syllabusSections": [
$syllabus
          ] },
        { "\@type": "BreadcrumbList", "itemListElement": [
            { "\@type": "ListItem", "position": 1, "name": "Inicio", "item": "$BASE/" },
            { "\@type": "ListItem", "position": 2, "name": "Cursos del equipo", "item": "$BASE/cursos/" },
            { "\@type": "ListItem", "position": 3, "name": "$c->{titulo}" } ] }
      ]
    }
JSON
    my $html = cabeza(P => $P, titulo => "$c->{seo_titulo}", desc => $c->{seo_desc}, url => $url, jsonld => $jsonld, og => "$c->{titulo} · Cursos del equipo del CIC")
      . cuerpo_inicio($P, $c->{actual}) . <<"HTML";

    <main id="contenido" class="pagina-ruta">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol>
                <li><a href="$P">Inicio</a></li>
                <li><a href="../">Cursos del equipo</a></li>
                <li><span aria-current="page">$c->{titulo}</span></li>
            </ol>
        </nav>

        <div class="contenedor">
            <section class="ruta-heroe $c->{color}" aria-labelledby="titulo-ruta">
                <div class="patron-hojas animado" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="7" data-color="rgba(255,255,255,.75)" aria-hidden="true"></div>
                <div class="ruta-heroe-grid">
                    <div>
                        <span class="chip" style="background:rgba(255,255,255,.6)">$c->{chip}</span>
                        <h1 id="titulo-ruta">$c->{titulo}</h1>
                        <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                        <p class="lead">$c->{lead}</p>
                        <div class="botones" style="margin-top:1.6rem">
                            @{[ botones_ingreso($P) ]}
                        </div>
                    </div>
                    <aside class="ficha-tarjeta" aria-label="Ficha del curso">
                        <dl class="ficha">
$ficha
                        </dl>
                    </aside>
                </div>
            </section>
        </div>

        <section class="bloque con-decor" aria-labelledby="titulo-como">
            <div class="patron-puntos decor decor-derecha" aria-hidden="true"></div>
            <div class="contenedor">
                <p class="eyebrow">Cómo funciona</p>
                <h2 id="titulo-como" style="margin-top:.4rem">$c->{pasos_titulo}</h2>
                <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                <ol class="pasos" style="margin-top:1.4rem;gap:.9rem;max-width:46rem">
$pasos
                </ol>
                <aside class="recuadro fresco" style="max-width:46rem;margin-top:1.6rem"><p class="recuadro-titulo">Contenido para el equipo</p><p>Los videos, el material de estudio y los cuestionarios son solo para dinamizadoras y Secretaría Técnica: se abren al ingresar con tu cédula, si estás en la base de datos del equipo. Esta página muestra de qué trata el curso.</p></aside>
            </div>
        </section>

        <section id="temario" class="bloque con-decor" aria-labelledby="titulo-temario">
            <div class="patron-ondas animado decor decor-izquierda" aria-hidden="true"></div>
            <div class="contenedor">
                <p class="eyebrow">Temario</p>
                <h2 id="titulo-temario" style="margin-top:.4rem">@{[ scalar @{ $c->{unidades} } ]} @{[ lc $c->{unidad} ]}@{[ $c->{unidad} eq 'Taller' ? 'es' : 's' ]}, paso a paso.</h2>
                <p class="intro">$c->{temario_intro}</p>
                <ol class="linea">
$temario
                </ol>
            </div>
        </section>

        <section class="bloque" aria-labelledby="titulo-faq">
            <div class="contenedor dos-col">
                <div class="aparece">
                    <p class="eyebrow">Preguntas frecuentes</p>
                    <h2 id="titulo-faq" style="font-size:1.6rem;margin:.4rem 0 1rem">Lo que suelen preguntar</h2>
                    <div class="preguntas">
$faq
                    </div>
                </div>
                <div class="aparece">
                    <p class="eyebrow">Otros cursos del equipo</p>
                    <div class="rejilla" style="margin-top:1rem">
$otros
                    </div>
                </div>
            </div>
            <div class="contenedor">
                <div class="cta-banda">
                    <div class="patron-hojas animado" aria-hidden="true"></div>
                    <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                    <div>
                        <h2>Empieza $c->{titulo}</h2>
                        <p>Entra con tu cédula. La primera vez, activa tu cuenta con el código que te llega al correo o que te envía la Secretaría Técnica.</p>
                    </div>
                    <div class="botones" style="margin:0">
                        <a class="btn btn-claro" href="${P}#ingresar-dinamizadora">Soy dinamizadora</a>
                        <a class="btn btn-claro" href="${P}#ingresar-secretaria">Soy secretaria</a>
                    </div>
                </div>
            </div>
        </section>
    </main>
HTML
    $html .= final_pagina($P);
    escribir("cursos/$slug/index.html", $html);
}

# ---------------------------------------------------------------- Catálogo de cursos
{
    my $P = '../';
    my $url = "$BASE/cursos/";
    my $tarjetas = join "\n", map {
        my $c = $CURSOS{$_};
        my $u = scalar @{ $c->{unidades} };
        qq{                    <article class="ruta aparece">
                        <div class="ruta-cab $c->{color}">
                            <span class="chip" style="background:rgba(255,255,255,.55)">$c->{chip}</span>
                            <h3>$c->{titulo}</h3>
                        </div>
                        <div class="ruta-cuerpo">
                            <p class="texto-suave">$c->{lead}</p>
                            <div class="ruta-pie"><a class="btn btn-primario btn-pequeno" href="$_/">Ver el curso</a></div>
                        </div>
                    </article>}
    } @ORDEN;
    my $html = cabeza(P => $P, titulo => 'Cursos del equipo del CIC · dinamizadoras y Secretaría', desc => 'Formación para dinamizadoras y Secretaría Técnica del CIC: gestión del centro y cómo acompañar las rutas HACER y SER con las emprendedoras del Caribe.', url => $url, og => 'Cursos del equipo · Centro de Innovación Comunitaria')
      . cuerpo_inicio($P, 'cursos') . <<"HTML";

    <main id="contenido" class="pagina-ruta">
        <nav class="migas contenedor" aria-label="Ruta de navegación">
            <ol><li><a href="$P">Inicio</a></li><li><span aria-current="page">Cursos del equipo</span></li></ol>
        </nav>
        <div class="contenedor">
            <section class="biblio-heroe" aria-labelledby="titulo-cursos">
                <div class="patron-hojas animado decor decor-derecha" aria-hidden="true"></div>
                <div class="hojas-flotantes" data-hojas="6" aria-hidden="true"></div>
                <div class="contenido">
                    <p class="eyebrow">Formación del equipo</p>
                    <h1 id="titulo-cursos">Cursos para quienes acompañan.</h1>
                    <svg class="trazo" aria-hidden="true"><use href="#trazo"/></svg>
                    <p class="lead">El conocimiento del CIC baja en cascada: la Secretaría Técnica forma a las dinamizadoras y ellas acompañan a cada emprendedora. Estos cursos preparan al equipo para gestionar el centro y para conducir las rutas HACER y SER.</p>
                    <p class="biblio-cifras"><span><b data-contar="3">3</b>cursos</span><span><b data-contar="15">15</b>módulos, semanas y talleres</span><span><b data-contar="24">24</b>dinamizadoras</span></p>
                    <div class="botones" style="margin-top:1.4rem">
                        @{[ botones_ingreso($P) ]}
                    </div>
                </div>
            </section>
        </div>

        <section class="bloque" aria-labelledby="titulo-lista-cursos">
            <div class="contenedor">
                <h2 id="titulo-lista-cursos" class="sr-only">Cursos</h2>
                <div class="rejilla r3">
$tarjetas
                </div>
            </div>
        </section>

        <section class="bloque con-decor" aria-labelledby="titulo-acceso">
            <div class="patron-puntos decor decor-derecha" aria-hidden="true"></div>
            <div class="contenedor dos-col">
                <div class="tarjeta aparece">
                    <p class="eyebrow">Quién entra</p>
                    <h2 id="titulo-acceso" style="font-size:1.6rem;margin:.4rem 0 1.2rem">Acceso solo para el equipo</h2>
                    <ol class="requisitos">
                        <li>Las dinamizadoras y la Secretaría Técnica entran con su cédula, si están en la base de datos del equipo.</li>
                        <li>La primera vez, cada persona activa su cuenta con un código de 6 números (llega al correo o lo envía la Secretaría Técnica) y crea su propia contraseña.</li>
                        <li>Las emprendedoras no ven estos cursos: ellas se inscriben en los <a class="enlace" href="${P}#rutas">talleres</a>.</li>
                    </ol>
                </div>
                <div class="tarjeta aparece">
                    <p class="eyebrow">Cómo se evalúa</p>
                    <h2 style="font-size:1.6rem;margin:.4rem 0 1.2rem">Aprender y demostrarlo</h2>
                    <ol class="requisitos">
                        <li>Cada módulo, semana o taller tiene un cuestionario: se aprueba con 4 de 5 respuestas, con 2 intentos. Cada unidad se abre al aprobar la anterior y enviar su evidencia.</li>
                        <li>Si no se aprueba el segundo intento, se vuelve a ver el video y el material antes de intentarlo otra vez.</li>
                        <li>En HACER y SER, además, se verifica la sesión con la emprendedora: la Secretaría revisa las evidencias.</li>
                    </ol>
                </div>
            </div>
        </section>
    </main>
HTML
    $html .= final_pagina($P);
    escribir('cursos/index.html', $html);
}

# ---------------------------------------------------------------- Dirección anterior del curso de Gestión
escribir('rutas/gestion-cic/index.html', <<"HTML");
<!DOCTYPE html>
<html lang="es-CO">
<head>
    <meta charset="UTF-8">
    <title>Gestión del CIC · Cursos del equipo</title>
    <meta name="robots" content="noindex">
    <link rel="canonical" href="$BASE/cursos/gestion-cic/">
    <meta http-equiv="refresh" content="0; url=../../cursos/gestion-cic/">
</head>
<body>
    <p>El curso de Gestión del CIC ahora está en <a href="../../cursos/gestion-cic/">Cursos del equipo</a>.</p>
    <script>location.replace('../../cursos/gestion-cic/' + location.hash);</script>
</body>
</html>
HTML
