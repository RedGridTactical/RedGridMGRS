#!/usr/bin/env node
/**
 * asc-update-promo.js — Push Promotional Text to the live + next iOS versions.
 *
 * Promotional Text is the ONE App Store field editable at ANY time with NO new
 * version and NO review (Apple's documented exception). It renders at the top of
 * the store listing. It is currently EMPTY on every version — a wasted conversion
 * surface. This fills it with the new 7-day-free-trial hook.
 *
 * Targets the 2 most-recent versions (the live READY_FOR_SALE one + the in-review
 * one) so the promo shows now AND persists after the next release. Editing promo
 * text does NOT disturb a version's review.
 *
 * Limit: 170 chars/locale (script validates and skips anything over).
 *
 * Usage:
 *   node scripts/asc-update-promo.js          # dry-run (default; shows copy + char counts)
 *   node scripts/asc-update-promo.js --apply  # write
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));

const EN = 'New: start a 7-day free trial of Red Grid Pro — offline tactical maps, Meshtastic mesh, all 10 tools. DAGR-class MGRS land nav. Zero network, zero tracking, no account.';

// Localized for the 6 in-app languages; English fallback for every other ASC locale.
const PROMO_BY_LOCALE = {
  'en-US': EN, 'en-GB': EN, 'en-AU': EN, 'en-CA': EN,
  'fr-FR': 'Nouveau : essai gratuit de 7 jours de Red Grid Pro — cartes tactiques hors ligne, mesh Meshtastic, 10 outils. Navigation MGRS. Zéro réseau, zéro pistage, sans compte.',
  'fr-CA': 'Nouveau : essai gratuit de 7 jours de Red Grid Pro — cartes tactiques hors ligne, mesh Meshtastic, 10 outils. Navigation MGRS. Zéro réseau, zéro pistage, sans compte.',
  'de-DE': 'Neu: Red Grid Pro 7 Tage gratis testen — Offline-Karten, Meshtastic-Mesh, alle 10 Tools. MGRS-Navigation der DAGR-Klasse. Kein Netz, kein Tracking, kein Konto.',
  'es-ES': 'Nuevo: prueba gratis de 7 días de Red Grid Pro — mapas tácticos sin conexión, malla Meshtastic, 10 herramientas. Navegación MGRS. Sin red, sin rastreo, sin cuenta.',
  'es-MX': 'Nuevo: prueba gratis de 7 días de Red Grid Pro — mapas tácticos sin conexión, malla Meshtastic, 10 herramientas. Navegación MGRS. Sin red, sin rastreo, sin cuenta.',
  'ja': '新登場：Red Grid Pro を7日間無料体験。オフライン戦術地図、Meshtasticメッシュ、全10ツール。DAGR級のMGRSナビ。通信不要・追跡なし・アカウント不要。',
  'ko': '신규: Red Grid Pro 7일 무료 체험 — 오프라인 전술 지도, Meshtastic 메시, 10가지 도구. DAGR급 MGRS 내비게이션. 네트워크·추적·계정 불필요.',
};
const promoFor = (locale) => PROMO_BY_LOCALE[locale] || EN;

function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
}
const api = () => axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, validateStatus: () => true });

(async () => {
  console.log(APPLY ? 'MODE: --apply (writing)\n' : 'MODE: dry-run (no writes; pass --apply to write)\n');
  // Sanity: show every distinct copy + char count up front.
  console.log('=== Promo copy (limit 170) ===');
  for (const [loc, txt] of Object.entries(PROMO_BY_LOCALE)) {
    const over = txt.length > 170 ? '  ⚠️ OVER LIMIT' : '';
    console.log(`  ${loc} (${txt.length}/170)${over}: ${txt}`);
  }
  console.log(`  <fallback en> (${EN.length}/170)\n`);

  const v = await api().get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { 'filter[platform]': 'IOS', limit: 10 } });
  const versions = (v.data.data || []).slice()
    .sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''))
    .slice(0, 2); // live + next

  for (const ver of versions) {
    console.log(`\n=== v${ver.attributes.versionString} [${ver.attributes.appStoreState}] ===`);
    const locs = await api().get(`/appStoreVersions/${ver.id}/appStoreVersionLocalizations`, { params: { limit: 60 } });
    for (const loc of (locs.data.data || [])) {
      const locale = loc.attributes.locale;
      const txt = promoFor(locale);
      if (txt.length > 170) { console.log(`  ${locale}: SKIP (copy ${txt.length}/170 over limit)`); continue; }
      const cur = loc.attributes.promotionalText || '';
      if (cur === txt) { console.log(`  ${locale}: already set`); continue; }
      console.log(`  ${locale}: ${cur ? '(replace)' : '(was empty)'} → ${txt.slice(0, 50)}…`);
      if (APPLY) {
        const res = await api().patch(`/appStoreVersionLocalizations/${loc.id}`, {
          data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { promotionalText: txt } },
        });
        console.log(res.status >= 400 ? `    ✗ ${res.status} ${JSON.stringify(res.data).slice(0, 160)}` : '    ✓ updated');
      }
    }
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
