export function subscriptionPlanName(plan: { name: string; period?: string }): string {
  return plan.period === 'yearly' || plan.name === 'اشتراک سالانه'
    ? 'اشتراک از اکنون تا پایان سال تحصیلی'
    : plan.name
}
