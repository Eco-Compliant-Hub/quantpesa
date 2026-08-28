<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class VerifyTickStream extends Command
{
    protected $signature   = 'tickstream:verify {--symbol= : Symbol to check, e.g. R_10}';
    protected $description = 'Diagnose tick_stream continuity, ordering, and duplicates for a symbol';

    public function handle()
    {
        $symbolCode = $this->option('symbol');

        if (!$symbolCode) {
            $this->error('Pass --symbol=R_10 (or whichever symbol you want checked).');
            return self::FAILURE;
        }

        $symbol = DB::table('symbols')->where('symbol', strtoupper($symbolCode))->first();

        if (!$symbol) {
            $this->error("Symbol {$symbolCode} not found.");
            return self::FAILURE;
        }

        $this->info("Verifying tick_stream for {$symbol->symbol} (tick_rate_ms: {$symbol->tick_rate_ms})...");
        $this->newLine();

        // ── Coverage summary ──────────────────────────────
        $count = DB::table('tick_stream')->where('symbol_id', $symbol->id)->count();

        if ($count === 0) {
            $this->warn('No ticks recorded for this symbol yet.');
            return self::SUCCESS;
        }

        $first = DB::table('tick_stream')->where('symbol_id', $symbol->id)->orderBy('tick_id')->first();
        $last  = DB::table('tick_stream')->where('symbol_id', $symbol->id)->orderBy('tick_id', 'desc')->first();

        $this->line("COVERAGE");
        $this->line("  Total ticks:  {$count}");
        $this->line("  First tick:   #{$first->tick_id} at {$first->received_at}");
        $this->line("  Last tick:    #{$last->tick_id} at {$last->received_at}");
        $this->newLine();

        // Pull ticks in a memory-safe way for the checks below, oldest-first.
        $ticks = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id')
            ->select('tick_id', 'received_at', 'raw_price', 'last_digit')
            ->get();

        // ── Check 1: Ordering ─────────────────────────────
        $orderingIssues = 0;
        $prevTickId = null;
        $prevReceivedAt = null;

        foreach ($ticks as $tick) {
            if ($prevTickId !== null && $tick->tick_id <= $prevTickId) {
                $orderingIssues++;
            }
            if ($prevReceivedAt !== null && \Carbon\Carbon::parse($tick->received_at)->lt(\Carbon\Carbon::parse($prevReceivedAt))) {
                $orderingIssues++;
            }
            $prevTickId = $tick->tick_id;
            $prevReceivedAt = $tick->received_at;
        }

        $this->line('ORDERING');
        $this->line($orderingIssues === 0
            ? '  OK — tick_id and received_at both strictly increasing.'
            : "  ISSUE — {$orderingIssues} out-of-order row(s) found.");
        $this->newLine();

        // ── Check 2: True duplicates ──────────────────────
        $duplicates = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->select('received_at', 'raw_price', DB::raw('COUNT(*) as occurrences'))
            ->groupBy('received_at', 'raw_price')
            ->having('occurrences', '>', 1)
            ->get();

        $this->line('DUPLICATES (same received_at + raw_price — never checked on last_digit)');
        if ($duplicates->isEmpty()) {
            $this->line('  OK — no true duplicates found.');
        } else {
            $this->warn("  ISSUE — {$duplicates->count()} duplicate group(s) found.");
            foreach ($duplicates->take(5) as $dup) {
                $this->line("    {$dup->received_at} @ {$dup->raw_price} — seen {$dup->occurrences} times");
            }
            if ($duplicates->count() > 5) {
                $this->line('    ... and ' . ($duplicates->count() - 5) . ' more.');
            }
        }
        $this->newLine();

        // ── Check 3: Gaps vs expected tick_rate_ms ────────
        $expectedMs = (int) $symbol->tick_rate_ms;
        $gapThresholdMs = $expectedMs * 3; // flag anything 3x+ the expected cadence

        $gaps = [];
        $prev = null;

        foreach ($ticks as $tick) {
            if ($prev !== null) {
                $deltaMs = \Carbon\Carbon::parse($prev->received_at)->diffInMilliseconds(\Carbon\Carbon::parse($tick->received_at));
                if ($deltaMs > $gapThresholdMs) {
                    $gaps[] = [
                        'from'    => $prev->received_at,
                        'to'      => $tick->received_at,
                        'gap_ms'  => $deltaMs,
                        'missed'  => intdiv($deltaMs, $expectedMs) - 1,
                    ];
                }
            }
            $prev = $tick;
        }

        $this->line("GAPS (delta > {$gapThresholdMs}ms, i.e. 3x expected {$expectedMs}ms cadence)");
        if (empty($gaps)) {
            $this->line('  OK — no gaps beyond expected cadence.');
        } else {
            $totalMissed = array_sum(array_column($gaps, 'missed'));
            $this->warn('  ISSUE — ' . count($gaps) . " gap(s) found, ~{$totalMissed} tick(s) likely missed.");
            foreach (array_slice($gaps, 0, 5) as $gap) {
                $this->line("    {$gap['from']} -> {$gap['to']} ({$gap['gap_ms']}ms, ~{$gap['missed']} missed)");
            }
            if (count($gaps) > 5) {
                $this->line('    ... and ' . (count($gaps) - 5) . ' more.');
            }
        }
        $this->newLine();

        // ── Verdict ────────────────────────────────────────
        $gapCount = count($gaps);
        $dupCount = $duplicates->count();

        if ($orderingIssues === 0 && $dupCount === 0 && $gapCount === 0) {
            $verdict = 'A — Clean. Safe to treat tick_stream as ground truth for this symbol.';
        } elseif ($orderingIssues === 0 && $dupCount === 0 && $gapCount <= 3) {
            $verdict = 'B — Mostly clean, a few small gaps. Usable, worth a backfill eventually.';
        } elseif ($orderingIssues === 0 && $gapCount <= 10) {
            $verdict = 'C — Noticeable gaps and/or duplicates. Backfill against ticks_history recommended before trusting large-window (500+) analysis.';
        } else {
            $verdict = 'D — Significant issues. Do not trust this symbol\'s data for analysis until reconciled against ticks_history.';
        }

        $this->line('VERDICT');
        $this->line("  {$verdict}");

        return self::SUCCESS;
    }
}
