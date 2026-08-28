<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\RiskGuardService;
use Illuminate\Http\Request;

class RiskController extends Controller
{
    public function __construct(private RiskGuardService $riskGuard) {}

    // Live exposure snapshot for one account -- used by the Console/
    // Dashboard to display current risk zone.
    public function exposure(Request $request, $accountId)
    {
        $account = Account::where('id', $accountId)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Account not found.',
            ], 404);
        }

        $result = $this->riskGuard->calculate($account);
        $this->riskGuard->refreshCache($account);

        return response()->json([
            'success'  => true,
            'exposure' => $result,
        ]);
    }

    // Gatekeeper check -- call this BEFORE placing a manual order or
    // launching a bot, with the proposed stake. Frontend uses
    // requires_confirmation to decide whether to show the reconfirm modal.
    public function evaluate(Request $request, $accountId)
    {
        $request->validate([
            'proposed_stake' => 'required|numeric|min:0.01',
        ]);

        $account = Account::where('id', $accountId)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Account not found.',
            ], 404);
        }

        $result = $this->riskGuard->evaluateProposedTrade(
            $account,
            (float) $request->proposed_stake
        );

        return response()->json([
            'success'    => true,
            'evaluation' => $result,
        ]);
    }
}
