<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Single source of truth for "does this user's active plan unlock
 * feature X" checks. Reads plans.features (JSON) rather than hardcoding
 * plan names, so admin can change what each plan unlocks from the
 * database alone -- no code changes needed to adjust entitlements.
 */
class PlanFeatureService
{
    public function hasFeature(int $userId, string $featureKey): bool
    {
        $subscription = DB::table('subscriptions')
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->where('subscriptions.user_id', $userId)
            ->where('subscriptions.status', 'active')
            ->first(['plans.features']);

        if (!$subscription) {
            return false;
        }

        $features = json_decode($subscription->features, true) ?? [];

        return (bool) ($features[$featureKey] ?? false);
    }
}