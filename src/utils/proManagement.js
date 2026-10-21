// Presentation rules only. Store entitlement verification remains in useIAP.
export function purchaseTiersForPlan(ownedPlan) {
  if (ownedPlan === 'free') return ['monthly', 'lifetime'];
  if (ownedPlan === 'monthly' || ownedPlan === 'annual') return ['lifetime'];
  return [];
}

export function canPurchaseTier(ownedPlan, tier) {
  return purchaseTiersForPlan(ownedPlan).includes(tier);
}

export function ownedPlanLabelKey(ownedPlan) {
  const keys = {
    free: 'planFree', monthly: 'planMonthly', annual: 'planAnnual',
    lifetime: 'planLifetime', loading: 'planLoading',
  };
  return `managePro.${keys[ownedPlan] || 'planUnknown'}`;
}

export function subscriptionManagementURL(platform) {
  return platform === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
}
