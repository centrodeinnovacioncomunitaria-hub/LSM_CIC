// Correo de finalización: le llega a cada persona del equipo que termina y aprueba los tres cursos
// (Gestión del CIC, Acompañar la ruta HACER y Facilitar la ruta SER). Diseño «Florecer» entregado por el CIC;
// las imágenes están publicadas en la página (assets/correo/) porque Gmail no muestra imágenes locales ni SVG.
'use strict';

const BASE = 'https://cicredmujeresdelcaribe.org/assets/correo/';
const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// d: { nombrePila, nombreCompleto, fechaFin, fechaEvento, lugarEvento }
function htmlFinalizacion(d) {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>¡Lo lograste! Tu constancia de finalización · CIC</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}
  body{margin:0;padding:0;width:100%!important;background:#FFF6EE}
  a{color:#B04A36}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important}
    .px{padding-left:22px!important;padding-right:22px!important}
    .h1{font-size:30px!important;line-height:38px!important}
    .lbl{display:block!important;width:100%!important;padding-bottom:2px!important}
    .val{display:block!important;width:100%!important;padding-top:0!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#FFF6EE;">

<!-- Texto de vista previa (preheader) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#FFF6EE;">
  Terminaste los tres cursos. Este correo es suficiente para entrar al evento fundacional del CIC.
  &#8199;&#847; &#8199;&#847; &#8199;&#847; &#8199;&#847; &#8199;&#847; &#8199;&#847; &#8199;&#847; &#8199;&#847;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF6EE" style="background:#FFF6EE;">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <!-- Tarjeta principal -->
    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:22px;border:1px solid #F0E2D2;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <!-- Franja de hojas -->
        <tr><td bgcolor="#FFF6EE" style="background:#FFF6EE;border-radius:22px 22px 0 0;line-height:0;font-size:0;">
          <img src="${BASE}hojas.png" width="600" alt="" style="width:100%;max-width:600px;height:auto;border-radius:22px 22px 0 0;">
        </td></tr>

        <!-- Logo -->
        <tr><td align="center" class="px" bgcolor="#FFF6EE" style="background:#FFF6EE;padding:6px 40px 26px;">
          <img src="${BASE}logo_cic.png" width="230" alt="CIC · Centro de Innovación Comunitaria para la Autonomía Económica de la Mujer" style="width:230px;height:auto;margin:0 auto;">
        </td></tr>

        <!-- Encabezado -->
        <tr><td align="center" class="px" style="padding:38px 44px 6px;">
          <div style="font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:#B04A36;">
            Constancia de finalización
          </div>
          <h1 class="h1" style="margin:14px 0 0;font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:38px;line-height:46px;color:#2E4A3E;">
            ¡Lo lograste, ${e(d.nombrePila)}!<br>Ya <span style="color:#B04A36;">floreciste</span> en los tres cursos
          </h1>
          <p style="margin:18px 0 0;font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:17px;line-height:28px;color:#2E4A3E;">
            Viste todos los videos y aprobaste todas las evaluaciones.
            Con este correo ya tienes lo necesario para entrar al
            <strong>evento fundacional del Centro de Innovación Comunitaria para la Autonomía de la Mujer en el Caribe colombiano</strong>.
          </p>
        </td></tr>

        <!-- Trazo firme -->
        <tr><td align="center" class="px" style="padding:22px 44px 8px;line-height:0;font-size:0;">
          <img src="${BASE}trazo.png" width="260" alt="" style="width:260px;height:auto;margin:0 auto;">
        </td></tr>

        <!-- Pase de entrada -->
        <tr><td class="px" style="padding:18px 44px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF6EE" style="background:#FFF6EE;border:2px dashed #9ED0B7;border-radius:18px;">
            <tr><td style="padding:24px 26px 8px;">
              <div style="font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:#2E4A3E;">
                &#127807;&nbsp; Tu pase al evento
              </div>
              <div style="margin-top:8px;font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:20px;line-height:28px;color:#2E4A3E;">
                Este correo es suficiente para entrar.
              </div>
            </td></tr>
            <tr><td style="padding:6px 26px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:15px;line-height:22px;color:#2E4A3E;">
                <tr>
                  <td class="lbl" width="38%" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;color:#2E4A3E;font-weight:700;">Participante</td>
                  <td class="val" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;">${e(d.nombreCompleto)}</td>
                </tr>
                <tr>
                  <td class="lbl" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;font-weight:700;">Cursos finalizados</td>
                  <td class="val" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;">Los 3 cursos · el ${e(d.fechaFin)}</td>
                </tr>
                <tr>
                  <td class="lbl" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;font-weight:700;">Fecha del evento</td>
                  <td class="val" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;">${e(d.fechaEvento)}</td>
                </tr>
                <tr>
                  <td class="lbl" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;font-weight:700;">Lugar</td>
                  <td class="val" valign="top" style="padding:9px 0;border-top:1px solid #E6D6C3;">${e(d.lugarEvento)}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Lista de logros -->
        <tr><td class="px" style="padding:22px 44px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:16px;line-height:24px;color:#2E4A3E;">
            <tr>
              <td width="40" valign="top" style="padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="28" height="28" bgcolor="#9ED0B7" style="background:#9ED0B7;border-radius:14px;font-family:Arial,sans-serif;font-weight:700;font-size:15px;line-height:28px;color:#2E4A3E;">&#10003;</td></tr></table></td>
              <td valign="top" style="padding:7px 0;">Viste <strong>todos los videos</strong> de los tres cursos.</td>
            </tr>
            <tr>
              <td width="40" valign="top" style="padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="28" height="28" bgcolor="#F2B592" style="background:#F2B592;border-radius:14px;font-family:Arial,sans-serif;font-weight:700;font-size:15px;line-height:28px;color:#2E4A3E;">&#10003;</td></tr></table></td>
              <td valign="top" style="padding:7px 0;">Aprobaste <strong>todas las evaluaciones</strong>.</td>
            </tr>
            <tr>
              <td width="40" valign="top" style="padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="28" height="28" bgcolor="#EE9884" style="background:#EE9884;border-radius:14px;font-family:Arial,sans-serif;font-weight:700;font-size:15px;line-height:28px;color:#2E4A3E;">&#10003;</td></tr></table></td>
              <td valign="top" style="padding:7px 0;">Tu ingreso al evento fundacional <strong>quedó habilitado</strong>.</td>
            </tr>
          </table>
        </td></tr>

        <!-- Indicación -->
        <tr><td class="px" style="padding:20px 44px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4E1A1" style="background:#F4E1A1;border-radius:14px;">
            <tr><td style="padding:16px 20px;font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:15px;line-height:24px;color:#2E4A3E;">
              <strong>No necesitas nada más.</strong> Guarda este correo y tenlo a la mano el día del evento.
            </td></tr>
          </table>
        </td></tr>

        <!-- Cierre -->
        <tr><td align="center" class="px" style="padding:30px 44px 38px;">
          <p style="margin:0;font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:17px;line-height:28px;color:#2E4A3E;">
            Terminar estos cursos fue un paso de constancia y de liderazgo.<br>
            Ahora nos vemos para encontrarnos, reconocernos y empezar <strong>juntas</strong> esta historia.
          </p>
          <p style="margin:18px 0 0;font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:22px;line-height:30px;color:#2E4A3E;">
            Emprender es <span style="color:#B04A36;">florecer</span>.
          </p>
        </td></tr>

        <!-- Firma -->
        <tr><td align="center" bgcolor="#2E4A3E" class="px" style="background:#2E4A3E;border-radius:0 0 22px 22px;padding:26px 40px;">
          <div style="font-family:'Quicksand','Arial Rounded MT Bold',Arial,sans-serif;font-weight:700;font-size:16px;line-height:22px;color:#FFF6EE;">
            Equipo del Centro de Innovación Comunitaria
          </div>
          <div style="margin-top:4px;font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:14px;line-height:20px;color:#9ED0B7;">
            CIC · Caribe colombiano · Innovación con raíz caribe.
          </div>
        </td></tr>

      </table>
    </td></tr>

    <!-- Pie -->
    <tr><td align="center" class="px" style="padding:20px 24px 4px;font-family:'Nunito Sans',Calibri,Arial,sans-serif;font-size:13px;line-height:20px;color:#2E4A3E;">
      Recibes este mensaje porque finalizaste los tres cursos del CIC.<br>
      Si tienes alguna duda, responde a este correo y te acompañamos.
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>
`;
}

// Versión en texto (para los programas de correo que no muestran HTML)
function textoFinalizacion(d) {
  return [
    `¡Lo lograste, ${d.nombrePila}! Ya floreciste en los tres cursos.`, '',
    'Viste todos los videos y aprobaste todas las evaluaciones. Con este correo ya tienes lo necesario para entrar al evento fundacional del Centro de Innovación Comunitaria para la Autonomía de la Mujer en el Caribe colombiano.', '',
    'TU PASE AL EVENTO · Este correo es suficiente para entrar.',
    `Participante: ${d.nombreCompleto}`,
    `Cursos finalizados: los 3 cursos · el ${d.fechaFin}`,
    `Fecha del evento: ${d.fechaEvento}`,
    `Lugar: ${d.lugarEvento}`, '',
    'No necesitas nada más. Guarda este correo y tenlo a la mano el día del evento.', '',
    'Emprender es florecer.', '— Equipo del Centro de Innovación Comunitaria',
  ].join('\n');
}

module.exports = { htmlFinalizacion, textoFinalizacion };
