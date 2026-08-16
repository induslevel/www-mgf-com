import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

/**
 * Watermarking pipeline script for www.solorithm.com
 * Replicated & customized from www-induslevel-com
 */

const LOGO_PATH = path.resolve('public/logo.png');
const DOMAIN_TEXT = 'www.solorithm.com';
const OPACITY = 0.20; // 20% opacity

export const IMAGE_MAPPING = {
  '1.jpeg': 'public/images/bg-hero.jpg',
  '2.jpeg': 'public/images/service-it-services.jpg',
  '3.jpeg': 'public/images/service-noc.jpg',
  '4.jpeg': 'public/images/service-microsoft.jpg',
  '5.jpeg': 'public/images/service-rim.jpg',
  '6.jpeg': 'public/images/service-ciso.jpg',
  '7.jpeg': 'public/images/service-security-assessment.jpg',
  '8.jpeg': 'public/images/service-cloud-prem-assessment.jpg',
  '9.jpeg': 'public/images/service-cloud-security.jpg',
  '10.jpeg': 'public/images/service-threat-vulnerability.jpg',
  '11.jpeg': 'public/images/service-firewall.jpg',
  '12.jpeg': 'public/images/portfolio-netops.jpg',
  '13.jpeg': 'public/images/portfolio-sysops.jpg',
  '14.jpeg': 'public/images/portfolio-secops.jpg',
  '15.jpeg': 'public/images/portfolio-cloud.jpg',
  '16.jpeg': 'public/images/portfolio-monitoring.jpg'
};

export async function applyWatermark(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) {
    console.warn(`[Watermark] Input file not found: ${inputPath}`);
    return false;
  }
  if (!fs.existsSync(LOGO_PATH)) {
    console.error(`[Watermark] Logo file not found at ${LOGO_PATH}`);
    return false;
  }

  try {
    const metadata = await sharp(inputPath).metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 800;

    const maxByWidth = Math.round(width * 0.35);
    const maxByHeight = Math.round(height * 0.70);
    const watermarkWidth = Math.min(maxByWidth, maxByHeight);
    const logoSize = Math.round(watermarkWidth * 0.75);
    const textHeight = Math.round(watermarkWidth * 0.25);
    const fontSize = Math.min(Math.round(textHeight * 0.65), Math.max(10, Math.round(watermarkWidth / 14)));

    // Resize and apply opacity to logo
    const { data: logoBuffer, info } = await sharp(LOGO_PATH)
      .resize(logoSize, logoSize, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let i = 3; i < logoBuffer.length; i += 4) {
      logoBuffer[i] = Math.round(logoBuffer[i] * OPACITY);
    }
    const logoPng = await sharp(logoBuffer, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();

    // Create text SVG
    const textSvg = `
      <svg width="${watermarkWidth}" height="${textHeight}" viewBox="0 0 ${watermarkWidth} ${textHeight}" xmlns="http://www.w3.org/2000/svg">
        <text x="${Math.round(watermarkWidth / 2)}" y="${Math.round(textHeight * 0.75)}" font-family="sans-serif" font-weight="bold" font-size="${fontSize}" fill="white" fill-opacity="${OPACITY}" text-anchor="middle">
          ${DOMAIN_TEXT}
        </text>
      </svg>
    `;
    const textBuffer = Buffer.from(textSvg);

    // Composite logo + text watermark centered
    const compositeWatermark = await sharp({
      create: { width: watermarkWidth, height: logoSize + textHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([
        { input: logoPng, gravity: 'north' },
        { input: textBuffer, gravity: 'south' }
      ])
      .png()
      .toBuffer();

    const outputDir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await sharp(inputPath)
      .composite([{ input: compositeWatermark, gravity: 'center' }])
      .toFile(path.resolve(outputPath));

    console.log(`[Watermark] Successfully watermarked: ${inputPath} -> ${outputPath}`);
    return true;
  } catch (err) {
    console.error(`[Watermark] Error processing ${inputPath}:`, err);
    return false;
  }
}

async function main() {
  const targetArg = process.argv[2];
  if (targetArg) {
    if (IMAGE_MAPPING[targetArg]) {
      await applyWatermark(targetArg, IMAGE_MAPPING[targetArg]);
    } else {
      console.log(`Usage: node scripts/apply-watermark.js [1.jpeg|all]`);
    }
    return;
  }

  let count = 0;
  for (const [input, output] of Object.entries(IMAGE_MAPPING)) {
    if (fs.existsSync(input)) {
      const ok = await applyWatermark(input, output);
      if (ok) count++;
    }
  }
  console.log(`Processed ${count} image(s).`);
}

if (process.argv[1] && process.argv[1].endsWith('apply-watermark.js')) {
  main();
}
