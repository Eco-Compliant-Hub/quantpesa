<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

class DerivStreamManager extends Command
{
    protected $signature   = 'deriv:stream-manager';
    protected $description = 'Spawn one independent deriv:tick-stream process per active symbol';

    public function handle()
    {
        $symbols = DB::table('symbols')->where('is_active', 1)->pluck('symbol');

        if ($symbols->isEmpty()) {
            $this->error('No active symbols found.');
            return;
        }

        $this->info('Launching ' . $symbols->count() . ' independent tick-stream processes...');

        $processes = [];
        $phpBinary = PHP_BINARY;
        $artisanPath = base_path('artisan');

        foreach ($symbols as $symbol) {
            $process = new Process([
                $phpBinary,
                $artisanPath,
                'deriv:tick-stream',
                '--symbol=' . $symbol,
            ]);
            $process->setTimeout(null);
            $process->start(function ($type, $buffer) use ($symbol) {
                foreach (explode(PHP_EOL, trim($buffer)) as $line) {
                    if (trim($line) !== '') {
                        echo $line . PHP_EOL;
                    }
                }
            });
            $processes[$symbol] = $process;

            // Small stagger so all 18 don't hit Deriv's connection
            // handshake in the exact same instant
            usleep(150000);
        }

        $this->info('All ' . count($processes) . ' processes launched. Press Ctrl+C to stop all.');

        // Keep the parent process alive, watch for any child that died
        // unexpectedly and restart it -- this is the supervision part.
        while (true) {
            sleep(5);
            foreach ($processes as $symbol => $process) {
                if (!$process->isRunning()) {
                    $this->error('[' . $symbol . '] process died, restarting...');
                    $newProcess = new Process([
                        $phpBinary,
                        $artisanPath,
                        'deriv:tick-stream',
                        '--symbol=' . $symbol,
                    ]);
                    $newProcess->setTimeout(null);
                    $newProcess->start(function ($type, $buffer) use ($symbol) {
                        foreach (explode(PHP_EOL, trim($buffer)) as $line) {
                            if (trim($line) !== '') {
                                echo $line . PHP_EOL;
                            }
                        }
                    });
                    $processes[$symbol] = $newProcess;
                }
            }
        }
    }
}
