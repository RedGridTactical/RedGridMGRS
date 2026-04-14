#!/usr/bin/env node
/**
 * Renders each .frame element from composite.html as a separate PNG.
 * Outputs two sets:
 *   - output/ios/  → 1290x2796 (iPhone 6.7" — App Store requirement)
 *   - output/android/ → 1290x2796 (same spec works for Play Store "phone" slot)
 *
 * Adapted from the Just Start project's screenshot compositor.
 *
 * Usage: node screenshots/render.js
 * Prereq: npm install puppeteer (in screenshots/ or project root)
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FRAME_WIDTH = 1290;
const FRAME_HEIGHT = 2796;
const IOS_OUT = path.join(__dirname, 'output', 'ios');
const ANDROID_OUT = path.join(__dirname, 'output', 'android');

const CAPTIONS = [
  '01_grid',
  '02_map_offline',
  '03_tools',
  '04_reports',
  '05_mark_position',
  '06_coords',
  '07_themes',
  '08_mesh_network',
];

(async () => {
  fs.mkdirSync(IOS_OUT, { recursive: true });
  fs.mkdirSync(ANDROID_OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 14000, height: FRAME_HEIGHT + 200, deviceScaleFactor: 1 });

  const htmlPath = path.join(__dirname, 'composite.html');

  // Render for each platform — iOS default, Android adds body.android class for Pixel-style chrome
  const platforms = [
    { name: 'ios',     out: IOS_OUT,     bodyClass: '' },
    { name: 'android', out: ANDROID_OUT, bodyClass: 'android' },
  ];

  for (const platform of platforms) {
    console.log(`\nRendering ${platform.name}...`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

    // Apply platform-specific body class so CSS swaps phone chrome
    await page.evaluate((cls) => { document.body.className = cls; }, platform.bodyClass);

    // Wait for all phone images to load
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll('.phone img');
      return imgs.length > 0 && Array.from(imgs).every(img => img.complete && img.naturalHeight > 0);
    }, { timeout: 15000 }).catch(() => {
      console.warn('Warning: some images may not have loaded — continuing anyway');
    });

    const frames = await page.$$('.frame');
    console.log(`  Found ${frames.length} frames`);

    for (let i = 0; i < frames.length; i++) {
      const name = CAPTIONS[i] || `frame_${i + 1}`;
      const outPath = path.join(platform.out, `${name}.png`);
      await frames[i].screenshot({ path: outPath });
      const stat = fs.statSync(outPath);
      console.log(`  ✓ ${platform.name}/${name}.png (${(stat.size / 1024).toFixed(0)} KB)`);
    }
  }

  await browser.close();

  const iosFiles = fs.readdirSync(IOS_OUT).filter(f => f.endsWith('.png'));
  const androidFiles = fs.readdirSync(ANDROID_OUT).filter(f => f.endsWith('.png'));
  console.log(`\nRendered ${iosFiles.length} iOS + ${androidFiles.length} Android screenshots`);
  console.log(`iOS:     ${IOS_OUT}`);
  console.log(`Android: ${ANDROID_OUT}`);
})();
