/**
 * iapOffers — pure helpers to detect a free-trial introductory offer on an
 * expo-iap product object and to determine intro-offer eligibility.
 *
 * No native imports — fully unit-testable. Consumed by useIAP to drive the
 * ProGate "Start free trial" CTA. Handles both platform shapes:
 *   iOS  (expo-iap SubscriptionProductIos): product.subscription.introductoryOffer
 *        with paymentMode 'FREETRIAL' (or the flattened introductoryPrice*IOS fields).
 *   Android (SubscriptionProductAndroid): a pricingPhaseList entry priced at 0.
 *
 * Intro-offer eligibility is per SUBSCRIPTION GROUP: if the user has ever
 * purchased any subscription in the group, StoreKit/Play will not grant the
 * intro offer again — so we fall back to the standard paywall for them.
 */

// Subscriptions in the "Red Grid Pro" group. Lifetime is a separate non-sub
// product type and does not affect subscription intro-offer eligibility.
const SUB_PRODUCT_IDS = ['redgrid_mgrs_pro_monthly', 'redgrid_mgrs_pro_annual'];

// StoreKit period unit → days (best-effort, for a human label only).
function iosPeriodToDays(period, count) {
  const n = Number(count) || 1;
  switch (period) {
    case 'DAY': return n;
    case 'WEEK': return n * 7;
    case 'MONTH': return n * 30;
    case 'YEAR': return n * 365;
    default: return 0;
  }
}

// ISO-8601 duration (Android billingPeriod, e.g. 'P1W', 'P3D', 'P1M') → days.
function androidPeriodToDays(billingPeriod) {
  if (typeof billingPeriod !== 'string') return 0;
  const m = billingPeriod.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/);
  if (!m) return 0;
  const y = Number(m[1]) || 0, mo = Number(m[2]) || 0, w = Number(m[3]) || 0, d = Number(m[4]) || 0;
  return y * 365 + mo * 30 + w * 7 + d;
}

function daysLabel(days) {
  if (days > 0) return `${days}-day`;
  return '';
}

/**
 * Detect a free-trial introductory offer on a product.
 * @returns {{ hasTrial: boolean, days: number, label: string }}
 */
export function detectFreeTrial(product) {
  if (!product || typeof product !== 'object') return { hasTrial: false, days: 0, label: '' };

  // iOS — StoreKit 2 nested shape.
  const io = product.subscription && product.subscription.introductoryOffer;
  if (io && io.paymentMode === 'FREETRIAL') {
    const days = iosPeriodToDays(io.period, io.periodCount);
    return { hasTrial: true, days, label: daysLabel(days) };
  }
  // iOS — flattened legacy fields.
  if (product.introductoryPricePaymentModeIOS === 'FREETRIAL') {
    const days = iosPeriodToDays(product.introductoryPriceSubscriptionPeriodIOS, product.introductoryPriceNumberOfPeriodsIOS);
    return { hasTrial: true, days, label: daysLabel(days) };
  }

  // Android — any subscription offer whose pricing phase list contains a $0 phase.
  const details = product.subscriptionOfferDetails;
  if (Array.isArray(details)) {
    for (const d of details) {
      const phases = d && d.pricingPhases && d.pricingPhases.pricingPhaseList;
      if (!Array.isArray(phases)) continue;
      const free = phases.find((p) => p && String(p.priceAmountMicros) === '0');
      if (free) {
        const days = androidPeriodToDays(free.billingPeriod);
        return { hasTrial: true, days, label: daysLabel(days) };
      }
    }
  }

  return { hasTrial: false, days: 0, label: '' };
}

/**
 * Has the user ever purchased a subscription in the group?
 * `purchases` is the array returned by getAvailablePurchases() (may be nullish).
 */
export function hasPriorSubscription(purchases) {
  if (!Array.isArray(purchases)) return false;
  return purchases.some((p) => {
    if (!p) return false;
    const ids = Array.isArray(p.ids) ? p.ids : [];
    return SUB_PRODUCT_IDS.includes(p.id) || SUB_PRODUCT_IDS.includes(p.productId) || ids.some((x) => SUB_PRODUCT_IDS.includes(x));
  });
}

/**
 * Is the user eligible to START the free trial on this (annual) product now?
 * Eligible = the product advertises a free trial AND no prior subscription purchase.
 */
export function isTrialEligible(annualProduct, purchases) {
  if (!detectFreeTrial(annualProduct).hasTrial) return false;
  return !hasPriorSubscription(purchases);
}
