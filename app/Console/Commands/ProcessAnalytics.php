<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ProcessAnalytics extends Command
{
    protected $signature   = 'analytics:process';
    protected $description = 'Process tick buffer and calculate analytics';

    /**
     * Minimum number of new ticks required since the last processed tick
     * before a symbol is reprocessed at all. This is the primary defense
     * against reprocessing the same ~1000-tick window on every invocation.
     */
    private const MIN_NEW_TICKS_TO_PROCESS = 10;

    public function handle()
    {
        $this->info('Starting analytics processing...');

        $symbols = DB::table('symbols')->where('is_active', 1)->get();
        $windows = DB::table('window_definitions')
    ->where('is_active', 1)
    ->orderBy('tick_count')
    ->select('id', 'tick_count')
    ->get()
    ->unique('tick_count')
    ->values();

        foreach ($symbols as $symbol) {
            $this->processSymbol($symbol, $windows);
        }

        $this->info('Analytics processing complete.');
    }

    private function processSymbol($symbol, $windows)
    {
        $state = DB::table('symbol_analytics_state')
            ->where('symbol_id', $symbol->id)
            ->first();

        $latestTickId = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id', 'desc')
            ->value('tick_id');

        if (!$latestTickId) {
            $this->line('Skipping ' . $symbol->symbol . ' — no ticks yet.');
            return;
        }

        $lastProcessedTickId = $state->last_processed_tick_id ?? 0;
        $newTickCount = $latestTickId - $lastProcessedTickId;

        if ($newTickCount < self::MIN_NEW_TICKS_TO_PROCESS) {
            $this->line(
                'Skipping ' . $symbol->symbol .
                ' — only ' . $newTickCount . ' new tick(s) since last run.'
            );
            return;
        }

        // Get last 1000 ticks for this symbol (stats windows still need
        // the full recent history, even though we only re-run when enough
        // NEW ticks have arrived).
        $ticks = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id', 'desc')
            ->limit(1000)
            ->get();

        if ($ticks->count() < 10) {
            $this->line('Skipping ' . $symbol->symbol . ' — not enough ticks.');
            return;
        }

        $this->line(
            'Processing ' . $symbol->symbol . ' — ' . $ticks->count() .
            ' ticks (' . $newTickCount . ' new).'
        );

        foreach ($windows as $window) {
            if ($ticks->count() < $window->tick_count) {
                continue;
            }

            $windowTicks = $ticks->take($window->tick_count);

            $snapshotId = DB::table('snapshots')->insertGetId([
                'symbol_id' => $symbol->id,
                'window_id' => $window->id,
            ]);

            $this->calculateDigitFrequency($symbol, $window, $windowTicks, $snapshotId);
            $this->calculateMeanReversion($symbol, $snapshotId, $windowTicks);
        }

        // Only score run-lengths against ticks that are actually new,
        // carrying the open run forward instead of rescanning everything.
        $this->calculateRunLengths($symbol, $ticks, $lastProcessedTickId, $state);

        DB::table('symbol_analytics_state')->updateOrInsert(
            ['symbol_id' => $symbol->id],
            [
                'last_processed_tick_id' => $latestTickId,
                'last_run_at'            => now(),
            ]
        );
    }

    private function calculateDigitFrequency($symbol, $window, $ticks, $snapshotId)
    {
        $digitCounts = array_fill(0, 10, 0);
        $total       = $ticks->count();

        foreach ($ticks as $tick) {
            $digitCounts[$tick->last_digit]++;
        }

        foreach ($digitCounts as $digit => $count) {
            $percentage = $total > 0 ? round(($count / $total) * 100, 2) : 0;

            DB::table('digit_frequency')->insert([
                'snapshot_id' => $snapshotId,
                'symbol_id'   => $symbol->id,
                'digit'       => $digit,
                'count'       => $count,
                'percentage'  => $percentage,
            ]);
        }
    }

    private function calculateMeanReversion($symbol, $snapshotId, $ticks)
    {
        $total       = $ticks->count();
        $expected    = 10.00;
        $digitCounts = array_fill(0, 10, 0);

        foreach ($ticks as $tick) {
            $digitCounts[$tick->last_digit]++;
        }

        foreach ($digitCounts as $digit => $count) {
            $actual         = $total > 0 ? ($count / $total) * 100 : 0;
            $deviation      = $actual - $expected;
            $deviationPct   = round($deviation, 2);
            $signalStrength = round(abs($deviation) / $expected, 4);

            if (abs($deviation) < 2) {
                continue;
            }

            $direction = $deviation > 0 ? 'over' : 'under';

            DB::table('mean_reversion_signals')->insert([
                'snapshot_id'     => $snapshotId,
                'symbol_id'       => $symbol->id,
                'digit'           => $digit,
                'deviation_pct'   => $deviationPct,
                'signal_strength' => $signalStrength,
                'direction'       => $direction,
            ]);
        }
    }

    /**
     * Processes only ticks newer than $lastProcessedTickId, carrying the
     * open run forward across invocations via symbol_analytics_state.
     * This prevents the same overlapping run from being inserted into
     * run_lengths on every call.
     */
    private function calculateRunLengths($symbol, $ticks, $lastProcessedTickId, $state)
    {
        // Oldest-first, and only ticks genuinely new since last run.
        $newTicks = $ticks->reverse()->values()
            ->filter(fn ($t) => $t->tick_id > $lastProcessedTickId)
            ->values();

        if ($newTicks->isEmpty()) {
            return;
        }

        $currentDigit = $state->open_run_digit ?? null;
        $runStartTick = $state->open_run_start_tick_id ?? null;
        $runLength    = $state->open_run_length ?? 0;

        foreach ($newTicks as $tick) {
            if ($currentDigit === null) {
                $currentDigit = $tick->last_digit;
                $runStartTick = $tick->tick_id;
                $runLength    = 1;
                continue;
            }

            if ($tick->last_digit === $currentDigit) {
                $runLength++;
            } else {
                if ($runLength >= 2) {
                    DB::table('run_lengths')->insert([
                        'symbol_id'  => $symbol->id,
                        'digit'      => $currentDigit,
                        'run_length' => $runLength,
                        'started_at' => DB::table('tick_stream')
                                            ->where('tick_id', $runStartTick)
                                            ->value('received_at'),
                        'ended_at'   => $tick->received_at,
                    ]);
                }

                $currentDigit = $tick->last_digit;
                $runStartTick = $tick->tick_id;
                $runLength    = 1;
            }
        }

        // Persist the still-open run so the next invocation picks up
        // exactly where this one left off. updateOrInsert (not update)
        // because this can run before symbol_analytics_state has a row
        // for this symbol yet — plain update() silently no-ops in that case.
        DB::table('symbol_analytics_state')->updateOrInsert(
            ['symbol_id' => $symbol->id],
            [
                'open_run_digit'         => $currentDigit,
                'open_run_start_tick_id' => $runStartTick,
                'open_run_length'        => $runLength,
            ]
        );
    }
}