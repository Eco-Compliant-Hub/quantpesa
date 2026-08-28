<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ParseBotXmlJob;
use App\Services\PlanFeatureService;
use App\Services\RiskGuardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class BotController extends Controller
{
    // GET /api/bots/templates
    public function templates(Request $request, PlanFeatureService $planFeatures)
    {
        $userId = $request->user()->id;
        $hasPremiumAccess = $planFeatures->hasFeature($userId, 'premium_bots');

        $templates = DB::table('bot_templates')
            ->where('is_active', 1)
            ->select('id', 'name', 'description', 'strategy_type', 'risk_level', 'tier')
            ->get()
            ->map(function ($template) use ($hasPremiumAccess) {
                $template->locked = $template->tier === 'premium' && !$hasPremiumAccess;
                return $template;
            });

        return response()->json([
            'success' => true,
            'count'   => $templates->count(),
            'data'    => $templates,
        ], 200);
    }

    // POST /api/bots
    public function createBot(Request $request, PlanFeatureService $planFeatures)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'template_id' => 'required|integer|exists:bot_templates,id',
            'account_id'  => 'required|integer|exists:accounts,id',
            'bot_name'    => 'required|string|max:100',
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

       $template = DB::table('bot_templates')->where('id', $request->template_id)->first();

        // Server-side enforcement -- the catalog UI hides/locks premium
        // bots, but that's a UX convenience only. This is the real gate;
        // never trust the client to have honored the lock.
        if ($template && $template->tier === 'premium' && !$planFeatures->hasFeature($user->id, 'premium_bots')) {
            return response()->json([
                'success' => false,
                'message' => 'This bot requires a premium plan. Upgrade to unlock it.',
            ], 403);
        }

        $botId = DB::table('user_bots')->insertGetId([
            'user_id'     => $user->id,
            'template_id' => $request->template_id,
            'account_id'  => $request->account_id,
            'bot_name'    => $request->bot_name,
            'source'      => $template->source ?? null,
            'raw_xml'     => $template->raw_xml ?? null,
            'parsed_ast'  => $template->parsed_ast ?? null,
            'status'      => 'idle',
            'is_test_instance' => $request->boolean('is_test_instance'),
            'created_at'  => now(),
        ]);

        $bot = DB::table('user_bots')->where('id', $botId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Bot created.',
            'data'    => $bot,
        ], 201);
    }

    // POST /api/bots/upload-xml
    public function uploadXml(Request $request, PlanFeatureService $planFeatures)
    {
        $user = $request->user();

        if (!$planFeatures->hasFeature($user->id, 'custom_bot_upload')) {
            return response()->json([
                'success' => false,
                'message' => 'Uploading your own bots requires a premium plan. Upgrade to unlock this.',
            ], 403);
        }

        $validator = Validator::make($request->all(), [
            'account_id' => 'required|integer|exists:accounts,id',
            'bot_name'   => 'required|string|max:100',
            'xml_file'   => 'required|file|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $extension = strtolower($request->file('xml_file')->getClientOriginalExtension());
        if ($extension !== 'xml') {
            return response()->json([
                'success' => false,
                'errors'  => ['xml_file' => ['The xml file field must have a .xml extension.']],
            ], 422);
        }

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

        $rawXml = file_get_contents($request->file('xml_file')->getRealPath());
        
        libxml_use_internal_errors(true);
        $xmlObject = simplexml_load_string($rawXml);

        if ($xmlObject === false) {
            return response()->json([
                'success' => false,
                'message' => 'Uploaded file is not valid XML.',
            ], 422);
        }

        $botId = DB::table('user_bots')->insertGetId([
            'user_id'     => $user->id,
            'template_id' => null,
            'account_id'  => $request->account_id,
            'bot_name'    => $request->bot_name,
            'raw_xml'     => $rawXml,
            'parsed_ast'  => null,
            'source'      => 'xml_upload',
            'version'     => 1,
            'status'      => 'idle',
            'created_at'  => now(),
        ]);

        ParseBotXmlJob::dispatch($botId);

        $bot = DB::table('user_bots')->where('id', $botId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Bot XML uploaded. Parsing pending.',
            'data'    => $bot,
        ], 201);
    }


    // GET /api/bots
    public function myBots(Request $request)
    {
        $user = $request->user();

        $bots = DB::table('user_bots as ub')
            ->leftJoin('bot_templates as bt', 'bt.id', '=', 'ub.template_id')
            ->leftJoin('accounts as acc', 'acc.id', '=', 'ub.account_id')
            ->leftJoin('providers as p', 'p.id', '=', 'acc.provider_id')
            ->leftJoin('account_types as at', 'at.id', '=', 'acc.account_type_id')
            ->where('ub.user_id', $user->id)
            ->where('ub.is_test_instance', 0)
            ->select(
                'ub.id',
                'ub.bot_name',
                'ub.source',
                'ub.account_id',
                'bt.name as template_name',
                'bt.strategy_type',
                'bt.risk_level',
                'ub.status',
                'ub.created_at',
                'acc.broker_account_id',
                'acc.currency as account_currency',
                'p.name as provider_name',
                'at.name as account_type_name',
                'at.is_virtual as account_is_virtual'
            )
            ->orderByDesc('ub.id')
            ->get();

        return response()->json([
            'success' => true,
            'count'   => $bots->count(),
            'data'    => $bots,
        ], 200);
    }

    // GET /api/bots/{id}
    public function botDetail(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots as ub')
            ->leftJoin('bot_templates as bt', 'bt.id', '=', 'ub.template_id')
            ->leftJoin('accounts as acc', 'acc.id', '=', 'ub.account_id')
            ->leftJoin('providers as p', 'p.id', '=', 'acc.provider_id')
            ->leftJoin('account_types as at', 'at.id', '=', 'acc.account_type_id')
            ->where('ub.id', $id)
            ->where('ub.user_id', $user->id)
            ->select(
                'ub.*',
                'bt.name as template_name',
                'bt.strategy_type',
                'bt.risk_level',
                'acc.broker_account_id',
                'acc.currency as account_currency',
                'p.name as provider_name',
                'at.name as account_type_name',
                'at.is_virtual as account_is_virtual'
            )
            ->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->source === 'xml_upload') {
            $config = DB::table('bot_xml_configs')->where('bot_id', $id)->orderByDesc('id')->first();
        } else {
            $config = DB::table('bot_configurations')->where('bot_id', $id)->orderByDesc('id')->first();
        }

        $latestSession = DB::table('bot_sessions')->where('bot_id', $id)->orderByDesc('id')->first();

        return response()->json([
            'success'        => true,
            'bot'            => $bot,
            'configuration'  => $config,
            'latest_session' => $latestSession,
        ], 200);
    }

    // GET /api/bots/{id}/live
    // Execution feed for a bot: account context (unambiguous demo/real
    // labeling), current session totals, and the most recent individual
    // trades -- what the bot is actually doing right now.
    public function live(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots as ub')
            ->leftJoin('accounts as acc', 'acc.id', '=', 'ub.account_id')
            ->leftJoin('providers as p', 'p.id', '=', 'acc.provider_id')
            ->leftJoin('account_types as at', 'at.id', '=', 'acc.account_type_id')
            ->where('ub.id', $id)
            ->where('ub.user_id', $user->id)
            ->select(
                'ub.id',
                'ub.bot_name',
                'ub.status',
                'acc.broker_account_id',
                'acc.currency as account_currency',
                'p.name as provider_name',
                'at.name as account_type_name',
                'at.is_virtual as account_is_virtual'
            )
            ->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        $session = DB::table('bot_sessions')
            ->where('bot_id', $id)
            ->orderByDesc('id')
            ->first();

        $orders = [];
        if ($session) {
            $orders = DB::table('orders as o')
                ->leftJoin('symbols as s', 's.id', '=', 'o.symbol_id')
                ->leftJoin('contract_types as ct', 'ct.id', '=', 'o.contract_type_id')
                ->where('o.bot_session_id', $session->id)
                ->select(
                    'o.id',
                    's.symbol',
                    'ct.name as contract_type',
                    'o.stake',
                    'o.payout',
                    'o.status',
                    'o.created_at'
                )
                ->orderByDesc('o.id')
                ->limit(30)
                ->get();
        }

        return response()->json([
            'success' => true,
            'bot'     => $bot,
            'session' => $session,
            'orders'  => $orders,
        ], 200);
    }

    // POST /api/bots/{id}/configure
    public function configure(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots')->where('id', $id)->where('user_id', $user->id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->source === 'xml_upload') {
            return $this->configureXml($request, $bot);
        }

        return $this->configureNative($request, $bot);
    }

    protected function configureNative(Request $request, $bot)
    {
        $validator = Validator::make($request->all(), [
            'symbol_id'           => 'required|integer|exists:symbols,id',
            'contract_type_id'    => 'required|integer|exists:contract_types,id',
            'barrier_digit'       => 'nullable|integer|min:0|max:9',
            'entry_condition'     => 'nullable|string|max:100',
            'tick_duration'       => 'required|integer|min:1',
            'number_of_runs'      => 'nullable|integer|min:1',
            'stake_per_trade'     => 'required|numeric|min:0.01',
            'stop_loss_amount'    => 'required|numeric|min:0.01',
            'take_profit_amount'  => 'nullable|numeric|min:0.01',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $contractType = DB::table('contract_types')->where('id', $request->contract_type_id)->first();

        if ($contractType->requires_barrier && is_null($request->barrier_digit)) {
            return response()->json([
                'success' => false,
                'message' => 'This contract type requires a barrier_digit value.',
            ], 422);
        }

        $configId = DB::table('bot_configurations')->insertGetId([
            'bot_id'              => $bot->id,
            'symbol_id'           => $request->symbol_id,
            'contract_type_id'    => $request->contract_type_id,
            'barrier_digit'       => $request->barrier_digit,
            'entry_condition'     => $request->entry_condition ?? 'always',
            'tick_duration'       => $request->tick_duration,
            'number_of_runs'      => $request->number_of_runs,
            'stake_per_trade'     => $request->stake_per_trade,
            'stop_loss_amount'    => $request->stop_loss_amount,
            'take_profit_amount'  => $request->take_profit_amount,
            'created_at'          => now(),
        ]);

        $config = DB::table('bot_configurations')->where('id', $configId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Bot configured.',
            'data'    => $config,
        ], 201);
    }

    protected function configureXml(Request $request, $bot)
    {
        $validator = Validator::make($request->all(), [
            'symbol_id'           => 'required|integer|exists:symbols,id',
            'stake_per_trade'     => 'required|numeric|min:0.01',
            'stop_loss_amount'    => 'required|numeric|min:0.01',
            'take_profit_amount'  => 'nullable|numeric|min:0.01',
            'number_of_runs'      => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $configId = DB::table('bot_xml_configs')->insertGetId([
            'bot_id'              => $bot->id,
            'symbol_id'           => $request->symbol_id,
            'stake_per_trade'     => $request->stake_per_trade,
            'stop_loss_amount'    => $request->stop_loss_amount,
            'take_profit_amount'  => $request->take_profit_amount,
            'number_of_runs'      => $request->number_of_runs,
            'created_at'          => now(),
        ]);

        $config = DB::table('bot_xml_configs')->where('id', $configId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Bot XML config set.',
            'data'    => $config,
        ], 201);
    }

    // POST /api/bots/{id}/start
    public function start(Request $request, $id, RiskGuardService $riskGuard)
    {
        $user = $request->user();

        $bot = DB::table('user_bots')->where('id', $id)->where('user_id', $user->id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->status === 'running') {
            return response()->json([
                'success' => false,
                'message' => 'Bot is already running.',
            ], 400);
        }

        if ($bot->source === 'xml_upload') {
            $config = DB::table('bot_xml_configs')->where('bot_id', $id)->orderByDesc('id')->first();

            if (!$config) {
                return response()->json([
                    'success' => false,
                    'message' => 'This bot has no XML configuration yet. Set a symbol, stake, and stop-loss before starting.',
                ], 422);
            }
        } else {
            $config = DB::table('bot_configurations')->where('bot_id', $id)->orderByDesc('id')->first();

            if (!$config) {
                return response()->json([
                    'success' => false,
                    'message' => 'This bot has no configuration yet.',
                ], 422);
            }
        }

        // Confirm the trading account still belongs to this user. account_id
        // is only ever set when a bot is created or XML-uploaded (both of
        // those paths already check ownership), so this should always pass.
        // It's here as an explicit, visible check at the point of execution
        // rather than an assumption about how account_id got here -- if that
        // lookup ever comes back empty, the launch is blocked outright
        // instead of silently skipping the Risk Guard check below.
        $account = \App\Models\Account::where('id', $bot->account_id)
            ->where('user_id', $user->id)
            ->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Trading account not found or does not belong to you.',
            ], 403);
        }

        // If an analysis context was supplied, confirm it belongs to this
        // user before binding it to the session -- same ownership pattern
        // TradingController::placeOrder() already uses for orders. A
        // context id from someone else's session should never silently
        // attach to a bot run.
        $analysisContextId = null;
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

            $analysisContextId = $request->analysis_context_id;
        }

        // Risk Guard gate -- check exposure before this bot is allowed to
        // launch. If it would push the account into orange/red zone, the
        // frontend must send confirm_risk=true (after showing the user
        // the projected exposure) to proceed anyway.
        $evaluation = $riskGuard->evaluateProposedTrade($account, (float) $config->stake_per_trade);

        if ($evaluation['requires_confirmation'] && !$request->boolean('confirm_risk')) {
            return response()->json([
                'success'             => false,
                'needs_confirmation'  => true,
                'message'             => 'This bot launch would push account exposure into the ' . $evaluation['projected_zone'] . ' zone.',
                'evaluation'          => $evaluation,
            ], 409);
        }

        $sessionId = DB::table('bot_sessions')->insertGetId([
            'bot_id'              => $id,
            'configuration_id'    => $bot->source === 'xml_upload' ? null : $config->id,
            'analysis_context_id' => $analysisContextId,
            'status'              => 'idle',
            'control_command'     => 'none',
            'started_at'          => now(),
        ]);

        DB::table('user_bots')->where('id', $id)->update(['status' => 'running']);

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $sessionId,
            'event_type'  => 'started',
            'payload'     => json_encode([
                'configuration_id'    => $config->id ?? null,
                'analysis_context_id' => $analysisContextId,
            ]),
            'occurred_at' => now(),
        ]);

        \App\Jobs\LaunchBotJob::dispatch($id, $sessionId);

        $session = DB::table('bot_sessions')->where('id', $sessionId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Bot starting.',
            'data'    => $session,
        ], 200);
    }

    // POST /api/bots/{id}/stop
    public function stop(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots')->where('id', $id)->where('user_id', $user->id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->status !== 'running' && $bot->status !== 'paused') {
            return response()->json([
                'success' => false,
                'message' => 'Bot is not currently running or paused.',
            ], 400);
        }

        $session = DB::table('bot_sessions')
            ->where('bot_id', $id)
            ->whereNull('stopped_at')
            ->orderByDesc('id')
            ->first();

        if (!$session) {
            DB::table('user_bots')->where('id', $id)->update(['status' => 'idle']);

            return response()->json([
                'success' => true,
                'message' => 'Bot stopped (no active session found).',
            ], 200);
        }

        // Signal graceful stop. bot_runner.py's loop is expected to check
        // control_command each iteration and exit cleanly when it sees this.
        DB::table('bot_sessions')->where('id', $session->id)->update([
            'control_command' => 'stop',
        ]);

        $stopReason = 'user_requested';
        $stoppedGracefully = false;

        // Poll briefly for the process to notice and exit on its own.
        $deadline = microtime(true) + 0.8; // 800ms budget
        while (microtime(true) < $deadline) {
            usleep(100000); // 100ms
            $current = DB::table('bot_sessions')->where('id', $session->id)->first();
            if ($current->status === 'stopped') {
                $stoppedGracefully = true;
                break;
            }
        }

        if (!$stoppedGracefully) {
            // Escalate: force-kill the OS process directly via its stored PID.
            $current = DB::table('bot_sessions')->where('id', $session->id)->first();
            if ($current->process_id) {
                $this->forceKillProcess($current->process_id);
            }
            $stopReason = 'force_killed';
        }

        DB::table('bot_sessions')->where('id', $session->id)->update([
            'status'      => 'stopped',
            'stopped_at'  => now(),
            'stop_reason' => $stopReason,
        ]);

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $session->id,
            'event_type'  => 'stopped',
            'payload'     => json_encode(['reason' => $stopReason]),
            'occurred_at' => now(),
        ]);

        DB::table('user_bots')->where('id', $id)->update(['status' => 'idle']);

        return response()->json([
            'success' => true,
            'message' => 'Bot stopped.',
            'graceful' => $stoppedGracefully,
        ], 200);
    }

    // Force-kill an OS process by PID. Windows uses taskkill; Linux uses
    // posix kill via Symfony Process for portability across dev/production.
    protected function forceKillProcess(int $pid): void
    {
        if (PHP_OS_FAMILY === 'Windows') {
            // /T kills the whole process tree, not just the given PID.
            // Required because LaunchBotJob starts the runner via
            // Process::fromShellCommandline() (for stdout/stderr
            // redirection), which on Windows spawns a cmd.exe wrapper --
            // the PID stored in bot_sessions.process_id is cmd.exe's, not
            // python.exe's. Without /T, this kills only the cmd.exe shell
            // and leaves the actual bot process (python.exe, holding the
            // Deriv WebSocket and placing trades) running orphaned while
            // the DB incorrectly shows status=stopped.
            $process = new \Symfony\Component\Process\Process(['taskkill', '/F', '/T', '/PID', (string) $pid]);
        } else {
            $process = new \Symfony\Component\Process\Process(['kill', '-9', (string) $pid]);
        }

        try {
            $process->run();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning("forceKillProcess: failed to kill PID {$pid}: " . $e->getMessage());
        }
    
    }

    // POST /api/bots/{id}/pause
    public function pause(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots')->where('id', $id)->where('user_id', $user->id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->status !== 'running') {
            return response()->json([
                'success' => false,
                'message' => 'Bot is not currently running, so it cannot be paused.',
            ], 400);
        }

        $session = DB::table('bot_sessions')
            ->where('bot_id', $id)
            ->whereNull('stopped_at')
            ->orderByDesc('id')
            ->first();

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'No active session found to pause.',
            ], 422);
        }

        DB::table('bot_sessions')->where('id', $session->id)->update([
            'control_command' => 'pause',
        ]);

        DB::table('user_bots')->where('id', $id)->update(['status' => 'paused']);

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $session->id,
            'event_type'  => 'paused',
            'payload'     => null,
            'occurred_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Bot paused. Session remains active.',
        ], 200);
    }

    // POST /api/bots/{id}/resume
    public function resume(Request $request, $id)
    {
        $user = $request->user();

        $bot = DB::table('user_bots')->where('id', $id)->where('user_id', $user->id)->first();

        if (!$bot) {
            return response()->json([
                'success' => false,
                'message' => 'Bot not found.',
            ], 404);
        }

        if ($bot->status !== 'paused') {
            return response()->json([
                'success' => false,
                'message' => 'Bot is not currently paused, so it cannot be resumed.',
            ], 400);
        }

        $session = DB::table('bot_sessions')
            ->where('bot_id', $id)
            ->whereNull('stopped_at')
            ->orderByDesc('id')
            ->first();

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'No active session found to resume. Start a new session instead.',
            ], 422);
        }

        DB::table('bot_sessions')->where('id', $session->id)->update([
            'control_command' => 'none',
        ]);

        DB::table('user_bots')->where('id', $id)->update(['status' => 'running']);

        DB::table('bot_events')->insert([
            'bot_id'      => $id,
            'session_id'  => $session->id,
            'event_type'  => 'resumed',
            'payload'     => null,
            'occurred_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Bot resumed.',
        ], 200);
    }
}