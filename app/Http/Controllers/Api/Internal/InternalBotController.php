<?php

namespace App\Http\Controllers\Api\Internal;

use App\Events\BotTradeUpdated;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class InternalBotController extends Controller
{
    // POST /api/internal/bots/{id}/trade-result
    public function tradeResult(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'session_id'          => 'required|integer|exists:bot_sessions,id',
            'symbol'              => 'required|string|exists:symbols,symbol',
            'contract_type'       => 'required|string|exists:contract_types,name',
            'stake'               => 'required|numeric|min:0.01',
            'duration_ticks'      => 'required|integer|min:1',
            'barrier'             => 'nullable|string|max:10',
            'status'              => 'required|string|in:won,lost,open',
            'payout'              => 'nullable|numeric',
            'broker_contract_id'  => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $session = DB::table('bot_sessions')->where('id', $request->session_id)->first();

        if (!$session || $session->bot_id != $id) {
            return response()->json([
                'success' => false,
                'message' => 'Session does not belong to this bot.',
            ], 404);
        }

        $symbol = DB::table('symbols')->where('symbol', $request->symbol)->first();
        $contractType = DB::table('contract_types')->where('name', $request->contract_type)->first();
        $bot = DB::table('user_bots')->where('id', $session->bot_id)->first();

        $existingOpen = $request->broker_contract_id
            ? DB::table('orders')
                ->where('broker_contract_id', $request->broker_contract_id)
                ->where('status', 'open')
                ->first()
            : null;

        if ($existingOpen) {
            // This contract was already persisted as 'open' by
            // contract-opened -- update it in place rather than
            // creating a duplicate row.
            DB::table('orders')->where('id', $existingOpen->id)->update([
                'status'  => $request->status,
                'payout'  => $request->payout,
            ]);
            $orderId = $existingOpen->id;
        } else {
            $orderId = DB::table('orders')->insertGetId([
                'user_id'            => $bot->user_id,
                'account_id'         => $bot->account_id,
                'bot_session_id'     => $session->id,
                'symbol_id'          => $symbol->id,
                'contract_type_id'   => $contractType->id,
                'stake'              => $request->stake,
                'duration_ticks'     => $request->duration_ticks,
                'barrier'            => $request->barrier,
                'status'             => $request->status,
                'payout'             => $request->payout,
                'broker_contract_id' => $request->broker_contract_id,
                'created_at'         => now(),
            ]);
        }
    
        if ($request->status !== 'open') {
            $isWin = $request->status === 'won';
            $pnlDelta = ($request->payout ?? 0) - $request->stake;

            DB::table('bot_sessions')->where('id', $session->id)->update([
                'total_trades' => DB::raw('total_trades + 1'),
                'total_wins'   => DB::raw('total_wins + ' . ($isWin ? 1 : 0)),
                'total_losses' => DB::raw('total_losses + ' . (!$isWin ? 1 : 0)),
                'total_pnl'    => DB::raw('total_pnl + ' . $pnlDelta),
            ]);

            $updatedSession = DB::table('bot_sessions')->where('id', $session->id)->first();
            if ($updatedSession->total_pnl > $updatedSession->peak_pnl) {
                DB::table('bot_sessions')->where('id', $session->id)->update([
                    'peak_pnl' => $updatedSession->total_pnl,
                ]);
            }
        }

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $session->id,
            'event_type'  => 'trade_result',
            'payload'     => json_encode(['order_id' => $orderId, 'status' => $request->status]),
            'occurred_at' => now(),
        ]);

        Log::info("InternalBotController: trade result recorded for bot {$id}, order {$orderId}.");

        $freshSession = DB::table('bot_sessions')->where('id', $session->id)->first();

        broadcast(new BotTradeUpdated(
            userId: $bot->user_id,
            botId: (int) $id,
            sessionId: $session->id,
            orderId: $orderId,
            symbol: $request->symbol,
            contractType: $request->contract_type,
            stake: (float) $request->stake,
            payout: $request->payout !== null ? (float) $request->payout : null,
            status: $request->status,
            sessionTotalPnl: (float) ($freshSession->total_pnl ?? 0)
        ));

        return response()->json([
            'success'  => true,
            'order_id' => $orderId,
        ], 201);
    }

// GET /api/internal/bots/{id}/runtime-data
    public function runtimeData(Request $request, $id)
    {
        $bot = DB::table('user_bots')->where('id', $id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if (empty($bot->parsed_ast)) {
            return response()->json([
                'success' => false,
                'message' => 'Bot has no parsed AST yet.',
            ], 422);
        }

        $config = DB::table('bot_configurations')->where('bot_id', $id)->orderByDesc('id')->first();

        $symbol = null;
        $contractType = null;

        if ($config) {
            $symbolRow = DB::table('symbols')->where('id', $config->symbol_id)->first();
            $contractTypeRow = DB::table('contract_types')->where('id', $config->contract_type_id)->first();
            $symbol = $symbolRow->symbol ?? null;
            $contractType = $contractTypeRow->name ?? null;
        }

        $session = DB::table('bot_sessions')
            ->where('bot_id', $id)
            ->whereNull('stopped_at')
            ->orderByDesc('id')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'bot_id'        => (int) $id,
                'session_id'    => $session->id ?? null,
                'source'        => $bot->source,
                'parsed_ast'    => json_decode($bot->parsed_ast),
                'symbol'        => $symbol,
                'contract_type' => $contractType,
                'config'        => $config,
            ],
        ], 200);
    }

    // POST /api/internal/bots/{id}/contract-opened
    // Called immediately after Deriv confirms a buy, BEFORE awaiting
    // settlement. This persists intent so that if the process crashes
    // during the in-flight window (bought but not yet settled), the
    // next startup can reconcile the true outcome from Deriv instead
    // of silently guessing a loss.
    public function contractOpened(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'session_id'          => 'required|integer|exists:bot_sessions,id',
            'symbol'              => 'required|string|exists:symbols,symbol',
            'contract_type'       => 'required|string|exists:contract_types,name',
            'stake'               => 'required|numeric|min:0.01',
            'duration_ticks'      => 'required|integer|min:1',
            'barrier'             => 'nullable|string|max:10',
            'broker_contract_id'  => 'required|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $session = DB::table('bot_sessions')->where('id', $request->session_id)->first();

        if (!$session || $session->bot_id != $id) {
            return response()->json([
                'success' => false,
                'message' => 'Session does not belong to this bot.',
            ], 404);
        }

        $symbol = DB::table('symbols')->where('symbol', $request->symbol)->first();
        $contractType = DB::table('contract_types')->where('name', $request->contract_type)->first();
        $bot = DB::table('user_bots')->where('id', $session->bot_id)->first();

        $orderId = DB::table('orders')->insertGetId([
            'user_id'            => $bot->user_id,
            'account_id'         => $bot->account_id,
            'bot_session_id'     => $session->id,
            'symbol_id'          => $symbol->id,
            'contract_type_id'   => $contractType->id,
            'stake'              => $request->stake,
            'duration_ticks'     => $request->duration_ticks,
            'barrier'            => $request->barrier,
            'status'             => 'open',
            'broker_contract_id' => $request->broker_contract_id,
            'created_at'         => now(),
        ]);

        Log::info("InternalBotController: contract opened for bot {$id}, order {$orderId}, "
                 . "broker_contract_id={$request->broker_contract_id}.");

        broadcast(new BotTradeUpdated(
            userId: $bot->user_id,
            botId: (int) $id,
            sessionId: $session->id,
            orderId: $orderId,
            symbol: $request->symbol,
            contractType: $request->contract_type,
            stake: (float) $request->stake,
            payout: null,
            status: 'open',
            sessionTotalPnl: (float) ($session->total_pnl ?? 0)
        ));

        return response()->json([
            'success'  => true,
            'order_id' => $orderId,
        ], 201);
    }

    // POST /api/internal/bots/{id}/heartbeat
    // Called by deriv_hooks.py right after a successful WebSocket
    // connect (status=connected) and again on clean shutdown
    // (status=disconnected). Keeps accounts.connection_status and
    // last_heartbeat_at honest instead of permanently stale.
    public function heartbeat(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|string|in:connected,disconnected',
            'symbol' => 'nullable|string|max:50',
            'reason' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $bot = DB::table('user_bots')->where('id', $id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        DB::table('accounts')->where('id', $bot->account_id)->update([
            'connection_status' => $request->status,
            'last_heartbeat_at' => now(),
        ]);

        DB::table('websocket_events')->insert([
            'account_id' => $bot->account_id,
            'event_type' => $request->status,
            'symbol'     => $request->symbol,
            'details'    => json_encode(array_filter([
                'bot_id' => $id,
                'reason' => $request->reason,
            ])),
        ]);

        return response()->json([
            'success' => true,
        ], 200);
    }

    // GET /api/internal/bots/session/{sessionId}/control
    // Polled by bot_runner.py once per trade-loop iteration so it can
    // notice a stop request from BotController::stop() and exit
    // gracefully between trades, instead of relying on a force-kill.
    public function sessionControl(Request $request, $sessionId)
    {
        $session = DB::table('bot_sessions')->where('id', $sessionId)->first();

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'Session not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'control_command' => $session->control_command,
            ],
        ], 200);
    }


    // GET /api/internal/bots/{id}/open-orders
    // Called at bot_runner.py startup, before entering the trade loop.
    // Returns any orders still marked 'open' for this bot -- these are
    // orphaned contracts from a previous run that crashed mid-flight
    // (bought but never settled). The caller is expected to poll Deriv
    // directly for each broker_contract_id and report the true result.
    public function openOrders(Request $request, $id)
    {
        $orders = DB::table('orders')
            ->join('symbols', 'orders.symbol_id', '=', 'symbols.id')
            ->join('contract_types', 'orders.contract_type_id', '=', 'contract_types.id')
            ->where('orders.account_id', function ($query) use ($id) {
                $query->select('account_id')
                    ->from('user_bots')
                    ->where('id', $id)
                    ->limit(1);
            })
            ->where('orders.status', 'open')
            ->select(
                'orders.*',
                'symbols.symbol as symbol',
                'contract_types.name as contract_type'
            )
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $orders,
        ], 200);
    }

   // POST /api/internal/bots/{id}/session-end
    public function sessionEnd(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'session_id' => 'required|integer|exists:bot_sessions,id',
            'status'     => 'required|string|in:stopped,error',
            'reason'     => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $session = DB::table('bot_sessions')->where('id', $request->session_id)->first();

        if (!$session || $session->bot_id != $id) {
            return response()->json([
                'success' => false,
                'message' => 'Session does not belong to this bot.',
            ], 404);
        }

        if ($session->stopped_at) {
            // Already closed (e.g. by BotController::stop()) -- avoid
            // clobbering an existing stop record with a late report.
            return response()->json([
                'success' => true,
                'message' => 'Session was already closed.',
            ], 200);
        }

        DB::table('bot_sessions')->where('id', $session->id)->update([
            'status'      => $request->status,
            'stopped_at'  => now(),
            'stop_reason' => $request->reason ?? 'process_exited',
        ]);

        DB::table('user_bots')->where('id', $id)->update(['status' => 'idle']);

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $session->id,
            'event_type'  => $request->status === 'error' ? 'error' : 'stopped',
            'payload'     => json_encode(['reason' => $request->reason ?? 'process_exited']),
            'occurred_at' => now(),
        ]);

        Log::info("InternalBotController: session {$session->id} ended (status={$request->status}, reason={$request->reason}).");

        return response()->json([
            'success' => true,
            'message' => 'Session end recorded.',
        ], 200);
    }
}