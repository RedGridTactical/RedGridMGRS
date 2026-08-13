const { detectFreeTrial, hasPriorSubscription, isTrialEligible, getAndroidTrialOfferToken } = require('../src/utils/iapOffers');

// Mirrors the live ASC offer: FREE_TRIAL / ONE_WEEK / 1 period on the annual sub.
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
// Annual was retired from sale. The dangerous failure is not a crash: a tier
// listed in ProGate's TIERS array renders as a selectable card, and because
// pricesLoaded stays true as long as ANY price resolves, the purchase button
// stays enabled. Re-adding annual would therefore ship a paywall whose default
// or selectable tier maps to a SKU the store refuses to sell — a purchase that
// always fails, on the highest-intent screen in the app. Asserted against the
// source so it fails on reintroduction rather than in the field.
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('retired annual SKU', () => {
  const gate = read('src/components/ProGate.js');
  const iap = read('src/hooks/useIAP.js');

  const tiersBlock = gate.slice(gate.indexOf('const TIERS = ['), gate.indexOf('];', gate.indexOf('const TIERS = [')));

  it('is not offered as a purchasable tier in the paywall', () => {
    expect(tiersBlock).not.toMatch(/id:\s*'annual'/);
    expect(tiersBlock).toMatch(/id:\s*'monthly'/);
    expect(tiersBlock).toMatch(/id:\s*'lifetime'/);
  });

  it('is not the default selected tier anywhere', () => {
    expect(gate).not.toMatch(/selectedTier\s*\|\|\s*'annual'/);
    expect(iap).not.toMatch(/useState\('annual'\)/);
  });

  it('is not fetched as a for-sale subscription', () => {
    const subIds = iap.slice(iap.indexOf('const SUB_IDS'), iap.indexOf('\n', iap.indexOf('const SUB_IDS')));
    expect(subIds).not.toMatch(/SUB_ANNUAL_ID/);
  });

  it('is still recognised for existing subscribers, who keep renewing', () => {
    // Removing it here would strand the annual subscribers who are still active.
    expect(iap).toMatch(/const ALL_PRODUCT_IDS = \[[^\]]*SUB_ANNUAL_ID/);
    expect(iap).toMatch(/SUB_ANNUAL_ID\s*=\s*'redgrid_mgrs_pro_annual'/);
  });

  it('never maps a stale annual tier onto the lifetime SKU', () => {
    // A persisted 'annual' tier must not fall through to PRO_PRODUCT_ID, which
    // would charge a one-time purchase to someone who picked a subscription.
    const fn = iap.slice(iap.indexOf('const tierToSku'), iap.indexOf('};', iap.indexOf('const tierToSku')));
    expect(fn).toMatch(/tier === 'annual'\) return SUB_MONTHLY_ID/);
  });
});
