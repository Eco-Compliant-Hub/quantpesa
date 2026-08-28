<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class GenerateAiPredictions extends Command
{
    protected $signature   = 'ai:generate-predictions';
    protected $description = 'Generate AI predictions based on analytics data';

    public function handle()
    {
        $this->info('Generating AI predictions...');

        $symbols = DB::table('symbols')->where('is_active', 1)->get();
        $models  = DB::table('ai_models')->where('status', 'active')->get();

        foreach ($symbols as $symbol) {
            $this->processSymbol($symbol, $models);
        }

        $this->info('AI predictions complete.');
    }

    private function processSymbol($symbol, $models)
    {
        // Get latest snapshot for last_100 window
        $snapshot = DB::table('snapshots')
            ->where('symbol_id', $symbol->id)
            ->where('window_id', 4)
            ->orderBy('id', 'desc')
            ->first();

        if (!$snapshot) {
            $this->line('Skipping ' . $symbol->symbol . ' — no snapshot.');
            return;
        }

        // Get digit frequency for this snapshot
        $digits = DB::table('digit_frequency')
            ->where('snapshot_id', $snapshot->id)
            ->orderBy('digit')
            ->get()
            ->keyBy('digit');

        if ($digits->isEmpty()) {
            return;
        }

        $predictions = [];

        foreach ($models as $model) {
            $prediction = $this->runModel($model, $symbol, $snapshot, $digits);
            if ($prediction) {
                $predictions[] = $prediction;

                DB::table('model_predictions')->insert([
                    'symbol_id'        => $symbol->id,
                    'model_id'         => $model->id,
                    'snapshot_id'      => $snapshot->id,
                    'prediction_type'  => $prediction['type'],
                    'probability_over' => $prediction['prob_over'],
                    'probability_under'=> $prediction['prob_under'],
                    'confidence'       => $prediction['confidence'],
                    'signal'           => $prediction['signal'],
                ]);
            }
        }

        if (!empty($predictions)) {
            $this->generateEnsemble($symbol, $snapshot, $predictions, $models);
            $this->line('✓ ' . $symbol->symbol . ' — ' . count($predictions) . ' predictions generated.');
        }
    }

    private function runModel($model, $symbol, $snapshot, $digits)
    {
        switch ($model->name) {
            case 'Even/Odd Predictor':
                return $this->evenOddModel($digits);

            case 'Over/Under Predictor':
                return $this->overUnderModel($digits);

            case 'Digit Frequency Classifier':
                return $this->frequencyModel($digits);

            case 'Rise/Fall Predictor':
                return $this->riseFallModel($symbol, $snapshot);

            default:
                return null;
        }
    }

    private function evenOddModel($digits)
    {
        $evenCount = 0;
        $oddCount  = 0;

        foreach ($digits as $digit => $data) {
            if ($digit % 2 === 0) {
                $evenCount += $data->count;
            } else {
                $oddCount += $data->count;
            }
        }

        $total      = $evenCount + $oddCount;
        $evenPct    = $total > 0 ? $evenCount / $total : 0.5;
        $oddPct     = $total > 0 ? $oddCount / $total : 0.5;
        $confidence = round(abs($evenPct - 0.5) * 2, 4);
        $signal     = $oddPct > $evenPct ? 'DIGITEVEN' : 'DIGITODD';

        return [
            'type'       => 'even_odd',
            'prob_over'  => round($evenPct, 4),
            'prob_under' => round($oddPct, 4),
            'confidence' => $confidence,
            'signal'     => $signal,
        ];
    }

    private function overUnderModel($digits)
    {
        // Over 4 means last digit is 5,6,7,8,9
        $overCount  = 0;
        $underCount = 0;

        foreach ($digits as $digit => $data) {
            if ($digit > 4) {
                $overCount += $data->count;
            } else {
                $underCount += $data->count;
            }
        }

        $total      = $overCount + $underCount;
        $overPct    = $total > 0 ? $overCount / $total : 0.5;
        $underPct   = $total > 0 ? $underCount / $total : 0.5;
        $confidence = round(abs($overPct - 0.5) * 2, 4);
        $signal     = $overPct > $underPct ? 'DIGITOVER' : 'DIGITUNDER';

        return [
            'type'       => 'over_under',
            'prob_over'  => round($overPct, 4),
            'prob_under' => round($underPct, 4),
            'confidence' => $confidence,
            'signal'     => $signal,
        ];
    }

    private function frequencyModel($digits)
    {
        $expected   = 10.0;
        $maxUnder   = null;
        $maxDev     = 0;

        foreach ($digits as $digit => $data) {
            $deviation = $expected - $data->percentage;
            if ($deviation > $maxDev) {
                $maxDev   = $deviation;
                $maxUnder = $digit;
            }
        }

        $confidence = round(min($maxDev / 10, 1), 4);

        return [
            'type'       => 'frequency',
            'prob_over'  => round($confidence, 4),
            'prob_under' => round(1 - $confidence, 4),
            'confidence' => $confidence,
            'signal'     => $maxUnder !== null ? 'DIGITMATCH:' . $maxUnder : 'HOLD',
        ];
    }

    private function riseFallModel($symbol, $snapshot)
    {
        $recentTicks = DB::table('tick_stream')
            ->where('symbol_id', $symbol->id)
            ->orderBy('tick_id', 'desc')
            ->limit(20)
            ->get();

        if ($recentTicks->count() < 5) {
            return null;
        }

        $prices    = $recentTicks->pluck('raw_price')->toArray();
        $latest    = $prices[0];
        $oldest    = end($prices);
        $momentum  = $latest - $oldest;
        $probRise  = $momentum > 0 ? 0.55 : 0.45;
        $probFall  = 1 - $probRise;
        $confidence = round(abs($momentum / $oldest), 4);
        $confidence = min($confidence, 1.0);
        $signal    = $probRise > $probFall ? 'CALL' : 'PUT';

        return [
            'type'       => 'rise_fall',
            'prob_over'  => round($probRise, 4),
            'prob_under' => round($probFall, 4),
            'confidence' => $confidence,
            'signal'     => $signal,
        ];
    }

    private function generateEnsemble($symbol, $snapshot, $predictions, $models)
    {
        $totalWeight    = 0;
        $weightedSignal = 0;
        $breakdown      = [];

        foreach ($predictions as $index => $pred) {
            $model  = $models[$index] ?? null;
            $weight = $model ? $model->weight : 0.25;

            $weightedSignal += $pred['prob_over'] * $weight;
            $totalWeight    += $weight;

            $breakdown[] = [
                'model'      => $model ? $model->name : 'unknown',
                'signal'     => $pred['signal'],
                'confidence' => $pred['confidence'],
                'weight'     => $weight,
            ];
        }

        $finalProb    = $totalWeight > 0 ? round($weightedSignal / $totalWeight, 4) : 0.5;
        $finalSignal  = $finalProb > 0.5 ? 'BUY' : 'SELL';
        $confScore    = round(abs($finalProb - 0.5) * 2, 4);
        $confGrade    = $confScore >= 0.7 ? 'A' : ($confScore >= 0.4 ? 'B' : ($confScore >= 0.2 ? 'C' : 'D'));

        $explanation = 'Ensemble of ' . count($predictions) . ' models. '
            . 'Final probability: ' . $finalProb . '. '
            . 'Signal: ' . $finalSignal . '. '
            . 'Confidence grade: ' . $confGrade . '.';

        DB::table('ensemble_predictions')->insert([
            'symbol_id'        => $symbol->id,
            'snapshot_id'      => $snapshot->id,
            'final_signal'     => $finalSignal,
            'final_probability'=> $finalProb,
            'confidence_score' => $confScore,
            'confidence_grade' => $confGrade,
            'explanation'      => $explanation,
            'model_breakdown'  => json_encode($breakdown),
        ]);
    }
}