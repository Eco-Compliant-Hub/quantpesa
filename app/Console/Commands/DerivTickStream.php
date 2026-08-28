<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use WebSocket\Client;

class DerivTickStream extends Command
{
    protected $signature = 'deriv:tick-stream {--symbol= : Stream only this one symbol}';
    protected $description = 'Connect to Deriv WebSocket and stream tick data';

    public function handle()
    {
        $onlySymbol = $this->option('symbol');

        $query = DB::table('symbols')->where('is_active', 1);

        if ($onlySymbol) {
            $query->where('symbol', $onlySymbol);
        }

        $symbols = $query->get();

        if ($symbols->isEmpty()) {
            $this->error('No active symbols found.');
            return self::FAILURE;
        }

        // Cache symbol_id lookups once.
        $symbolMap = [];

        foreach ($symbols as $s) {
            $symbolMap[$s->symbol] = $s->id;
        }

        $caFile = 'C:\\xampp\\apache\\bin\\cacert.pem';

        if (!is_file($caFile)) {
            $this->error("CA bundle not found: {$caFile}");
            return self::FAILURE;
        }

        $this->info("CA bundle: {$caFile}");

$context = stream_context_create([
            'ssl' => [
                'verify_peer'       => true,
                'verify_peer_name'  => true,
                'allow_self_signed' => false,
                'cafile'            => $caFile,
            ],
        ]);

        $client = new Client(
            'wss://api.derivws.com/trading/v1/options/ws/public',
            [
                'timeout' => 60,

                'headers' => [
                    'Deriv-App-ID' => env('DERIV_APP_ID', '1089'),
                ],

                'context' => $context,
            ]
        );

        $this->info(
            'Connected. Subscribing to ' .
            $symbols->count() .
            ' symbol(s)...'
        );

        foreach ($symbols as $symbol) {
            $client->send(json_encode([
                'ticks'     => $symbol->symbol,
                'subscribe' => 1,
            ]));

            $this->line("Subscribed: {$symbol->symbol}");
        }

        $this->info('Streaming ticks. Press Ctrl+C to stop.');

        $tickCounts = [];

        while (true) {
            try {
                $message = $client->receive();

                if (!$message) {
                    continue;
                }

                $data = json_decode($message, true);

                if (!is_array($data)) {
                    continue;
                }

                /*
                 * Ignore non-tick messages:
                 * authorize, subscription confirmations,
                 * errors, etc.
                 */
                if (!isset($data['tick']) || !is_array($data['tick'])) {
                    continue;
                }

                $tick = $data['tick'];

                if (
                    !isset($tick['symbol']) ||
                    !isset($tick['quote'])
                ) {
                    continue;
                }

                $symbol = $tick['symbol'];
                $symbolId = $symbolMap[$symbol] ?? null;

                if (!$symbolId) {
                    continue;
                }

                $price = (float) $tick['quote'];

                /*
                 * pip_size is supplied by Deriv on tick responses
                 * when available. Do not assume every symbol has
                 * five decimal places.
                 */
                $decimals = isset($tick['pip_size'])
                    ? (int) $tick['pip_size']
                    : 2;

                $formattedPrice = number_format(
                    $price,
                    $decimals,
                    '.',
                    ''
                );

                $lastDigit = (int) substr(
                    str_replace('.', '', $formattedPrice),
                    -1
                );

                if (!isset($tickCounts[$symbolId])) {
                    $tickCounts[$symbolId] = 0;
                }

                $tickCounts[$symbolId]++;

                /*
                 * IMPORTANT:
                 * This proves that the Deriv WebSocket is actually
                 * receiving ticks before we involve Reverb, queues,
                 * or the browser.
                 */
                $this->line(
                    sprintf(
                        '[TICK] %s | price=%s | digit=%d | #%d',
                        $symbol,
                        $formattedPrice,
                        $lastDigit,
                        $tickCounts[$symbolId]
                    )
                );

                /*
                 * Broadcast immediately.
                 */
                try {
                     event(new \App\Events\TickReceived(
                    $symbol,
                    $price,
                    $lastDigit,
                    $tickCounts[$symbolId],
                    $decimals
                ));
                } catch (\Throwable $broadcastError) {
                    $this->error(
                        '[broadcast failed] ' .
                        $broadcastError->getMessage()
                    );
                }

                /*
                 * Queue downstream tick processing.
                 */
                try {
                    \App\Jobs\ProcessTick::dispatch(
                        $symbolId,
                        $symbol,
                        $price,
                        $lastDigit
                    );
                } catch (\Throwable $queueError) {
                    $this->error(
                        '[queue failed] ' .
                        $queueError->getMessage()
                    );
                }

            } catch (\Throwable $e) {
                $this->error(
                    '[stream error] ' .
                    $e->getMessage()
                );

                /*
                 * Do not silently continue forever on a broken
                 * WebSocket connection. Exit so the supervisor/
                 * process manager can restart it.
                 */
                break;
            }
        }

        try {
            $client->close();
        } catch (\Throwable $e) {
            // Connection already closed.
        }

        $this->warn('WebSocket connection closed.');

        return self::FAILURE;
    }
}