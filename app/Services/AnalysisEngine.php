<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Single analytical authority for "what does this market look like right
 * now" questions. Every calculation for a given observe() call works off
 * the exact same tick set, fetched once — this prevents frequency and
 * Markov (for example) from silently describing slightly different
 * windows if fetched independently.
 *
 * Nothing here writes to the database. These are live, on-demand
 * calculations over tick_stream — not stored snapshots. See the project
 * notes on why: derived stats are cheap to recompute and expensive to
 * keep accumulating as rows forever.
 */
class AnalysisEngine
{
    // Hard ceiling so a request can never accidentally ask the database
    // for an unreasonable number of rows.
    private const MAX_TICKS = 5000;

    // How far back the absence tracker will look for a digit before
    // giving up and reporting "beyond buffer" instead of a false number.
    private const ABSENCE_BUFFER = 1000;

    /**
     * Describes the market over the most recent $requestedTicks ticks.
     * Returns frequency, range distribution, entropy, and a Markov
     * transition matrix — the matrix is always computed (cheap even at
     * small N) but always carries a sample-adequacy label rather than
     * being silently hidden below some arbitrary cutoff.
     */
    public function observe(string $symbolCode, int $requestedTicks): array
    {
        $symbol = DB::table('symbols')->where('symbol', strtoupper($symbolCode))->first();

        if (!$symbol) {
            return ['success' => false, 'message' => 'Symbol not found.'];
        }

        $tickCount = min($requestedTicks, self::MAX_TICKS);

        // Newest-first fetch, exactly once — everything below reads from
        // this same collection.
        $ticksDesc = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id', 'desc')
            ->limit($tickCount)
            ->select('tick_id', 'received_at', 'last_digit')
            ->get();

        $sampleSize = $ticksDesc->count();

        if ($sampleSize === 0) {
            return [
                'success'     => true,
                'symbol'      => $symbol->symbol,
                'sample_size' => 0,
                'message'     => 'No ticks available for this symbol yet.',
            ];
        }

        $ticksChronological = $ticksDesc->reverse()->values(); // oldest-first, needed for Markov

        return [
            'success'         => true,
            'symbol'          => $symbol->symbol,
            'requested_ticks' => $requestedTicks,
            'sample_size'     => $sampleSize,
            'latest_tick_id'  => $ticksDesc->first()->tick_id,
            'observed_at'     => now()->toDateTimeString(),
            'frequency'       => $this->calculateFrequency($ticksDesc, $sampleSize),
            'range'           => $this->calculateRange($ticksDesc, $sampleSize),
            'entropy'         => $this->calculateEntropy($ticksDesc, $sampleSize),
            'markov'          => $this->calculateMarkov($ticksChronological, $sampleSize),
        ];
    }

    /**
     * Real-time "ticks since each digit last appeared" — the server-side
     * source of truth (never the browser). Also reports, per digit,
     * whether it appeared at all within each requested window size —
     * a second, independent question from the raw absence count.
     */
    public function absence(string $symbolCode, array $windows = [10, 20, 30]): array
    {
        $symbol = DB::table('symbols')->where('symbol', strtoupper($symbolCode))->first();

        if (!$symbol) {
            return ['success' => false, 'message' => 'Symbol not found.'];
        }

        $ticksDesc = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id', 'desc')
            ->limit(self::ABSENCE_BUFFER)
            ->select('last_digit')
            ->get();

        $bufferSize = $ticksDesc->count();
        $digits = [];

        for ($digit = 0; $digit <= 9; $digit++) {
            // Find how many ticks back (0 = the very latest tick) this
            // digit last appeared, scanning newest-to-oldest.
            $ticksSinceLastSeen = null;
            foreach ($ticksDesc as $index => $tick) {
                if ($tick->last_digit === $digit) {
                    $ticksSinceLastSeen = $index;
                    break;
                }
            }

            // Per-window frequency — the actual count, not just a boolean.
            // This is what the "8/20" style display needs; window_presence
            // is kept too since some callers may still want the boolean.
            $windowStats = [];
            foreach ($windows as $window) {
                $slice = $ticksDesc->take($window);
                $count = $slice->where('last_digit', $digit)->count();
                $windowStats[$window] = [
                    'count'     => $count,
                    'of'        => min($window, $bufferSize),
                    'in_window' => $count > 0,
                ];
            }

            $digits[] = [
                'digit'                  => $digit,
                'ticks_since_last_seen'  => $ticksSinceLastSeen,
                'beyond_buffer'          => $ticksSinceLastSeen === null,
                'buffer_size'            => $bufferSize,
                'window_stats'           => $windowStats,
            ];
        }

        // Ranked most-absent-first — beyond_buffer digits sort to the top
        // since "not seen in the last 1000 ticks" is more absent than any
        // number we could have counted.
        usort($digits, function ($a, $b) {
            if ($a['beyond_buffer'] && !$b['beyond_buffer']) return -1;
            if (!$a['beyond_buffer'] && $b['beyond_buffer']) return 1;
            return ($b['ticks_since_last_seen'] ?? 0) <=> ($a['ticks_since_last_seen'] ?? 0);
        });

        return [
            'success'      => true,
            'symbol'       => $symbol->symbol,
            'buffer_size'  => $bufferSize,
            'windows'      => $windows,
            'digits'       => $digits,
        ];
    }

    private function calculateFrequency($ticksDesc, int $sampleSize): array
    {
        $counts = array_fill(0, 10, 0);
        foreach ($ticksDesc as $t) {
            $counts[$t->last_digit]++;
        }

        $result = [];
        foreach ($counts as $digit => $count) {
            $result[] = [
                'digit'      => $digit,
                'count'      => $count,
                'percentage' => round(($count / $sampleSize) * 100, 2),
            ];
        }

        return $result;
    }

    private function calculateRange($ticksDesc, int $sampleSize): array
    {
        $lower = $ticksDesc->filter(fn ($t) => $t->last_digit <= 4)->count();
        $upper = $sampleSize - $lower;

        $lowerPct = round(($lower / $sampleSize) * 100, 2);
        $upperPct = round(($upper / $sampleSize) * 100, 2);

        return [
            'lower_0_4'  => $lowerPct,
            'upper_5_9'  => $upperPct,
            'imbalance'  => round($lowerPct - $upperPct, 2), // positive = lower-heavy
        ];
    }

    private function calculateEntropy($ticksDesc, int $sampleSize): float
    {
        $counts = array_fill(0, 10, 0);
        foreach ($ticksDesc as $t) {
            $counts[$t->last_digit]++;
        }

        $entropy = 0.0;
        foreach ($counts as $count) {
            if ($count > 0) {
                $p = $count / $sampleSize;
                $entropy -= $p * log($p, 2);
            }
        }

        // Normalized 0-1: 1.0 = perfectly uniform across all 10 digits,
        // 0.0 = a single digit dominates entirely.
        return round($entropy / log(10, 2), 4);
    }

    /**
     * Always computes the matrix (cheap even at low N) but always attaches
     * an adequacy label rather than a hard cutoff — per the correction
     * that "Markov unavailable" is worse than "Markov: insufficient sample".
     */
    private function calculateMarkov($ticksChronological, int $sampleSize): array
    {
        $adequacy = match (true) {
            $sampleSize < 25   => 'insufficient_sample',
            $sampleSize < 100  => 'very_weak',
            $sampleSize < 250  => 'preliminary',
            $sampleSize < 500  => 'moderate',
            $sampleSize < 1000 => 'strong',
            default            => 'deep',
        };

        if ($sampleSize < 2) {
            return ['adequacy' => $adequacy, 'matrix' => []];
        }

        $counts = [];
        for ($from = 0; $from <= 9; $from++) {
            for ($to = 0; $to <= 9; $to++) {
                $counts[$from][$to] = 0;
            }
        }

        for ($i = 1; $i < $ticksChronological->count(); $i++) {
            $from = $ticksChronological[$i - 1]->last_digit;
            $to   = $ticksChronological[$i]->last_digit;
            $counts[$from][$to]++;
        }

        $matrix = [];
        foreach ($counts as $from => $tos) {
            $fromTotal = array_sum($tos);
            $row = ['from_digit' => $from, 'sample_size' => $fromTotal, 'transitions' => []];
            foreach ($tos as $to => $count) {
                $row['transitions'][] = [
                    'to_digit'    => $to,
                    'count'       => $count,
                    'probability' => $fromTotal > 0 ? round($count / $fromTotal, 4) : 0,
                ];
            }
            $matrix[] = $row;
        }

        return ['adequacy' => $adequacy, 'matrix' => $matrix];
    }
}