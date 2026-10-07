# Prepara los logos de los aliados para la página: fondo transparente y recorte al contenido.
# Uso: powershell -ExecutionPolicy Bypass -File herramientas/archivos/logos.ps1 <carpeta con 9.png..12.png>
param([string]$origen)
Add-Type -AssemblyName System.Drawing
$destino = Join-Path $PSScriptRoot '..\..\assets\aliados'
New-Item -ItemType Directory -Force $destino | Out-Null

function Procesar([string]$archivo, [string]$salida, [int]$fondo, [bool]$textoBlanco) {
    $src = [System.Drawing.Bitmap]::FromFile($archivo)
    $w = $src.Width; $h = $src.Height
    $out = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $ds = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $do = $out.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $n = $w * $h * 4
    $px = New-Object byte[] $n
    [System.Runtime.InteropServices.Marshal]::Copy($ds.Scan0, $px, 0, $n)
    for ($i = 0; $i -lt $n; $i += 4) {
        $b = $px[$i]; $g = $px[$i + 1]; $r = $px[$i + 2]
        $max = [Math]::Max($r, [Math]::Max($g, $b)); $min = [Math]::Min($r, [Math]::Min($g, $b))
        $gris = ($max - $min) -lt 12
        if ($textoBlanco) {
            # Letras blancas sobre gris claro: la opacidad sale de cuánto más claro que el fondo es el píxel
            if ($gris) { $a = [Math]::Min(255, [Math]::Max(0, (($min - $fondo) * 255) / (255 - $fondo))); $px[$i] = 255; $px[$i + 1] = 255; $px[$i + 2] = 255 } else { $a = 255 }
        } else {
            # Logo de color sobre fondo claro: el fondo se vuelve transparente, con borde suave
            if ($gris -and $min -ge $fondo - 2) { $a = 0 } elseif ($gris -and $min -ge $fondo - 30) { $a = [int](255 * ($fondo - $min) / 30) } else { $a = 255 }
        }
        $px[$i + 3] = [byte]$a
        if ($a -gt 20) { $p = $i / 4; $x = $p % $w; $y = [Math]::Floor($p / $w); if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($px, 0, $do.Scan0, $n)
    $src.UnlockBits($ds); $out.UnlockBits($do)
    $m = 8
    $minX = [Math]::Max(0, $minX - $m); $minY = [Math]::Max(0, $minY - $m); $maxX = [Math]::Min($w - 1, $maxX + $m); $maxY = [Math]::Min($h - 1, $maxY + $m)
    $cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
    # Ancho final de hasta 640 px (suficiente para pantallas de alta densidad)
    $escala = [Math]::Min(1.0, 640.0 / $cw)
    $fw = [int]($cw * $escala); $fh = [int]($ch * $escala)
    $fin = New-Object System.Drawing.Bitmap $fw, $fh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gr = [System.Drawing.Graphics]::FromImage($fin)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.DrawImage($out, (New-Object System.Drawing.Rectangle 0, 0, $fw, $fh), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
    $gr.Dispose()
    $fin.Save((Join-Path $destino $salida), [System.Drawing.Imaging.ImageFormat]::Png)
    "$salida  $fw x $fh"
    $fin.Dispose(); $out.Dispose(); $src.Dispose()
}
Procesar (Join-Path $origen '9.png')  'padf.png' 247 $false
Procesar (Join-Path $origen '10.png') 'red-mujeres-caribe.png' 255 $false
Procesar (Join-Path $origen '11.png') 'aprodefa.png' 255 $false
Procesar (Join-Path $origen '12.png') 'fonigualdad.png' 247 $true
