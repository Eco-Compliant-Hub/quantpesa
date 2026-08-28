<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\RiskGuardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class TradingController extends Controller
{
    // GET /api/trading/contract-types
    public function contractTypes()
    {
        $types = DB::table('contract_types')
            ->where('is_active', 1)
            ->select('id', 'name', 'description', 'base_payout', 'win_probability', 'requires_barrier')
            ->get();

        return response()->json([
            'success' => true,
            'count'   => $types->count(),
            'data'    => $types,
        ], 200);
    }

    // POST /api/trading/orders
    public function placeOrder(Request $request, RiskGuardService $riskGuard)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'account_id'              => 'required|integer|exists:accounts,id',
            'symbol_id'                => 'required|integer|exists:symbols,id',
            'contract_type_id'         => 'required|integer|exists:contract_types,id',
            'stake'                    => 'required|numeric|min:0.01',
            'duration_ticks'           => 'required|integer|min:1',
            'barrier'                  => 'nullable|string|max:10',
            'ensemble_prediction_id'   => 'nullable|integer|exists:ensemble_predictions,id',
            // New: the observational context captured on the Analysis
            // page, if this order followed from one. Nullable -- manual
            // trades placed without visiting Analysis first are still
            // valid orders.
            'analysis_context_id'      => 'nullable|integer|exists:analysis_contexts,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Confirm the account belongs to this user
        $account = DB::table('accounts')
            ->where('id', $request->account_id)
            ->where('user_id', $user->id)
            ->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Account not found or does not belong to you.',
            ], 403);
        }

        // If an analysis context was supplied, confirm it actually
        // belongs to this user before binding it to the order -- same
        // ownership pattern as the account check above. A context id
        // from someone else's session should never silently attach.
        if ($request->filled('analysis_context_id')) {
            $ownsContext = DB::table('analysis_contexts')
                ->where('id', $request->analysis_context_id)
                ->where('user_id', $user->id)
                ->exists();

            if (!$ownsContext) {
                return response()->json([
                    'success' => false,
                    'message' => 'Analysis context not found or does not belong to you.',
                ], 403);
            }
        }

        // Check if contract type requires a barrier
        $contractType = DB::table('contract_types')->where('id', $request->contract_type_id)->first();

        if ($contractType->requires_barrier && !$request->barrier) {
            return response()->json([
                'success' => false,
                'message' => 'This contract type requires a barrier value.',
            ], 422);
        }

        // Risk Guard gate -- same checkpoint as bot launches. If this
        // stake would push the account into orange/red zone, the frontend
        // must resend with confirm_risk=true (after showing the user the
        // projected exposure) to proceed.
        $accountModel = Account::find($request->account_id);

        if ($accountModel) {
            $evaluation = $riskGuard->evaluateProposedTrade($accountModel, (float) $request->stake);

            if ($evaluation['requires_confirmation'] && !$request->boolean('confirm_risk')) {
                return response()->json([
                    'success'            => false,
                    'needs_confirmation' => true,
                    'message'            => 'This trade would push account exposure into the ' . $evaluation['projected_zone'] . ' zone.',
                    'evaluation'         => $evaluation,
                ], 409);
            }
        }

        $orderId = DB::table('orders')->insertGetId([
            'user_id'                => $user->id,
            'account_id'             => $request->account_id,
            'bot_session_id'         => null,
            'analysis_context_id'    => $request->analysis_context_id ?? null,
            'symbol_id'              => $request->symbol_id,
            'contract_type_id'       => $request->contract_type_id,
            'ensemble_prediction_id' => $request->ensemble_prediction_id,
            'stake'                  => $request->stake,
            'duration_ticks'         => $request->duration_ticks,
            'barrier'                => $request->barrier,
            'status'                 => 'pending',
            'payout'                 => null,
            'broker_contract_id'     => null,
            'created_at'             => now(),
        ]);

        // TODO: Send real trade request to Deriv WebSocket API here.
        // For now the order is stored as 'pending' in our own database only.

        $order = DB::table('orders')->where('id', $orderId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Order placed (pending). Broker execution not yet connected.',
            'data'    => $order,
        ], 201);
    }

    // GET /api/trading/orders
    public function myOrders(Request $request)
    {
        $user = $request->user();

        $orders = DB::table('orders as o')
            ->join('symbols as s', 's.id', '=', 'o.symbol_id')
            ->join('contract_types as ct', 'ct.id', '=', 'o.contract_type_id')
            ->where('o.user_id', $user->id)
            ->select(
                'o.id',
                's.symbol',
                'ct.name as contract_type',
                'o.stake',
                'o.duration_ticks',
                'o.barrier',
                'o.status',
                'o.payout',
                'o.analysis_context_id',
                'o.created_at'
            )
            ->orderByDesc('o.id')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'count'   => $orders->count(),
            'data'    => $orders,
        ], 200);
    }

    // GET /api/trading/orders/{id}
    public function orderDetail(Request $request, $id)
    {
        $user = $request->user();

        $order = DB::table('orders as o')
            ->join('symbols as s', 's.id', '=', 'o.symbol_id')
            ->join('contract_types as ct', 'ct.id', '=', 'o.contract_type_id')
            ->where('o.id', $id)
            ->where('o.user_id', $user->id)
            ->select(
                'o.*',
                's.symbol',
                'ct.name as contract_type'
            )
            ->first();

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found.',
            ], 404);
        }

        $execution = DB::table('executions')->where('order_id', $id)->first();

        return response()->json([
            'success'   => true,
            'order'     => $order,
            'execution' => $execution,
        ], 200);
    }
}
