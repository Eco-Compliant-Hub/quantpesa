<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    // ─────────────────────────────────────────
    // HELPER — Admin check
    // ─────────────────────────────────────────
    private function isAdmin(Request $request)
    {
        return $request->user()->status === 'admin';
    }

    // ─────────────────────────────────────────
    // ALL USERS
    // ─────────────────────────────────────────
    public function users(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $users = DB::table('users')
            ->orderByDesc('created_at')
            ->get(['id', 'email', 'status', 'email_verified', 'created_at', 'last_login_at']);

        return response()->json(['success' => true, 'users' => $users]);
    }

    // ─────────────────────────────────────────
    // BAN A USER
    // ─────────────────────────────────────────
    public function ban(Request $request, $userId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        DB::table('users')->where('id', $userId)->update(['status' => 'banned']);

        return response()->json(['success' => true, 'message' => 'User banned.']);
    }

    // ─────────────────────────────────────────
    // UNBAN A USER
    // ─────────────────────────────────────────
    public function unban(Request $request, $userId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        DB::table('users')->where('id', $userId)->update(['status' => 'active']);

        return response()->json(['success' => true, 'message' => 'User unbanned.']);
    }

    // ─────────────────────────────────────────
    // SUSPEND USER + REVOKE TOKENS + KILL BOTS
    // ─────────────────────────────────────────
    public function suspend(Request $request, $userId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        // Suspend user
        DB::table('users')->where('id', $userId)->update(['status' => 'suspended']);

        // Revoke all tokens
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', 'App\\Models\\User')
            ->delete();

        // Kill all their bots
        DB::table('user_bots')
            ->where('user_id', $userId)
            ->whereIn('status', ['running', 'paused'])
            ->update(['status' => 'killed']);

        return response()->json([
            'success' => true,
            'message' => 'User suspended, tokens revoked, bots killed.',
        ]);
    }

    // ─────────────────────────────────────────
    // VERIFY A SIGNAL PROVIDER
    // ─────────────────────────────────────────
    public function verifyProvider(Request $request, $providerId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $exists = DB::table('strategy_providers')->where('user_id', $providerId)->exists();

        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Provider not found.'], 404);
        }

        DB::table('strategy_providers')->where('user_id', $providerId)->update(['verified' => 1]);

        return response()->json(['success' => true, 'message' => 'Provider verified.']);
    }

    // ─────────────────────────────────────────
    // ALL ORDERS
    // ─────────────────────────────────────────
    public function orders(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $orders = DB::table('orders')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get(['id', 'user_id', 'account_id', 'symbol_id', 'stake', 'status', 'payout', 'created_at']);

        return response()->json(['success' => true, 'orders' => $orders]);
    }

    // ─────────────────────────────────────────
    // ALL BOTS — every status, every user (full admin visibility)
    // ─────────────────────────────────────────
    public function bots(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $query = DB::table('user_bots as ub')
            ->leftJoin('users as u', 'u.id', '=', 'ub.user_id')
            ->orderByDesc('ub.created_at');

        if ($request->filled('status')) {
            $query->where('ub.status', $request->status);
        }

        $bots = $query->get([
            'ub.id', 'ub.user_id', 'u.email as user_email', 'ub.bot_name',
            'ub.status', 'ub.account_id', 'ub.source', 'ub.is_test_instance', 'ub.created_at',
        ]);

        return response()->json(['success' => true, 'bots' => $bots]);
    }

    // ─────────────────────────────────────────
    // FORCE KILL A SPECIFIC BOT
    // ─────────────────────────────────────────
    public function killBot(Request $request, $botId, \App\Services\BotProcessManager $processManager)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $bot = DB::table('user_bots')->where('id', $botId)->first();

        if (!$bot) {
            return response()->json(['success' => false, 'message' => 'Bot not found.'], 404);
        }

        $result = $processManager->stopActiveSession($botId, 'admin_force_killed');

        if ($result['session']) {
            DB::table('bot_events')->insert([
                'bot_id'      => $botId,
                'session_id'  => $result['session']->id,
                'event_type'  => 'killed',
                'payload'     => json_encode([
                    'reason'   => $result['graceful'] ? 'admin_force_killed' : 'force_killed',
                    'admin_id' => $request->user()->id,
                ]),
                'occurred_at' => now(),
            ]);
        }

        // Restore to idle, same terminal state a normal stop() lands on --
        // 'killed' was a dead-end status the UI had no recovery path for.
        DB::table('user_bots')->where('id', $botId)->update(['status' => 'idle']);

        return response()->json([
            'success' => true,
            'message' => 'Bot force-stopped by admin. Status reset to idle.',
            'graceful' => $result['graceful'],
        ]);
    }

    // ─────────────────────────────────────────
    // ADMIN START — preview what starting this bot will actually do,
    // before committing. Shows owner, account (real/demo, currency,
    // balance), and the saved trade config (stake/SL/TP/symbol).
    // ─────────────────────────────────────────
    public function startPreview(Request $request, $botId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $bot = DB::table('user_bots as ub')
            ->leftJoin('users as u', 'u.id', '=', 'ub.user_id')
            ->where('ub.id', $botId)
            ->select('ub.*', 'u.email as owner_email')
            ->first();

        if (!$bot) {
            return response()->json(['success' => false, 'message' => 'Bot not found.'], 404);
        }

        $account = DB::table('accounts as a')
            ->leftJoin('providers as p', 'p.id', '=', 'a.provider_id')
            ->leftJoin('account_types as at', 'at.id', '=', 'a.account_type_id')
            ->where('a.id', $bot->account_id)
            ->select('p.name as provider', 'at.name as account_type_name', 'at.is_virtual',
                      'a.currency', 'a.balance_cache', 'a.connection_status')
            ->first();

        if ($bot->source === 'xml_upload') {
            $config = DB::table('bot_xml_configs')->where('bot_id', $botId)->orderByDesc('id')->first();
        } else {
            $config = DB::table('bot_configurations')->where('bot_id', $botId)->orderByDesc('id')->first();
        }

        if (!$config) {
            return response()->json([
                'success' => false,
                'message' => 'This bot has no saved configuration -- cannot start.',
            ], 422);
        }

        $symbol = DB::table('symbols')->where('id', $config->symbol_id)->first(['symbol', 'display_name']);

        return response()->json([
            'success' => true,
            'data' => [
                'owner_email'       => $bot->owner_email,
                'bot_name'          => $bot->bot_name,
                'provider'          => $account->provider ?? null,
                'account_type'      => $account->account_type_name ?? null,
                'is_virtual'        => (bool) ($account->is_virtual ?? false),
                'currency'          => $account->currency ?? null,
                'balance'           => $account->balance_cache ?? null,
                'connection_status' => $account->connection_status ?? null,
                'symbol'            => $symbol->display_name ?? $symbol->symbol ?? null,
                'stake_per_trade'   => $config->stake_per_trade,
                'stop_loss_amount'  => $config->stop_loss_amount,
                'take_profit_amount' => $config->take_profit_amount,
            ],
        ]);
    }

    // ─────────────────────────────────────────
    // ADMIN START — start any user's bot, ownership not required
    // ─────────────────────────────────────────
    public function startBot(Request $request, $botId, \App\Services\BotLifecycleService $lifecycle)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $result = $lifecycle->start((int) $botId);

        if ($result['success']) {
            DB::table('bot_events')->insert([
                'bot_id'      => $botId,
                'session_id'  => $result['data']->id,
                'event_type'  => 'admin_started',
                'payload'     => json_encode(['admin_id' => $request->user()->id]),
                'occurred_at' => now(),
            ]);
        }

        return response()->json([
            'success' => $result['success'],
            'message' => $result['message'],
            'data'    => $result['data'] ?? null,
        ], $result['code']);
    }

    // ─────────────────────────────────────────
    // PLATFORM STATS
    // ─────────────────────────────────────────
    public function stats(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'success' => true,
            'stats'   => [
                'total_users'        => DB::table('users')->count(),
                'banned_users'       => DB::table('users')->where('status', 'banned')->count(),
                'suspended_users'    => DB::table('users')->where('status', 'suspended')->count(),
                'total_orders'       => DB::table('orders')->count(),
                'total_providers'    => DB::table('strategy_providers')->count(),
                'verified_providers' => DB::table('strategy_providers')->where('verified', 1)->count(),
                'active_follows'     => DB::table('copy_relationships')->where('is_active', 1)->count(),
                'running_bots'       => DB::table('user_bots')->where('status', 'running')->count(),
            ],
        ]);
    }

    // ─────────────────────────────────────────
    // GET ALL FEATURE FLAGS
    // ─────────────────────────────────────────
    public function getSettings(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $settings = DB::table('settings')->get(['key', 'value', 'description']);

        return response()->json(['success' => true, 'settings' => $settings]);
    }

    // ─────────────────────────────────────────
    // TOGGLE A FEATURE FLAG / KILL SWITCH
    // ─────────────────────────────────────────
    public function updateSetting(Request $request, $key)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'value' => 'required|string',
        ]);

        $exists = DB::table('settings')->where('key', $key)->exists();

        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Setting not found.'], 404);
        }

        DB::table('settings')->where('key', $key)->update([
            'value'      => $request->value,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Setting '{$key}' updated to '{$request->value}'.",
        ]);
    }
    // ─────────────────────────────────────────
    // BOT CATALOG — LIST ALL TEMPLATES (any status)
    // ─────────────────────────────────────────
    public function listBotTemplates(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $templates = DB::table('bot_templates')
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'description', 'strategy_type', 'risk_level', 'tier',
                   'source', 'status', 'is_active', 'created_by', 'created_at']);

        return response()->json(['success' => true, 'templates' => $templates]);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — UPLOAD NEW TEMPLATE (draft)
    // ─────────────────────────────────────────
    public function uploadBotTemplate(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'name'          => 'nullable|string|max:100',
            'description'   => 'nullable|string|max:1000',
            'strategy_type' => 'nullable|string|max:100',
            'risk_level'    => 'nullable|string|max:50',
            'tier'          => 'nullable|in:free,premium',
            'xml_file'      => 'required|file|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $extension = strtolower($request->file('xml_file')->getClientOriginalExtension());
        if ($extension !== 'xml') {
            return response()->json([
                'success' => false,
                'errors'  => ['xml_file' => ['The xml file field must have a .xml extension.']],
            ], 422);
        }

        $rawXml = file_get_contents($request->file('xml_file')->getRealPath());

        libxml_use_internal_errors(true);
        $xmlObject = simplexml_load_string($rawXml);

        if ($xmlObject === false) {
            return response()->json(['success' => false, 'message' => 'Uploaded file is not valid XML.'], 422);
        }

        // "Check the template" -- valid XML isn't the same as a valid Deriv
        // strategy. Every real Bot Builder export roots its trade
        // parameters in a trade_definition block (same root xml_parser.py
        // looks for). Reject early with a clear message rather than saving
        // a template that fails silently the first time someone runs it.
        $hasTradeDefinition = count($xmlObject->xpath('//*[local-name()="block"][@type="trade_definition"]')) > 0;

        if (!$hasTradeDefinition) {
            return response()->json([
                'success' => false,
                'message' => 'This file doesn\'t look like a Deriv Bot Builder strategy -- no trade_definition block found.',
            ], 422);
        }

        // Pick the name up from the file itself instead of making the admin
        // retype it -- falls back to the original filename (sans extension,
        // underscores/dashes turned into spaces, title-cased) whenever the
        // name field is left blank.
        $templateName = $request->filled('name')
            ? $request->name
            : $this->nameFromFilename($request->file('xml_file')->getClientOriginalName());

        $templateId = DB::table('bot_templates')->insertGetId([
            'name'          => $templateName,
            'description'   => $request->description,
            'strategy_type' => $request->strategy_type,
            'risk_level'    => $request->risk_level,
            'tier'          => $request->tier ?? 'free',
            'raw_xml'       => $rawXml,
            'parsed_ast'    => null, // parsed the same async way user uploads are, see note below
            'source'        => 'xml_upload',
            'status'        => 'draft',
            'is_active'     => 0,
            'created_by'    => $request->user()->id,
            'created_at'    => now(),
        ]);

        // Mirrors ParseBotXmlJob's existing, proven pattern for user
        // uploads -- same xml_parser.py, same temp-file handoff, same
        // JSON validation -- just pointed at bot_templates.
        \App\Jobs\ParseBotTemplateXmlJob::dispatch($templateId);

        $template = DB::table('bot_templates')->where('id', $templateId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Template uploaded as draft.',
            'data'    => $template,
        ], 201);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — TEST RUN (real user_bots instance, hidden from admin's own My Bots)
    // ─────────────────────────────────────────
    public function testRunBotTemplate(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'account_id' => 'required|integer|exists:accounts,id',
            'bot_name'   => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $user = $request->user();

        $template = DB::table('bot_templates')->where('id', $templateId)->first();
        if (!$template) {
            return response()->json(['success' => false, 'message' => 'Template not found.'], 404);
        }

        // Admin must own the account being used to test, same rule as any user.
        $account = DB::table('accounts')
            ->where('id', $request->account_id)
            ->where('user_id', $user->id)
            ->first();

        if (!$account) {
            return response()->json(['success' => false, 'message' => 'Account not found or does not belong to you.'], 403);
        }

        $botId = DB::table('user_bots')->insertGetId([
            'user_id'           => $user->id,
            'template_id'       => $templateId,
            'account_id'        => $request->account_id,
            'bot_name'          => $request->bot_name ?: "[TEST] {$template->name}",
            'source'            => $template->source,
            'raw_xml'           => $template->raw_xml,
            'parsed_ast'        => $template->parsed_ast,
            'status'            => 'idle',
            'is_test_instance'  => 1,
            'created_at'        => now(),
        ]);

        // First test run moves a draft template to 'tested'. Doesn't
        // downgrade a template that's already deployed/retracted.
        if ($template->status === 'draft') {
            DB::table('bot_templates')->where('id', $templateId)->update(['status' => 'tested']);
        }

        $bot = DB::table('user_bots')->where('id', $botId)->first();

        return response()->json([
            'success' => true,
            'message' => 'Test instance created. Configure and start it like any other bot.',
            'data'    => $bot,
        ], 201);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — LIST TEST INSTANCES FOR A TEMPLATE
    // ─────────────────────────────────────────
    public function listTemplateTestRuns(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $runs = DB::table('user_bots')
            ->where('template_id', $templateId)
            ->where('is_test_instance', 1)
            ->orderByDesc('created_at')
            ->get(['id', 'bot_name', 'status', 'account_id', 'created_at']);

        return response()->json(['success' => true, 'runs' => $runs]);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — CHANGE TIER (free <-> premium) without re-uploading
    // ─────────────────────────────────────────
    public function updateBotTemplateTier(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $request->validate(['tier' => 'required|in:free,premium']);

        $exists = DB::table('bot_templates')->where('id', $templateId)->exists();
        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Template not found.'], 404);
        }

        DB::table('bot_templates')->where('id', $templateId)->update(['tier' => $request->tier]);

        return response()->json(['success' => true, 'message' => "Tier updated to {$request->tier}."]);
    }


    // ─────────────────────────────────────────
    // BOT CATALOG — DEPLOY (goes live in public catalog)
    // ─────────────────────────────────────────
    public function deployBotTemplate(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $exists = DB::table('bot_templates')->where('id', $templateId)->exists();
        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Template not found.'], 404);
        }

        DB::table('bot_templates')->where('id', $templateId)->update([
            'status'    => 'deployed',
            'is_active' => 1,
        ]);

        return response()->json(['success' => true, 'message' => 'Template deployed to public catalog.']);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — RETRACT (hide from public, admin keeps access)
    // ─────────────────────────────────────────
    public function retractBotTemplate(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $exists = DB::table('bot_templates')->where('id', $templateId)->exists();
        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Template not found.'], 404);
        }

        DB::table('bot_templates')->where('id', $templateId)->update([
            'status'    => 'retracted',
            'is_active' => 0,
        ]);

        return response()->json(['success' => true, 'message' => 'Template retracted from public catalog.']);
    }

    // ─────────────────────────────────────────
    // BOT CATALOG — DELETE (blocked if in real use, unless forced)
    // ─────────────────────────────────────────
    public function deleteBotTemplate(Request $request, $templateId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $template = DB::table('bot_templates')->where('id', $templateId)->first();
        if (!$template) {
            return response()->json(['success' => false, 'message' => 'Template not found.'], 404);
        }

        $force = $request->boolean('force');

        $realUsageCount = DB::table('user_bots')
            ->where('template_id', $templateId)
            ->where('is_test_instance', 0)
            ->count();

        if ($realUsageCount > 0 && !$force) {
            return response()->json([
                'success' => false,
                'message' => "This template is used by {$realUsageCount} real user bot(s). " .
                              "Retract it instead, or pass force=true to delete anyway.",
                'real_usage_count' => $realUsageCount,
            ], 409);
        }

        // Test instances are never real trading history -- always safe to clean up.
        DB::table('user_bots')->where('template_id', $templateId)->where('is_test_instance', 1)->delete();

        if ($force) {
            // Orphan real bots' template reference rather than cascade-deleting
            // someone's actual trading history.
            DB::table('user_bots')->where('template_id', $templateId)->update(['template_id' => null]);
        }

        DB::table('bot_templates')->where('id', $templateId)->delete();

        return response()->json(['success' => true, 'message' => 'Template deleted.']);
    }

    // Turns "under7_over3_recovery_v2.xml" into "Under7 Over3 Recovery V2"
    // so an admin never has to retype what's already in the filename.
    private function nameFromFilename(string $originalFilename): string
    {
        $base = pathinfo($originalFilename, PATHINFO_FILENAME);
        $spaced = str_replace(['_', '-'], ' ', $base);
        return ucwords(trim($spaced));
    }
}