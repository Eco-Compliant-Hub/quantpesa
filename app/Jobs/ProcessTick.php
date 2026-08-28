<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class ProcessTick implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public int $symbolId,
        public string $symbol,
        public float $price,
        public int $lastDigit
    ) {}

    public function handle(): void
    {
        DB::table('tick_stream')->insert([
            'symbol_id'  => $this->symbolId,
            'raw_price'  => $this->price,
            'last_digit' => $this->lastDigit,
            'source'     => 'deriv_ws',
        ]);

        DB::table('tick_buffer')->insert([
            'symbol_id' => $this->symbolId,
            'raw_price' => $this->price,
            'processed' => 0,
        ]);

        DB::table('symbol_status')->updateOrInsert(
            ['symbol_id' => $this->symbolId],
            [
                'current_price'    => $this->price,
                'last_digit'       => $this->lastDigit,
                'tick_count_today' => DB::raw('tick_count_today + 1'),
                'last_updated_at'  => now(),
            ]
        );
    }
}
