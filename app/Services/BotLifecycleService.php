<?php

namespace App\Services;

use App\Jobs\LaunchBotJob;
use Illuminate\Support\Facades\DB;

/**
 * Centralizes "start a bot" logic so BotController::start() (user, owns
 * the bot) and AdminController::startBot() (admin, any bot) can't drift
 * out of sync -- same validation, same session creation, same launch.
 * Callers are responsible for their own authorization check (ownership
 * for users, isAdmin() for admin) before calling this.
 */
class BotLifecycleService
{
    public function start(int $botId): array
    {
        $bot = DB::table('user_bots')->where('id', $botId)->first();

        if (!$bot) {
            return ['success' => false, 'message' => 'Bot not found.', 'code' => 404];
        }

        if ($bot->status === 'running') {
            return ['success' => false, 'message' => 'Bot is already running.', 'code' => 400];
        }

        if ($bot->source === 'xml_upload') {
            $config = DB::table('bot_xml_configs')->where('bot_id', $botId)->orderByDesc('id')->first();
            if (!$config) {
                return [
                    'success' => false,
                    'message' => 'This bot has no XML configuration yet. Set a symbol, stake, and stop-loss before starting.',
                    'code'    => 422,
                ];
            }
        } else {
            $config = DB::table('bot_configurations')->where('bot_id', $botId)->orderByDesc('id')->first();
            if (!$config) {
                return ['success' => false, 'message' => 'This bot has no configuration yet.', 'code' => 422];
            }
        }

        $sessionId = DB::table('bot_sessions')->insertGetId([
            'bot_id'           => $botId,
            'configuration_id' => $bot->source === 'xml_upload' ? null : $config->id,
            'status'           => 'idle',
            'control_command'  => 'none',
            'started_at'       => now(),
        ]);

        DB::table('user_bots')->where('id', $botId)->update(['status' => 'running']);

        DB::table('bot_events')->insert([
            'bot_id'      => $botId,
            'session_id'  => $sessionId,
            'event_type'  => 'started',
            'payload'     => json_encode(['configuration_id' => $config->id ?? null]),
            'occurred_at' => now(),
        ]);

        LaunchBotJob::dispatch($botId, $sessionId);

        $session = DB::table('bot_sessions')->where('id', $sessionId)->first();

        return ['success' => true, 'message' => 'Bot starting.', 'data' => $session, 'code' => 200];
    }
}