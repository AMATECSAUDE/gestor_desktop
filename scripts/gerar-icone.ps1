# =============================================================================
#  Gera o build/icon.ico a partir da IDENTIDADE VISUAL do sistema
# -----------------------------------------------------------------------------
#  O icone do .exe e ASSADO no build - nao acompanha mudanca de marca sozinho.
#  Rode este script quando a logo mudar em Identidade Visual, e builde de novo.
#
#  Uso:
#    .\gerar-icone.ps1 -EstablishmentId 2      # icone do estabelecimento 2
#    .\gerar-icone.ps1                          # icone GLOBAL (cai no Estab. Clube)
#
#  🔴 Por padrao o branding global carrega a marca do Estab. CLUBE. Para o icone do
#  balcao normalmente se quer o estabelecimento PRINCIPAL (a clinica que atende), e
#  nao o clube - por isso o `-EstablishmentId`.
# =============================================================================

param(
    [int]$EstablishmentId = 0,
    [string]$Api = 'https://api.alfaclubsaude.com.br'
)

Add-Type -AssemblyName System.Drawing

$url = if ($EstablishmentId -gt 0) { "$Api/api/v1/branding?establishment_id=$EstablishmentId" } else { "$Api/api/v1/branding?scope=global" }
Write-Host "Lendo identidade visual: $url" -ForegroundColor Cyan

$d = (Invoke-RestMethod $url -TimeoutSec 30).data
if (-not $d.brand_icon_url) {
    Write-Host 'Este escopo nao tem `brand_icon_url` definido. Cadastre o icone em Identidade Visual.' -ForegroundColor Red
    exit 1
}
Write-Host "  marca: $($d.brand_name)  |  icone: $($d.brand_icon_url)" -ForegroundColor Green

$dir = Join-Path (Split-Path $PSScriptRoot -Parent) 'build'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$png = Join-Path $dir '_origem.png'
Invoke-WebRequest ($Api + $d.brand_icon_url) -OutFile $png -TimeoutSec 60

# ICO MULTI-RESOLUCAO. Icone de resolucao unica fica borrado na barra de tarefas:
# o Windows pede 16/32/48 e escalar de 256 na hora borra os tracos finos.
$tamanhos = @(16, 24, 32, 48, 64, 128, 256)
$origem = [System.Drawing.Image]::FromFile($png)
$imagens = @()
foreach ($t in $tamanhos) {
    $bmp = New-Object System.Drawing.Bitmap($t, $t)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($origem, 0, 0, $t, $t)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $imagens += , @($t, $ms.ToArray())
    $bmp.Dispose(); $ms.Dispose()
}
$origem.Dispose()

# Formato ICO: cabecalho + N entradas de 16 bytes + os PNGs embutidos (aceito
# desde o Vista). Lado 256 vai como 0 no byte - e a convencao do formato.
$fs = [System.IO.File]::Create((Join-Path $dir 'icon.ico'))
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$imagens.Count)
$offset = 6 + (16 * $imagens.Count)
foreach ($i in $imagens) {
    $lado = if ($i[0] -ge 256) { 0 } else { $i[0] }
    $bw.Write([byte]$lado); $bw.Write([byte]$lado); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$i[1].Length); $bw.Write([uint32]$offset)
    $offset += $i[1].Length
}
foreach ($i in $imagens) { $bw.Write($i[1]) }
$bw.Close(); $fs.Close()
Remove-Item $png -ErrorAction SilentlyContinue

$ico = Get-Item (Join-Path $dir 'icon.ico')
Write-Host "icon.ico gerado: $($ico.Length) bytes, $($imagens.Count) resolucoes" -ForegroundColor Green
Write-Host 'Rode `npm run dist` para o icone entrar no instalador.' -ForegroundColor Yellow
