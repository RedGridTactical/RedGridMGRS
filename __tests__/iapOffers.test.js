const { detectFreeTrial, hasPriorSubscription, isTrialEligible, getAndroidTrialOfferToken } = require('../src/utils/iapOffers');

// HISTORICAL fixture shape (the self-serve store trial was removed from both
// stores 2026-07-25, and annual was retired from sale 2026-08-01). Kept to
// exercise the platform-shape parsing in detectFreeTrial, not store reality.
const iosAnnualWithTrial = {
  id: 'redgrid_mgrs_pro_annual',
  displayPrice: '$29.99',
  subscription: {
    subscriptionGroupID: '21991518',
    subscriptionPeriod: 'YEAR',
    introductoryOffer: {
      displayPrice: 'Free', id: '', paymentMode: 'FREETRIAL',
      period: 'WEEK', periodCount: 1, price: 0, type: 'introductory',
    },
  },
};

const iosAnnualFlattenedTrial = {
  id: 'redgrid_mgrs_pro_annual',
  displayPrice: '$29.99',
  introductoryPricePaymentModeIOS: 'FREETRIAL',
  introductoryPriceSubscriptionPeriodIOS: 'WEEK',
  introductoryPriceNumberOfPeriodsIOS: '1',
};

const iosAnnualNoTrial = {
  id: 'redgrid_mgrs_pro_annual',
  displayPrice: '$29.99',
  subscription: { subscriptionGroupID: '21991518', subscriptionPeriod: 'YEAR' },
};

const androidAnnualWithTrial = {
  id: 'redgrid_mgrs_pro_annual',
  subscriptionOfferDetails: [
    { // free-trial offer: a $0 phase followed by the recurring phase
      basePlanId: 'annual', offerId: 'freetrial', offerToken: 'tok1', offerTags: [],
      pricingPhases: { pricingPhaseList: [
        { formattedPrice: 'Free', priceCurrencyCode: 'USD', billingPeriod: 'P1W', billingCycleCount: 1, priceAmountMicros: '0', recurrenceMode: 2 },
        { formattedPrice: '$29.99', priceCurrencyCode: 'USD', billingPeriod: 'P1Y', billingCycleCount: 0, priceAmountMicros: '29990000', recurrenceMode: 1 },
      ] },
    },
    { // base plan (no free phase)
      basePlanId: 'annual', offerId: null, offerToken: 'tok2', offerTags: [],
      pricingPhases: { pricingPhaseList: [
        { formattedPrice: '$29.99', priceCurrencyCode: 'USD', billingPeriod: 'P1Y', billingCycleCount: 0, priceAmountMicros: '29990000', recurrenceMode: 1 },
      ] },
    },
  ],
};

const androidAnnualNoTrial = {
  id: 'redgrid_mgrs_pro_annual',
  subscriptionOfferDetails: [
    { basePlanId: 'annual', offerId: null, offerToken: 'tok2', offerTags: [],
      pricingPhases: { pricingPhaseList: [
        { formattedPrice: '$29.99', priceCurrencyCode: 'USD', billingPeriod: 'P1Y', billingCycleCount: 0, priceAmountMicros: '29990000', recurrenceMode: 1 },
      ] } },
  ],
};

describe('detectFreeTrial', () => {
  test('iOS nested introductoryOffer FREETRIAL/WEEK x1 → 7-day trial', () => {
    const r = detectFreeTrial(iosAnnualWithTrial);
    expect(r.hasTrial).toBe(true);
    expect(r.days).toBe(7);
    expect(r.label).toBe('7-day');
  });

  test('iOS flattened introductoryPrice*IOS fields → 7-day trial', () => {
    const r = detectFreeTrial(iosAnnualFlattenedTrial);
    expect(r.hasTrial).toBe(true);
    expect(r.days).toBe(7);
  });

  test('iOS sub without an intro offer → no trial', () => {
    expect(detectFreeTrial(iosAnnualNoTrial).hasTrial).toBe(false);
  });

  test('Android $0 pricing phase (P1W) → 7-day trial', () => {
    const r = detectFreeTrial(androidAnnualWithTrial);
    expect(r.hasTrial).toBe(true);
    expect(r.days).toBe(7);
  });

  test('Android base plan only → no trial', () => {
    expect(detectFreeTrial(androidAnnualNoTrial).hasTrial).toBe(false);
  });

  test('null / undefined / junk → no trial (no throw)', () => {
    expect(detectFreeTrial(null).hasTrial).toBe(false);
    expect(detectFreeTrial(undefined).hasTrial).toBe(false);
    expect(detectFreeTrial({}).hasTrial).toBe(false);
    expect(detectFreeTrial(42).hasTrial).toBe(false);
  });
});

describe('hasPriorSubscription', () => {
  test('empty / nullish history → no prior sub', () => {
    expect(hasPriorSubscription([])).toBe(false);
    expect(hasPriorSubscription(null)).toBe(false);
    expect(hasPriorSubscription(undefined)).toBe(false);
  });

  test('prior annual (iOS id) → true', () => {
    expect(hasPriorSubscription([{ id: 'redgrid_mgrs_pro_annual' }])).toBe(true);
  });

  test('prior monthly (Android productId) → true', () => {
    expect(hasPriorSubscription([{ productId: 'redgrid_mgrs_pro_monthly' }])).toBe(true);
  });

  test('Android ids[] array form → true', () => {
    expect(hasPriorSubscription([{ ids: ['redgrid_mgrs_pro_annual'] }])).toBe(true);
  });

  test('only a lifetime purchase → not a subscription, false', () => {
    expect(hasPriorSubscription([{ id: 'redgrid_pro_lifetime' }])).toBe(false);
  });
});

describe('isTrialEligible', () => {
  test('trial offer + no prior sub → eligible', () => {
    expect(isTrialEligible(iosAnnualWithTrial, [])).toBe(true);
    expect(isTrialEligible(androidAnnualWithTrial, [])).toBe(true);
  });

  test('trial offer + prior sub → NOT eligible (falls back to paywall)', () => {
    expect(isTrialEligible(iosAnnualWithTrial, [{ id: 'redgrid_mgrs_pro_annual' }])).toBe(false);
  });

  test('no trial offer → never eligible (e.g. Android before Play offer created)', () => {
    expect(isTrialEligible(iosAnnualNoTrial, [])).toBe(false);
    expect(isTrialEligible(androidAnnualNoTrial, [])).toBe(false);
  });
});

describe('getAndroidTrialOfferToken', () => {
  test('returns the token of the offer with a $0 phase (the trial offer)', () => {
    expect(getAndroidTrialOfferToken(androidAnnualWithTrial)).toBe('tok1');
  });

  test('returns null when no offer has a free phase (base plan only)', () => {
    expect(getAndroidTrialOfferToken(androidAnnualNoTrial)).toBe(null);
  });

  test('returns null for iOS products / nullish / junk', () => {
    expect(getAndroidTrialOfferToken(iosAnnualWithTrial)).toBe(null);
    expect(getAndroidTrialOfferToken(null)).toBe(null);
    expect(getAndroidTrialOfferToken({})).toBe(null);
  });
});

// ─── Retired SKU guard (2026-08-01) ──────────────────────────────────────────
// Annual was retired from sale. The dangerous regression is not a crash: a tier
// rendered in ProGate's TIERS array is selectable, and a selectable tier whose
// SKU the store no longer sells is a purchase that always fails on the
// highest-intent screen. Where the symbols are importable (iapOffers owns the
// SKU constants and tier mapping) we assert BEHAVIOR; the two arrays that live
// in RN modules (TIERS, SUB_IDS) are checked in source with anchors asserted
// found and slices taken to the closing bracket, so a reformat or rename fails
// LOUD instead of passing vacuously against an empty string.
const fs = require('fs');
const path = require('path');
const readSource = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const {
  PRO_PRODUCT_ID, SUB_MONTHLY_ID, SUB_ANNUAL_ID, tierToSku, isSubTier,
} = require('../src/utils/iapOffers');

// Slice from an anchor to the next closing token, asserting both exist —
// indexOf() misses must fail the test, never silently yield ''.
function sliceBlock(src, anchor, closer) {
  const i = src.indexOf(anchor);
  expect(i).toBeGreaterThan(-1);
  const j = src.indexOf(closer, i);
  expect(j).toBeGreaterThan(i);
  return src.slice(i, j + closer.length);
}

describe('retired annual SKU', () => {
  it('maps every tier to a sellable SKU — stale annual buys monthly, never lifetime', () => {
    expect(tierToSku('monthly')).toBe(SUB_MONTHLY_ID);
    expect(tierToSku('annual')).toBe(SUB_MONTHLY_ID);
    expect(tierToSku('lifetime')).toBe(PRO_PRODUCT_ID);
    // Annual is still subscription-shaped for entitlement logic.
    expect(isSubTier('annual')).toBe(true);
    expect(isSubTier('lifetime')).toBe(false);
  });

  it('purchase() normalizes the tier BEFORE the product lookup', () => {
    // The SKU mapping alone is not enough: purchase() keys detailsMap by tier,
    // so without normalization a stale annual dead-ends at "store unavailable"
    // instead of buying monthly. Pin the normalization line itself.
    const iap = readSource('src/hooks/useIAP.js');
    const block = sliceBlock(iap, 'const requestedTier', ';');
    expect(iap).toMatch(/requestedTier === 'annual' \? 'monthly' : requestedTier/);
    expect(block).toContain('tier || selectedTier');
  });

  it('is not offered as a purchasable tier in the paywall', () => {
    const gate = readSource('src/components/ProGate.js');
    const tiers = sliceBlock(gate, 'const TIERS = [', '];');
    expect(tiers).toMatch(/id:\s*['"]monthly['"]/);
    expect(tiers).toMatch(/id:\s*['"]lifetime['"]/);
    expect(tiers).not.toMatch(/annual/i);
  });

  it('is not fetched for sale, but still grants entitlement', () => {
    const iap = readSource('src/hooks/useIAP.js');
    const subIds = sliceBlock(iap, 'const SUB_IDS', '];');
    expect(subIds).toContain('SUB_MONTHLY_ID');
    expect(subIds).not.toContain('SUB_ANNUAL_ID');
    // Entitlement list must keep annual (existing subscribers keep renewing)
    // AND stay derived from the sale list, so a future for-sale SKU is
    // automatically entitled rather than charged-but-locked-out.
    const all = sliceBlock(iap, 'const ALL_PRODUCT_IDS', '];');
    expect(all).toContain('...SUB_IDS');
    expect(all).toContain('SUB_ANNUAL_ID');
  });

  it('never defaults the selection to a retired tier', () => {
    const gate = readSource('src/components/ProGate.js');
    const iap = readSource('src/hooks/useIAP.js');
    expect(gate).toContain("selectedTier || 'monthly'");
    const def = sliceBlock(iap, 'const [selectedTier', ';');
    expect(def).toContain("useState('monthly')");
  });
});
