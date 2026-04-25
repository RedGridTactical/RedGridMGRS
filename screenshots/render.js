#!/usr/bin/env node
/**
 * Renders each .frame element from composite.html as a separate PNG for each
 * Android form factor: phone, 7" tablet, 10" tablet — and now for each locale.
 *
 * Localization:
 *   Headlines + subtitles are pulled from i18n.json (7 locales × 8 frames).
 *   The default English text in composite.html is replaced via DOM injection
 *   before each screenshot pass.
 *
 * Outputs:
 *   - output/phone/{locale}/      ← 1500x3250 phone chrome
 *   - output/tablet7/{locale}/    ← 1800x2880 7" tablet chrome
 *   - output/tablet10/{locale}/   ← 2400x3840 10" tablet chrome
 *
 * Usage:
 *   node screenshots/render.js                         # all locales
 *   LOCALES=en,fr node screenshots/render.js           # subset
 *   PLATFORMS=phone node screenshots/render.js         # one form factor
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const MAX_FRAME_HEIGHT = 3840;

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

const ALL_PLATFORMS = [
  { name: 'phone',    bodyClass: '',         srcPrefix: 'raw_android/phone/' },
  { name: 'tablet7',  bodyClass: 'tablet7',  srcPrefix: 'raw_android/tablet7/' },
  { name: 'tablet10', bodyClass: 'tablet10', srcPrefix: 'raw_android/tablet10/' },
];

const I18N = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n.json'), 'utf8'));
const ALL_LOCALES = Object.keys(I18N).filter(k => !k.startsWith('_'));

// Env-var overrides for selective renders. Useful for fast iteration.
const LOCALES = (process.env.LOCALES || '').split(',').filter(Boolean);
const PLATFORMS_ARG = (process.env.PLATFORMS || '').split(',').filter(Boolean);
const TARGET_LOCALES = LOCALES.length ? LOCALES : ALL_LOCALES;
const TARGET_PLATFORMS = PLATFORMS_ARG.length
  ? ALL_PLATFORMS.filter(p => PLATFORMS_ARG.includes(p.name))
  : ALL_PLATFORMS;

console.log(`Rendering ${TARGET_LOCALES.length} locale(s) × ${TARGET_PLATFORMS.length} platform(s) × ${CAPTIONS.length} frames`);
console.log(`  locales:   ${TARGET_LOCALES.join(', ')}`);
console.log(`  platforms: ${TARGET_PLATFORMS.map(p => p.name).join(', ')}`);

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const htmlPath = path.join(__dirname, 'composite.html');

  for (const platform of TARGET_PLATFORMS) {
    console.log(`\n━━━ ${platform.name} ━━━`);

    // One page per platform — renders frames iteratively, swapping locale text in-place.
    const page = await browser.newPage();
    await page.setViewport({ width: 2600, height: MAX_FRAME_HEIGHT + 100, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((cls) => { document.body.className = cls; }, platform.bodyClass);

    // Hide all frames; we show one at a time.
    await page.evaluate(() => {
      document.querySelectorAll('.frame').forEach((f) => { f.style.display = 'none'; });
    });

    const frameCount = await page.evaluate(() => document.querySelectorAll('.frame').length);

    for (const locale of TARGET_LOCALES) {
      const localeStrings = I18N[locale];
      if (!localeStrings) { console.warn(`  ! no i18n for ${locale}, skipping`); continue; }

      const outDir = path.join(__dirname, 'output', platform.name, locale);
      fs.mkdirSync(outDir, { recursive: true });
      console.log(`  ${locale}:`);

      for (let i = 0; i < frameCount; i++) {
        const captionId = CAPTIONS[i] || `frame_${i + 1}`;
        const strings = localeStrings[captionId] || I18N.en[captionId];
        const outPath = path.join(outDir, `${captionId}.png`);

        // Show only this frame, swap its image src + localized text, await decode.
        const loaded = await page.evaluate(async (idx, prefix, headline, subtitle) => {
          const frames = document.querySelectorAll('.frame');
          frames.forEach((f, j) => { f.style.display = (j === idx) ? 'flex' : 'none'; });
          const frame = frames[idx];
          // Replace headline/subtitle (uses \n to drive line break with <br>)
          const headlineEl = frame.querySelector('.headline');
          const subtitleEl = frame.querySelector('.subtitle');
          if (headlineEl) headlineEl.innerHTML = headline.split('\n').map(s =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          ).join('<br>');
          if (subtitleEl) subtitleEl.textContent = subtitle;

          const img = frame.querySelector('img');
          const file = img.getAttribute('src').split('/').pop();
          return await new Promise((resolve) => {
            img.onload = () => img.decode().then(
              () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight }),
              () => resolve({ ok: false })
            );
            img.onerror = () => resolve({ ok: false });
            img.src = prefix + file + '?t=' + Date.now();
          });
        }, i, platform.srcPrefix, strings.headline, strings.subtitle);

        if (!loaded.ok) console.warn(`    ! image failed for ${captionId}`);

        const frameHandle = (await page.$$('.frame'))[i];
        await frameHandle.screenshot({ path: outPath });
        const stat = fs.statSync(outPath);
        console.log(`    ✓ ${captionId}.png (${(stat.size / 1024).toFixed(0)} KB)`);
      }
    }

    await page.close();
  }

  await browser.close();

  console.log('');
  let total = 0;
  for (const platform of TARGET_PLATFORMS) {
    for (const locale of TARGET_LOCALES) {
      const outDir = path.join(__dirname, 'output', platform.name, locale);
      if (!fs.existsSync(outDir)) continue;
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
      total += files.length;
    }
  }
  console.log(`Total frames written: ${total}`);
})();
