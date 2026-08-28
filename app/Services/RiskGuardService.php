<?php

namespace App\Services;

use App\Models\Account;
use Illuminate\Support\Facades\DB;

class RiskGuardService
{
    // Worst-case stake currently open on real orders for this account.
    private function openOrdersStake(int $accountId): float
    {
        return (float) DB::table('orders')
            ->where('account_id', $accountId)
            ->where('status', 'pending')
            ->sum('stake');
    }

    // Worst-case stake for bots that are running but have not placed an
    // order yet -- their configured stake counts as pending exposure.
    // Bots that already have a pending order are excluded here so their
    // stake is not counted twice.
    private function armedBotsStake(int $accountId): float
    {
        $sessionIdsWithOpenOrder = DB::table('orders')
            ->where('status', 'pending')
            ->whereNotNull('bot_session_id')
            ->pluck('bot_session_id');

        return (float) DB::table('bot_sessions')
            ->join('user_bots', 'user_bots.id', '=', 'bot_sessions.bot_id')
            ->where('user_bots.account_id', $accountId)
            ->where('bot_sessions.status', 'running')
            ->whereNotIn('bot_sessions.id', $sessionIdsWithOpenOrder)
            ->sum('bot_sessions.initial_stake');
    }

    // Full worst-case exposure breakdown for one account, live.
    public function calculate(Account $account): array
    {
        $openOrders = $this->openOrdersStake($account->id);
        $armedBots  = $this->armedBotsStake($account->id);
        $total      = $openOrders + $armedBots;
        $balance    = (float) ($account->balance_cache ?? 0);
        $pct        = $balance > 0 ? round(($total / $balance) * 100, 1) : 0;

        return [
            'open_orders_stake' => round($openOrders, 2),
            'armed_bots_stake'  => round($armedBots, 2),
            'total_exposure'    => round($total, 2),
            'balance'           => round($balance, 2),
            'exposure_pct'      => $pct,
            'zone'              => $this->zoneFor($account, $pct),
        ];
    }

    // Zones are relative to the user's own configured stop_loss_pct
    // (from risk_profiles), not a hardcoded number -- someone with a
    // tighter personal limit gets warned sooner than someone with a
    // looser one.
    private function zoneFor(Account $account, float $pct): string
    {
        $profile = DB::table('risk_profiles')
            ->where('user_id', $account->user_id)
            ->first();

        $dangerLine = $profile && $profile->stop_loss_pct
            ? (float) $profile->stop_loss_pct
            : 15.0; // fallback if user has not set a risk profile yet

        if ($pct >= $dangerLine) return 'red';
        if ($pct >= $dangerLine * 0.66) return 'orange';
        if ($pct >= $dangerLine * 0.33) return 'yellow';
        return 'green';
    }

    // The gatekeeper check -- call this before allowing any manual trade
    // or bot launch. Returns whether the proposed stake requires the
    // user to explicitly reconfirm before proceeding.
    public function evaluateProposedTrade(Account $account, float $proposedStake): array
    {
        $current = $this->calculate($account);
        $projectedTotal = $current['total_exposure'] + $proposedStake;
        $balance = $current['balance'];
        $projectedPct = $balance > 0 ? round(($projectedTotal / $balance) * 100, 1) : 0;
        $projectedZone = $this->zoneFor($account, $projectedPct);

        return [
            'current_exposure_pct'   => $current['exposure_pct'],
            'current_zone'           => $current['zone'],
            'proposed_stake'         => round($proposedStake, 2),
            'projected_total'        => round($projectedTotal, 2),
            'projected_exposure_pct' => $projectedPct,
            'projected_zone'         => $projectedZone,
            'requires_confirmation'  => in_array($projectedZone, ['orange', 'red']),
        ];
    }

    // Recomputes and saves the cache columns -- call this after any
    // trade opens/closes or bot starts/stops, so the Console can just
    // read cached_exposure instead of recalculating on every poll.
    public function refreshCache(Account $account): void
    {
        $result = $this->calculate($account);
        $account->update([
            'cached_exposure'      => $result['total_exposure'],
            'cached_exposure_zone' => $result['zone'],
            'exposure_synced_at'   => now(),
        ]);
    }
}
