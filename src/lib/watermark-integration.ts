import type { AstroIntegration } from 'astro';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

interface WatermarkOptions {
  opacity?: number;
}

export default function watermarkIntegration(options: WatermarkOptions = {}): AstroIntegration {
  const getSourceDir = (): string => {
    return path.join(process.cwd(), 'public/images');
  };

  // We keep track of generated webp files to remove them after build
  const generatedFiles: string[] = [];

  const restoreOriginals = (sourceDir: string, backupDir: string) => {
    if (fs.existsSync(backupDir)) {
      try {
        const backupFiles = fs.readdirSync(backupDir);
        let restoredCount = 0;
        for (const file of backupFiles) {
          fs.copyFileSync(path.join(backupDir, file), path.join(sourceDir, file));
          restoredCount++;
        }
        fs.rmSync(backupDir, { recursive: true, force: true });
        
        // Remove the temporary webp files we generated
        for (const webpFile of generatedFiles) {
          if (fs.existsSync(webpFile)) {
            fs.unlinkSync(webpFile);
          }
        }
        
        console.log(`[Watermark Integration] Successfully restored ${restoredCount} original images from backup and cleaned up temp webp files.`);
      } catch (err) {
        console.error('[Watermark Integration] ERROR restoring backup files:', err);
      }
    }
  };

  return {
    name: 'solorithm-image-watermark',
    hooks: {
      'astro:build:start': async () => {
        const sourceDir = getSourceDir();
        if (!fs.existsSync(sourceDir)) {
          console.error(`[Watermark Integration] ERROR: Source directory ${sourceDir} not found.`);
          return;
        }

        const files = fs.readdirSync(sourceDir).filter(file => {
          const ext = file.toLowerCase();
          // We target jpeg, jpg, png. Webp might already exist, we should process it too if it's not our output format yet.
          return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg');
        });

        if (files.length === 0) {
          console.warn('[Watermark Integration] WARN: Zero image files found in source directory.');
          return;
        }

        const opacity = Math.min(100, Math.max(0, options.opacity ?? 20)) / 100;
        if (opacity <= 0) return;

        // Create backup of original images before modifying them in-place
        const backupDir = path.join(path.dirname(sourceDir), '.images-backup');
        try {
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          for (const file of files) {
            fs.copyFileSync(path.join(sourceDir, file), path.join(backupDir, file));
          }
          console.log(`[Watermark Integration] Created backup of ${files.length} original images in ${backupDir}`);
        } catch (err) {
          console.error('[Watermark Integration] ERROR backing up original images:', err);
          return;
        }

        // 2. Robust Absolute Logo Path Discovery
        const logoPath = path.join(process.cwd(), 'public/logo.png');

        if (!fs.existsSync(logoPath)) {
          console.error(`[Watermark Integration] ERROR: Logo file ${logoPath} not found.`);
          return;
        }

        let watermarkedCount = 0;
        for (const file of files) {
          const filePath = path.join(sourceDir, file);
          const ext = path.extname(file);
          const baseName = path.basename(file, ext);
          const webpPath = path.join(sourceDir, `${baseName}.webp`);
          
          try {
            const metadata = await sharp(filePath).metadata();
            if (!metadata.width || metadata.width < 300) {
              // Too small, just convert to webp without watermark
              await sharp(filePath).webp({ quality: 80 }).toFile(webpPath);
              generatedFiles.push(webpPath);
              // Remove original so it doesn't get copied to dist
              fs.unlinkSync(filePath);
              continue;
            }

            const maxByWidth = Math.round(metadata.width * 0.35);
            const maxByHeight = Math.round((metadata.height ?? metadata.width) * 0.70);
            const watermarkWidth = Math.min(maxByWidth, maxByHeight);
            const logoSize = Math.round(watermarkWidth * 0.75);
            const textHeight = Math.round(watermarkWidth * 0.25);
            const fontSize = Math.min(Math.round(textHeight * 0.7), Math.max(8, Math.round(watermarkWidth / 14)));

            const { data: logoBuffer, info } = await sharp(logoPath)
              .resize(logoSize, logoSize, { fit: 'inside' })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true });

            for (let i = 3; i < logoBuffer.length; i += 4) {
              logoBuffer[i] = Math.round(logoBuffer[i] * opacity);
            }
            const logoPng = await sharp(logoBuffer, { raw: { width: info.width, height: info.height, channels: 4 } })
              .png()
              .toBuffer();

            const textSvg = `
              <svg width="${watermarkWidth}" height="${textHeight}" viewBox="0 0 ${watermarkWidth} ${textHeight}" xmlns="http://www.w3.org/2000/svg">
                <text x="${Math.round(watermarkWidth / 2)}" y="${Math.round(textHeight * 0.7)}" font-family="sans-serif" font-weight="bold" font-size="${fontSize}" fill="white" fill-opacity="${opacity}" text-anchor="middle">
                  www.solorithm.com
                </text>
              </svg>
            `;
            const textBuffer = Buffer.from(textSvg);

            const compositeWatermark = await sharp({ create: { width: watermarkWidth, height: logoSize + textHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
              .composite([
                { input: logoPng, gravity: 'north' },
                { input: textBuffer, gravity: 'south' }
              ])
              .png()
              .toBuffer();

            // Create WebP directly from composite
            await sharp(filePath)
              .composite([
                {
                  input: compositeWatermark,
                  gravity: 'center',
                }
              ])
              .webp({ quality: 80, effort: 6 }) // Optimized webp format
              .toFile(webpPath);

            generatedFiles.push(webpPath);
            // Remove the original jpg/png from sourceDir so Astro doesn't copy it to the build output
            fs.unlinkSync(filePath);

            watermarkedCount++;
          } catch (err) {
            console.error(`[Watermark Integration] ERROR processing ${file}:`, err);
          }
        }

        console.log(`[Watermark Integration] Successfully watermarked and converted ${watermarkedCount} source images to WebP.`);
      },

      'astro:build:done': async () => {
        const sourceDir = getSourceDir();
        if (sourceDir) {
          const backupDir = path.join(path.dirname(sourceDir), '.images-backup');
          restoreOriginals(sourceDir, backupDir);
        }
      },

      'astro:build:error': async () => {
        const sourceDir = getSourceDir();
        if (sourceDir) {
          const backupDir = path.join(path.dirname(sourceDir), '.images-backup');
          restoreOriginals(sourceDir, backupDir);
        }
      }
    }
  };
}
