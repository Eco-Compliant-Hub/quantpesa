<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AnalysisContextController extends Controller
{
    // POST /api/analysis-contexts
    //
    // Persists a context captured on the Analysis page (analysis.js's
    // buildDecisionSnapshot()) so it has a real analysis_contexts.id
    // that bot_sessions and orders can bind to. No new statistics are
    // computed here -- this is a straight snapshot of what the client
    // already synthesized from observe()/absence()/runs().
    public function store(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'symbol'           => 'required|string',
            'lookback'         => 'required|integer|min:1',
            'state'            => 'required|string',
            'evidence_quality' => 'required|string',
            'evidence'         => 'required|array',
            'snapshot'         => 'required|array',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        // symbols.symbol is confirmed to exist as the raw code column --
        // TradingController::myOrders() already joins on it (s.symbol).
        $symbol = DB::table('symbols')->where('symbol', $request->symbol)->first();

        if (!$symbol) {
            return response()->json([
                'success' => false,
                'message' => 'Unknown symbol: ' . $request->symbol,
            ], 422);
        }

        $id = DB::table('analysis_contexts')->insertGetId([
            'user_id'          => $user->id,
            'symbol_id'        => $symbol->id,
            'lookback'         => $request->lookback,
            'state'            => $request->state,
            'evidence_quality' => $request->evidence_quality,
            'evidence'         => json_encode($request->evidence),
            'snapshot'         => json_encode($request->snapshot),
            'captured_at'      => now(),
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        $context = DB::table('analysis_contexts')->where('id', $id)->first();

        return response()->json([
            'success' => true,
            'data'    => $context,
        ], 201);
    }

    // GET /api/analysis-contexts/{id}
    // Used by Bots/Trading/Journal to re-fetch a context by its real id
    // rather than trusting whatever sessionStorage still has cached.
    public function show(Request $request, $id)
    {
        $user = $request->user();

        $context = DB::table('analysis_contexts')
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$context) {
            return response()->json([
                'success' => false,
                'message' => 'Analysis context not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $context,
        ], 200);
    }
}
