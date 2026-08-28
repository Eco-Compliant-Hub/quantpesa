<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

/**
 * Centralizes "actually stop the OS-level bot_runner.py process" logic
 * so BotController::stop() and AdminController::killBot() can't drift
 * out of sync with each other. Both need the same graceful-then-force
 * sequence: signal control_command, give the process a moment to exit
 * on its own, and force-kill by PID if it doesn't.
 */
class BotProcessManager
{
    private const GRACE_PERIOD_SECONDS = 0.8;
    private const POLL_INTERVAL_MICROSECONDS = 100000; // 100ms

    /**
     * Stop the given bot's active session (if any), gracefully first,
     * force-killing the OS process by PID if it doesn't exit in time.
     *
     * Returns an array: ['session' => object|null, 'graceful' => bool|null]
     * graceful is null when there was no active session to stop at all.
     */
    public function stopActiveSession(int $botId, string $stopReason): array
    {
        $session = DB::table('bot_sessions')
            ->where('bot_id', $botId)
            ->whereNull('stopped_at')
            ->orderByDesc('id')
            ->first();

        if (!$session) {
            return ['session' => null, 'graceful' => null];
        }

        // Signal graceful stop. bot_runner.py's loop checks control_command
        // each iteration and exits cleanly when it sees this.
        DB::table('bot_sessions')->where('id', $session->id)->update([
            'control_command' => 'stop',
        ]);

        $stoppedGracefully = false;
        $deadline = microtime(true) + self::GRACE_PERIOD_SECONDS;

        while (microtime(true) < $deadline) {
            usleep(self::POLL_INTERVAL_MICROSECONDS);
            $current = DB::table('bot_sessions')->where('id', $session->id)->first();
            if ($current->status === 'stopped') {
                $stoppedGracefully = true;
                break;
            }
        }

        if (!$stoppedGracefully) {
            $current = DB::table('bot_sessions')->where('id', $session->id)->first();
            if ($current->process_id) {
                $this->forceKillProcess($current->process_id);
            }
        }

        DB::table('bot_sessions')->where('id', $session->id)->update([
            'status'      => 'stopped',
            'stopped_at'  => now(),
            'stop_reason' => $stoppedGracefully ? $stopReason : 'force_killed',
        ]);

        return ['session' => $session, 'graceful' => $stoppedGracefully];
    }

    /**
     * Force-kill an OS process by PID. Windows uses taskkill /T (kills
     * the whole process tree -- required because LaunchBotJob spawns the
     * runner via a cmd.exe wrapper on Windows, so the stored PID belongs
     * to cmd.exe, not python.exe, and without /T the actual bot process
     * would be left running orphaned). Linux uses posix kill -9.
     */
    public function forceKillProcess(int $pid): void
    {
        if (PHP_OS_FAMILY === 'Windows') {
            $process = new Process(['taskkill', '/F', '/T', '/PID', (string) $pid]);
        } else {
            $process = new Process(['kill', '-9', (string) $pid]);
        }

        try {
            $process->run();
        } catch (\Throwable $e) {
            Log::warning("BotProcessManager::forceKillProcess: failed to kill PID {$pid}: " . $e->getMessage());
        }
    }
}