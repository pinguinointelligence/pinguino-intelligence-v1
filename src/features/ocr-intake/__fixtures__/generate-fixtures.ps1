# Deterministic OCR fixture-image generator (Windows PowerShell 5.1 + System.Drawing).
# Renders the committed label PNGs under src/features/ocr-intake/__fixtures__/.
# Re-run only when the fixture TEXT changes; the PNGs are committed so tests replay
# identical bytes on every machine. No network, no real product data — invented labels.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = $PSScriptRoot

function New-LabelImage {
  param(
    [string]$FileName,
    [string[]]$Lines,
    [int]$Width = 860,
    [single]$FontSize = 22,
    [int]$LineHeight = 34,
    [int]$Margin = 28
  )
  $height = $Margin * 2 + $LineHeight * $Lines.Count
  $bmp = New-Object System.Drawing.Bitmap($Width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font('Arial', $FontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.Brushes]::Black
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $g.DrawString($Lines[$i], $font, $brush, $Margin, $Margin + $i * $LineHeight)
  }
  $font.Dispose(); $g.Dispose()
  $path = Join-Path $outDir $FileName
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $path"
}

# 1. Clear English nutrition label (per 100 g, decimal points, EAN digits, net weight)
New-LabelImage -FileName 'label_clear_en.png' -Lines @(
  'Vanilla Dessert Base',
  'Brand: Polar Foods',
  'Net weight: 500 g',
  'NUTRITION INFORMATION per 100 g',
  'Energy 1544 kJ / 368 kcal',
  'Fat 15.3 g',
  'of which saturates 9.8 g',
  'Carbohydrate 52.1 g',
  'of which sugars 48.2 g',
  'Protein 4.5 g',
  'Salt 0.28 g',
  'Ingredients: sugar, skimmed milk powder, coconut oil, glucose syrup,',
  'emulsifier (soy lecithin), natural vanilla flavouring.',
  'Allergens: milk, soy.',
  'May contain: hazelnuts.',
  'Store in a cool, dry place.',
  '8 480000 610928'
)

# 2. Spanish label with DECIMAL COMMAS, per 100 ml
New-LabelImage -FileName 'label_decimal_comma_es.png' -Lines @(
  'Horchata Tradicional',
  'Marca: Valenciana Real',
  'Contenido neto: 1 l',
  'INFORMACION NUTRICIONAL por 100 ml',
  'Valor energetico 254 kJ / 60 kcal',
  'Grasas 1,1 g',
  'de las cuales saturadas 0,2 g',
  'Hidratos de carbono 11,4 g',
  'de los cuales azucares 10,1 g',
  'Proteinas 0,5 g',
  'Sal 0,03 g',
  'Ingredientes: agua, chufa (12%), azucar.',
  'Puede contener trazas de frutos de cascara.',
  'Conservar refrigerado entre 0 y 6 grados.'
)

# 3. English label with MULTILINE ingredients + allergens + may contain
New-LabelImage -FileName 'label_multiline_ingredients_en.png' -Lines @(
  'Dark Chocolate Coating',
  'Ingredients: cocoa mass, sugar, cocoa butter, whole',
  'milk powder, emulsifier (soy lecithin), natural',
  'vanilla flavouring, hazelnut paste (2%).',
  'Allergens: milk, soy, hazelnuts.',
  'May contain: other tree nuts, gluten.',
  'NUTRITION per 100 g',
  'Energy 2287 kJ / 549 kcal',
  'Fat 34.9 g',
  'of which saturates 21.2 g',
  'Carbohydrate 50.5 g',
  'of which sugars 47.4 g',
  'Protein 6.2 g',
  'Salt 0.11 g'
)

# 4. Low-quality label: rendered readable, then destroyed by down/up-scaling (blur).
#    The engine must FAIL HONESTLY (unreadable) or return junk that parses to nulls.
$tmp = Join-Path $outDir 'label_lowquality_tmp.png'
New-LabelImage -FileName 'label_lowquality_tmp.png' -Lines @(
  'Mystery Product 77',
  'NUTRITION per 100 g',
  'Fat 12.3 g  Salt 0.4 g',
  'Ingredients: unknown blend.'
) -FontSize 16 -LineHeight 22 -Width 520
$src = [System.Drawing.Image]::FromFile($tmp)
$small = New-Object System.Drawing.Bitmap($src, 52, [int]($src.Height * 52 / $src.Width))
$blur = New-Object System.Drawing.Bitmap($small, $src.Width, $src.Height)
$blur.Save((Join-Path $outDir 'label_lowquality.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$blur.Dispose(); $small.Dispose(); $src.Dispose()
Remove-Item $tmp -Force
Write-Output "wrote $(Join-Path $outDir 'label_lowquality.png')"

# 5. Readable image where OCR succeeds but label parsing stays INCOMPLETE
New-LabelImage -FileName 'label_partial_en.png' -Lines @(
  'Alpine Herbal Drops',
  'Batch 20260712',
  'Best before: see base of pack',
  'Made in the EU for Alpine Trading Co.',
  'www.example-alpine-drops.eu'
)
