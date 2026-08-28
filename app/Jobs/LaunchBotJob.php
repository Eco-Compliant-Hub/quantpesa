<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class LaunchBotJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected int $botId;
    protected int $sessionId;

    public function __construct(int $botId, int $sessionId)
    {
        $this->botId = $botId;
        $this->sessionId = $sessionId;
    }

    public function handle(): void
    {
        $bot = DB::table('user_bots')->where('id', $this->botId)->first();

        if (!$bot) {
            Log::error("LaunchBotJob: bot {$this->botId} not found.");
            return;
        }

        $account = DB::table('accounts')->where('id', $bot->account_id)->first();

        if (!$account) {
            Log::error("LaunchBotJob: account for bot {$this->botId} not found.");
            $this->markFailed();
            return;
        }

        $accountType = DB::table('account_types')->where('id', $account->account_type_id)->first();

        if (!$accountType) {
            Log::error("LaunchBotJob: account_type for bot {$this->botId} not found.");
            $this->markFailed();
            return;
        }

        if ($bot->source === 'xml_upload') {
            $config = DB::table('bot_xml_configs')->where('bot_id', $this->botId)->orderByDesc('id')->first();
        } else {
            $config = DB::table('bot_configurations')->where('bot_id', $this->botId)->orderByDesc('id')->first();
        }

        if (!$config) {
            Log::error("LaunchBotJob: no configuration for bot {$this->botId}.");
            $this->markFailed();
            return;
        }

        $symbol = DB::table('symbols')->where('id', $config->symbol_id)->first();
        if (!$symbol) {
            Log::error("LaunchBotJob: symbol not found for bot {$this->botId}.");
            $this->markFailed();
            return;
        }

        $apiToken = Crypt::decryptString($account->api_token_encrypted);
        $appId = config('services.deriv.app_id');
        $internalToken = config('app.internal_api_token');

        $runnerScript = base_path('bot_runtime/bot_engine/bot_runner.py');

        $process = new Process([
            'python',
            '-u',
            $runnerScript,
            '--bot-id', (string) $this->botId,
            '--session-id', (string) $this->sessionId,
            '--symbol', $symbol->symbol,
            '--api-token', $apiToken,
            '--app-id', $appId,
            '--broker-account-id', $account->broker_account_id,
            '--is-virtual', $accountType->is_virtual ? '1' : '0',
            '--internal-token', $internalToken,
            '--api-base-url', config('app.url'),
        ]);

        $logPath = storage_path("logs/bot_runner_{$this->sessionId}.log");

        // Redirect stdout+stderr to a log file at the shell level, since
        // Process::start()'s callback only fires while PHP is actively
        // pumping it (via wait()/isRunning()), which we deliberately never
        // do here -- this job must return immediately, not block on the
        // child process. Shell-level redirection works regardless.
        $command = $process->getCommandLine() . ' > ' . escapeshellarg($logPath) . ' 2>&1';

        $process = Process::fromShellCommandline($command, base_path('bot_runtime/bot_engine'));
        $process->start();
        $pid = $process->getPid();

       DB::table('bot_sessions')->where('id', $this->sessionId)->update([
            'process_id'          => $pid,
            'status'              => 'running',
            'symbol_id'           => $config->symbol_id,
            'contract_type_id'    => $config->contract_type_id ?? null,
            'initial_stake'       => $config->stake_per_trade,
            'stop_loss_amount'    => $config->stop_loss_amount,
            'take_profit_amount'  => $config->take_profit_amount,
            'bot_version'         => $bot->version,
            'bot_source'          => $bot->source,
        ]);

        Log::info("LaunchBotJob: bot {$this->botId} session {$this->sessionId} launched with PID {$pid}.");
    }

    protected function markFailed(): void
    {
        DB::table('bot_sessions')->where('id', $this->sessionId)->update([
            'status'      => 'error',
            'stopped_at'  => now(),
            'stop_reason' => 'launch_failed',
        ]);

        DB::table('user_bots')->where('id', $this->botId)->update(['status' => 'idle']);
    }
}
