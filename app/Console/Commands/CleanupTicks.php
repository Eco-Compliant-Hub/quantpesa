<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CleanupTicks extends Command
{
    protected $signature   = 'deriv:cleanup-ticks';
    protected $description = 'Delete tick_stream and tick_buffer rows older than 24 hours (Clause 2.1 compliance)';

    public function handle()
    {
        $cutoff = now()->subHours(24);

        $streamDeleted = DB::table('tick_stream')
    ->where('received_at', '<', $cutoff)
    ->delete();

$bufferDeleted = DB::table('tick_buffer')
    ->where('received_at', '<', $cutoff)
    ->delete();

        $this->info('Tick cleanup complete.');
        $this->info('tick_stream rows deleted: ' . $streamDeleted);
        $this->info('tick_buffer rows deleted: ' . $bufferDeleted);

        // Log to app_logs
        DB::table('app_logs')->insert([
    'level'       => 'info',
    'message'     => 'Tick cleanup ran. stream=' . $streamDeleted . ' buffer=' . $bufferDeleted,
    'context'     => json_encode(['cutoff' => $cutoff->toDateTimeString()]),
    'occurred_at' => now(),
]);

    }
}