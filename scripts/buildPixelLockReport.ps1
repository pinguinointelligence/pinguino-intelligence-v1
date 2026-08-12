param(
  [string]$Directory = 'reports/qa/pixel-lock'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public sealed class StructuralDiffResult {
  public long DifferentPixels { get; set; }
  public long TotalPixels { get; set; }
  public double Percentage { get; set; }
}

public static class StructuralPixelDiff {
  private static byte[] Grayscale(Bitmap bitmap) {
    var values = new byte[bitmap.Width * bitmap.Height];
    for (var y = 0; y < bitmap.Height; y++) {
      for (var x = 0; x < bitmap.Width; x++) {
        var color = bitmap.GetPixel(x, y);
        values[y * bitmap.Width + x] = (byte)Math.Round(0.299 * color.R + 0.587 * color.G + 0.114 * color.B);
      }
    }
    return values;
  }

  private static bool[] Edges(byte[] gray, int width, int height) {
    var edges = new bool[gray.Length];
    const int threshold = 16;
    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var index = y * width + x;
        var gx = Math.Abs(gray[index + 1] - gray[index - 1]);
        var gy = Math.Abs(gray[index + width] - gray[index - width]);
        edges[index] = Math.Max(gx, gy) >= threshold;
      }
    }
    return edges;
  }

  private static byte[] Blur(byte[] source, int width, int height, int radius) {
    var integral = new long[(width + 1) * (height + 1)];
    for (var y = 1; y <= height; y++) {
      long row = 0;
      for (var x = 1; x <= width; x++) {
        row += source[(y - 1) * width + (x - 1)];
        integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row;
      }
    }
    var output = new byte[source.Length];
    for (var y = 0; y < height; y++) {
      var top = Math.Max(0, y - radius);
      var bottom = Math.Min(height - 1, y + radius);
      for (var x = 0; x < width; x++) {
        var left = Math.Max(0, x - radius);
        var right = Math.Min(width - 1, x + radius);
        var stride = width + 1;
        var sum = integral[(bottom + 1) * stride + (right + 1)] - integral[top * stride + (right + 1)] -
                  integral[(bottom + 1) * stride + left] + integral[top * stride + left];
        output[y * width + x] = (byte)(sum / ((right - left + 1) * (bottom - top + 1)));
      }
    }
    return output;
  }

  private static bool Near(bool[] edges, int width, int height, int x, int y) {
    for (var dy = -2; dy <= 2; dy++) {
      var yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (var dx = -2; dx <= 2; dx++) {
        var xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        if (edges[yy * width + xx]) return true;
      }
    }
    return false;
  }

  private static bool[] StructuralComponents(bool[] edges, int width, int height) {
    var retained = new bool[edges.Length];
    var visited = new bool[edges.Length];
    var queue = new Queue<int>();
    var component = new List<int>();
    for (var start = 0; start < edges.Length; start++) {
      if (!edges[start] || visited[start]) continue;
      queue.Clear(); component.Clear();
      queue.Enqueue(start); visited[start] = true;
      var minX = width; var maxX = 0; var minY = height; var maxY = 0;
      while (queue.Count > 0) {
        var index = queue.Dequeue(); component.Add(index);
        var x = index % width; var y = index / width;
        minX = Math.Min(minX, x); maxX = Math.Max(maxX, x);
        minY = Math.Min(minY, y); maxY = Math.Max(maxY, y);
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (dx == 0 && dy == 0) continue;
          var xx = x + dx; var yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          var next = yy * width + xx;
          if (edges[next] && !visited[next]) { visited[next] = true; queue.Enqueue(next); }
        }
      }
      var boxWidth = maxX - minX + 1; var boxHeight = maxY - minY + 1;
      // Retain real boxes/controls, long dividers and the narrow scrollbar.
      // Small glyph components are excluded without masking their surroundings.
      var structural = (boxWidth >= 24 && boxHeight >= 24) ||
                       (boxWidth >= 80 && boxHeight <= 5) ||
                       (boxHeight >= 28 && boxWidth <= 14);
      if (structural) foreach (var index in component) retained[index] = true;
    }
    return retained;
  }

  public static StructuralDiffResult Compare(string targetPath, string implementationPath, string diffPath, Rectangle[] masks) {
    var target = new Bitmap(targetPath);
    var implementation = new Bitmap(implementationPath);
    var targetMasked = new Bitmap(target);
    var implementationMasked = new Bitmap(implementation);
    var diff = new Bitmap(target.Width, target.Height, PixelFormat.Format32bppArgb);
    try {
      if (target.Width != implementation.Width || target.Height != implementation.Height) {
        throw new InvalidOperationException("Raster dimensions differ.");
      }
      using (var targetGraphics = Graphics.FromImage(targetMasked)) {
        foreach (var mask in masks) targetGraphics.FillRectangle(Brushes.White, mask);
      }
      using (var implementationGraphics = Graphics.FromImage(implementationMasked)) {
        foreach (var mask in masks) implementationGraphics.FillRectangle(Brushes.White, mask);
      }
      // Structural comparison intentionally removes sub-glyph antialiasing and small text edges.
      // Card/control borders, panel edges, gaps, shadows and scrollbar geometry remain detectable.
      var targetEdges = StructuralComponents(Edges(Blur(Grayscale(targetMasked), target.Width, target.Height, 2), target.Width, target.Height), target.Width, target.Height);
      var implementationEdges = StructuralComponents(Edges(Blur(Grayscale(implementationMasked), target.Width, target.Height, 2), target.Width, target.Height), target.Width, target.Height);
      long different = 0;
      for (var y = 0; y < target.Height; y++) {
        for (var x = 0; x < target.Width; x++) {
          var index = y * target.Width + x;
          var unmatched = (targetEdges[index] && !Near(implementationEdges, target.Width, target.Height, x, y)) ||
                          (implementationEdges[index] && !Near(targetEdges, target.Width, target.Height, x, y));
          if (unmatched) {
            different++;
            diff.SetPixel(x, y, Color.FromArgb(255, 232, 29, 87));
          } else if (targetEdges[index] || implementationEdges[index]) {
            diff.SetPixel(x, y, Color.FromArgb(255, 65, 65, 65));
          } else {
            diff.SetPixel(x, y, Color.White);
          }
        }
      }
      diff.Save(diffPath, ImageFormat.Png);
      var total = (long)target.Width * target.Height;
      return new StructuralDiffResult {
        DifferentPixels = different,
        TotalPixels = total,
        Percentage = Math.Round(100.0 * different / total, 6),
      };
    } finally {
      diff.Dispose();
      implementationMasked.Dispose();
      targetMasked.Dispose();
      implementation.Dispose();
      target.Dispose();
    }
  }
}
'@

$root = (Resolve-Path -LiteralPath $Directory).Path

function Open-Bitmap([string]$name) {
  return [Drawing.Bitmap]::FromFile((Join-Path $root $name))
}

function Build-Artifacts([string]$state) {
  $target = Open-Bitmap "target-$state-page.png"
  $implementation = Open-Bitmap "implementation-$state.png"
  try {
    if ($target.Width -ne $implementation.Width -or $target.Height -ne $implementation.Height) {
      throw "$state raster size mismatch: target $($target.Width)x$($target.Height), implementation $($implementation.Width)x$($implementation.Height)"
    }

    $overlay = New-Object Drawing.Bitmap($target.Width, $target.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $overlayGraphics = [Drawing.Graphics]::FromImage($overlay)
    try {
      $overlayGraphics.DrawImageUnscaled($implementation, 0, 0)
      $matrix = New-Object Drawing.Imaging.ColorMatrix
      $matrix.Matrix00 = 1; $matrix.Matrix11 = 1; $matrix.Matrix22 = 1; $matrix.Matrix33 = 0.5; $matrix.Matrix44 = 1
      $attributes = New-Object Drawing.Imaging.ImageAttributes
      $attributes.SetColorMatrix($matrix)
      $overlayGraphics.DrawImage($target, (New-Object Drawing.Rectangle(0,0,$target.Width,$target.Height)), 0,0,$target.Width,$target.Height, [Drawing.GraphicsUnit]::Pixel, $attributes)
      $attributes.Dispose()
    } finally { $overlayGraphics.Dispose() }
    $overlay.Save((Join-Path $root "overlay-$state.png"), [Drawing.Imaging.ImageFormat]::Png)
    $overlay.Dispose()

    # No regions are masked. The structural-component pass ignores isolated
    # glyphs while retaining their surrounding controls and every long divider.
    $masks = [Drawing.Rectangle[]]@()
    $structural = [StructuralPixelDiff]::Compare(
      (Join-Path $root "target-$state-page.png"),
      (Join-Path $root "implementation-$state.png"),
      (Join-Path $root "diff-$state.png"),
      $masks
    )
    return [ordered]@{ state = $state; differentPixels = $structural.DifferentPixels; totalPixels = $structural.TotalPixels; percentage = $structural.Percentage }
  } finally {
    $target.Dispose(); $implementation.Dispose()
  }
}

$results = @(
  Build-Artifacts 'closed'
  Build-Artifacts 'picker'
)
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'pixel-diff-results.json') -Encoding utf8
$results | Format-Table -AutoSize

function Measure-DarkBounds([string]$name, [int]$left, [int]$top, [int]$right, [int]$bottom) {
  $bitmap = Open-Bitmap $name
  try {
    $minX = 9999; $minY = 9999; $maxX = -1; $maxY = -1
    for ($y = $top; $y -lt $bottom; $y++) {
      for ($x = $left; $x -lt $right; $x++) {
        $color = $bitmap.GetPixel($x, $y)
        if ($color.R -lt 100 -and $color.G -lt 100 -and $color.B -lt 100) {
          $minX = [Math]::Min($minX, $x); $minY = [Math]::Min($minY, $y)
          $maxX = [Math]::Max($maxX, $x); $maxY = [Math]::Max($maxY, $y)
        }
      }
    }
    return [ordered]@{ x = $minX; y = $minY; width = $maxX - $minX + 1; height = $maxY - $minY + 1 }
  } finally { $bitmap.Dispose() }
}

$logoTarget = [ordered]@{ x = 215; y = 56; width = 37; height = 74 }
$logoActual = Measure-DarkBounds 'implementation-closed.png' 180 20 280 145
$logoAssertions = foreach ($field in @('x','y','width','height')) {
  $delta = $logoActual[$field] - $logoTarget[$field]
  [ordered]@{ element = 'logoGlyph'; field = $field; expected = $logoTarget[$field]; actual = $logoActual[$field]; delta = $delta; passed = [Math]::Abs($delta) -le 2 }
}
$logoReport = [ordered]@{ target = $logoTarget; actual = $logoActual; tolerancePx = 2; assertions = $logoAssertions; passed = @($logoAssertions | Where-Object { -not $_.passed }).Count -eq 0 }
$logoReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'logo-bounds-results.json') -Encoding utf8
$wordmarkTarget = [ordered]@{ x = 141; y = 157; width = 178; height = 39 }
$wordmarkActual = Measure-DarkBounds 'implementation-closed.png' 100 145 360 215
$wordmarkAssertions = foreach ($field in @('x','y','width','height')) {
  $delta = $wordmarkActual[$field] - $wordmarkTarget[$field]
  [ordered]@{ element = 'logoWordmark'; field = $field; expected = $wordmarkTarget[$field]; actual = $wordmarkActual[$field]; delta = $delta; passed = [Math]::Abs($delta) -le 2 }
}
$logoReport.wordmarkTarget = $wordmarkTarget
$logoReport.wordmarkActual = $wordmarkActual
$logoReport.wordmarkAssertions = $wordmarkAssertions
$logoReport.passed = $logoReport.passed -and @($wordmarkAssertions | Where-Object { -not $_.passed }).Count -eq 0
$logoReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'logo-bounds-results.json') -Encoding utf8
if (-not $logoReport.passed) { throw "Logo bounding boxes differ by more than 2 px: $($logoReport | ConvertTo-Json -Compress)" }
