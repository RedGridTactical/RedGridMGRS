const { detectFreeTrial, hasPriorSubscription, isTrialEligible } = require('../src/utils/iapOffers');

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
