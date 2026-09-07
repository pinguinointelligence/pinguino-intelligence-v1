import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const artifactDirectory = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass the PDF artifact directory.');
const manifest = JSON.parse(readFileSync(join(artifactDirectory, 'manifest.json'), 'utf8'));
const renderDirectory = mkdtempSync(join(tmpdir(), 'gellatti-pdf-render-'));
const pointsPerMillimetre = 72 / 25.4;

const closeTo = (actual, expected, tolerance = 0.03) =>
  Math.abs(Number(actual) - Number(expected)) <= tolerance;

try {
  const report = [];
  for (const item of manifest) {
    const path = join(artifactDirectory, item.file);
    const info = execFileSync('pdfinfo', ['-box', path], { encoding: 'utf8' });
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    const media = info.match(/^MediaBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/m);
    const crop = info.match(/^CropBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/m);
    if (pages !== 1 || !media || !crop) throw new Error(`${item.file}: invalid page boxes.`);
    const expectedWidth = item.widthMm * pointsPerMillimetre;
    const expectedHeight = item.heightMm * pointsPerMillimetre;
    for (const [name, box] of [
      ['MediaBox', media],
      ['CropBox', crop],
    ]) {
      if (
        !closeTo(box[1], 0) ||
        !closeTo(box[2], 0) ||
        !closeTo(box[3], expectedWidth) ||
        !closeTo(box[4], expectedHeight)
      ) {
        throw new Error(`${item.file}: ${name} is not the requested physical size.`);
      }
    }

    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    if (!text.includes(item.expectedProductText) || !text.includes(item.lotCode)) {
      throw new Error(`${item.file}: dynamic product/LOT text is missing.`);
    }
    const renderPrefix = join(renderDirectory, item.file.replace(/\.pdf$/i, ''));
    execFileSync('pdftoppm', ['-singlefile', '-r', '72', '-png', path, renderPrefix]);
    const renderedPath = `${renderPrefix}.png`;
    if (statSync(renderedPath).size < 1_000) {
      throw new Error(`${item.file}: independent raster render is empty.`);
    }
    report.push({
      file: item.file,
      pages,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      bytes: statSync(path).size,
      renderedBytes: statSync(renderedPath).size,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      dynamicText: true,
    });
  }
  console.log(JSON.stringify({ pdfArtifacts: report }, null, 2));
} finally {
  rmSync(renderDirectory, { recursive: true, force: true });
}
