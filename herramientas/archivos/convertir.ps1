# Convierte a PDF (con Word y PowerPoint del computador) los documentos del catálogo, o los copia si ya
# están en PDF o son plantillas de Excel. Uso (PowerShell, desde LSM_CIC):
#   node herramientas/archivos/catalogo.js
#   powershell -ExecutionPolicy Bypass -File herramientas/archivos/convertir.ps1
$lista = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'convertir.json') | ConvertFrom-Json
$word = $null; $ppt = $null
$ok = 0; $mal = 0
foreach ($c in $lista) {
    $destino = $c.destino
    New-Item -ItemType Directory -Force (Split-Path $destino) | Out-Null
    $ext = [IO.Path]::GetExtension($c.origen).ToLower()
    try {
        if ($ext -eq '.docx') {
            if (-not $word) { $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0 }
            $d = $word.Documents.Open($c.origen, $false, $true)
            $d.SaveAs2($destino, 17)   # 17 = PDF
            $d.Close($false)
        } elseif ($ext -eq '.pptx') {
            if (-not $ppt) { $ppt = New-Object -ComObject PowerPoint.Application }
            $p = $ppt.Presentations.Open($c.origen, $true, $false, $false)
            $p.SaveAs($destino, 32)    # 32 = PDF
            $p.Close()
        } else {
            Copy-Item $c.origen $destino -Force
        }
        $ok++
        Write-Output ("ok  " + (Split-Path $destino -Leaf))
    } catch {
        $mal++
        Write-Output ("ERROR " + $c.origen + " : " + $_.Exception.Message)
    }
}
if ($word) { $word.Quit() }
if ($ppt) { $ppt.Quit() }
Write-Output "Convertidos: $ok · con error: $mal"
