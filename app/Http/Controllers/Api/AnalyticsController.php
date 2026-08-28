<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function observe(Request $request, $symbol)
    {
        $ticks = (int) $request->get('ticks', 100);

        if ($ticks < 1) {
            return response()->json([
                'success' => false,
                'message' => 'ticks must be a positive integer.',
            ], 422);
        }

        $engine = new \App\Services\AnalysisEngine();
        $result = $engine->observe($symbol, $ticks);

        return response()->json($result, $result['success'] ? 200 : 404);
    }

    public function absence(Request $request, $symbol)
    {
        $windowsParam = $request->get('windows', '10,20,30');
        $windows = array_map('intval', explode(',', $windowsParam));

        $engine = new \App\Services\AnalysisEngine();
        $result = $engine->absence($symbol, $windows);

        return response()->json($result, $result['success'] ? 200 : 404);
    }

    public function digits(Request $request, $symbol)
    {
        $symbolRow = DB::table('symbols')
            ->where('symbol', strtoupper($symbol))
            ->first();

        if (!$symbolRow) {
            return response()->json([
                'success' => false,
                'message' => 'Symbol not found.',
            ], 404);
        }

        $windowId = $request->get('window', 4); // default last_100

        $snapshot = DB::table('snapshots')
            ->where('symbol_id', $symbolRow->id)
            ->where('window_id', $windowId)
            ->orderBy('id', 'desc')
            ->first();

        if (!$snapshot) {
            return response()->json([
                'success' => false,
                'message' => 'No analytics data yet for this symbol.',
            ], 404);
        }

        $digits = DB::table('digit_frequency')
            ->where('snapshot_id', $snapshot->id)
            ->orderBy('digit')
            ->get();

        return response()->json([
            'success'      => true,
            'symbol'       => $symbol,
            'window_id'    => $windowId,
            'snapshot_at'  => $snapshot->calculated_at,
            'digits'       => $digits,
        ], 200);
    }

    public function signals(Request $request, $symbol)
    {
        $symbolRow = DB::table('symbols')
            ->where('symbol', strtoupper($symbol))
            ->first();

        if (!$symbolRow) {
            return response()->json([
                'success' => false,
                'message' => 'Symbol not found.',
            ], 404);
        }

        $signals = DB::table('mean_reversion_signals')
            ->where('symbol_id', $symbolRow->id)
            ->orderBy('id', 'desc')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'symbol'  => $symbol,
            'signals' => $signals,
        ], 200);
    }

    public function runs(Request $request, $symbol)
    {
        $symbolRow = DB::table('symbols')
            ->where('symbol', strtoupper($symbol))
            ->first();

        if (!$symbolRow) {
            return response()->json([
                'success' => false,
                'message' => 'Symbol not found.',
            ], 404);
        }

        $runs = DB::table('run_lengths')
            ->where('symbol_id', $symbolRow->id)
            ->orderBy('id', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'symbol'  => $symbol,
            'runs'    => $runs,
        ], 200);
    }

    public function summary(Request $request, $symbol)
    {
        $symbolRow = DB::table('symbols')
            ->where('symbol', strtoupper($symbol))
            ->first();

        if (!$symbolRow) {
            return response()->json([
                'success' => false,
                'message' => 'Symbol not found.',
            ], 404);
        }

        $status = DB::table('symbol_status')
            ->where('symbol_id', $symbolRow->id)
            ->first();

        $latestSignals = DB::table('mean_reversion_signals')
            ->where('symbol_id', $symbolRow->id)
            ->orderBy('id', 'desc')
            ->limit(5)
            ->get();

        $digitDist = DB::table('digit_frequency as df')
            ->join('snapshots as s', 's.id', '=', 'df.snapshot_id')
            ->where('df.symbol_id', $symbolRow->id)
            ->where('s.window_id', 4)
            ->orderBy('s.id', 'desc')
            ->limit(10)
            ->get(['df.digit', 'df.count', 'df.percentage']);

        return response()->json([
            'success'        => true,
            'symbol'         => $symbol,
            'status'         => $status,
            'digit_dist'     => $digitDist,
            'latest_signals' => $latestSignals,
        ], 200);
    }
}