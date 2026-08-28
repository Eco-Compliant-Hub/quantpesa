<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AiController extends Controller
{
    // GET /api/ai/predictions
    public function predictions(Request $request)
    {
        $predictions = DB::table('ensemble_predictions as ep')
            ->join('symbols as s', 's.id', '=', 'ep.symbol_id')
            ->select(
                's.symbol',
                'ep.final_signal',
                'ep.final_probability',
                'ep.confidence_score',
                'ep.confidence_grade',
                'ep.explanation',
                'ep.created_at'
            )
            ->orderByDesc('ep.id')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'count'   => $predictions->count(),
            'data'    => $predictions,
        ], 200);
    }

    // GET /api/ai/predictions/{symbol}
    public function predictionForSymbol($symbol)
    {
        $prediction = DB::table('ensemble_predictions as ep')
            ->join('symbols as s', 's.id', '=', 'ep.symbol_id')
            ->where('s.symbol', $symbol)
            ->select(
                's.symbol',
                'ep.final_signal',
                'ep.final_probability',
                'ep.confidence_score',
                'ep.confidence_grade',
                'ep.explanation',
                'ep.created_at'
            )
            ->orderByDesc('ep.id')
            ->first();

        if (!$prediction) {
            return response()->json([
                'success' => false,
                'message' => 'No prediction found for this symbol.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $prediction,
        ], 200);
    }

    // GET /api/ai/models
    public function models()
    {
        $models = DB::table('ai_models')
            ->select('id', 'name', 'version', 'status', 'weight', 'last_trained_at')
            ->get();

        return response()->json([
            'success' => true,
            'count'   => $models->count(),
            'data'    => $models,
        ], 200);
    }

    // GET /api/ai/models/{id}/performance
    public function modelPerformance($id)
    {
        $model = DB::table('ai_models')->where('id', $id)->first();

        if (!$model) {
            return response()->json([
                'success' => false,
                'message' => 'AI model not found.',
            ], 404);
        }

        // Link: model_predictions.snapshot_id == ensemble_predictions.snapshot_id
        // Then prediction_performance.ensemble_prediction_id == ensemble_predictions.id
        $performance = DB::table('prediction_performance as pp')
            ->join('ensemble_predictions as ep', 'ep.id', '=', 'pp.ensemble_prediction_id')
            ->join('model_predictions as mp', 'mp.snapshot_id', '=', 'ep.snapshot_id')
            ->where('mp.model_id', $id)
            ->select(
                'pp.id',
                'pp.ensemble_prediction_id',
                'pp.order_id',
                'pp.was_correct',
                'pp.evaluated_at',
                'mp.signal as model_signal',
                'mp.confidence as model_confidence'
            )
            ->orderByDesc('pp.id')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'model'   => $model,
            'count'   => $performance->count(),
            'data'    => $performance,
        ], 200);
    }
}