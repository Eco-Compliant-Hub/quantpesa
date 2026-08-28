<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MarketController extends Controller
{
    public function symbols(Request $request)
    {
        $query = DB::table('symbols')->where('is_active', 1);

        if ($request->has('market_type')) {
            $query->where('market_type', $request->market_type);
        }

        $symbols = $query->orderBy('market_type')->orderBy('symbol')->get();

        return response()->json([
            'success' => true,
            'symbols' => $symbols,
        ], 200);
    }

    public function symbol(Request $request, $symbol)
    {
        $record = DB::table('symbols')
            ->where('symbol', strtoupper($symbol))
            ->where('is_active', 1)
            ->first();

        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Symbol not found.',
            ], 404);
        }

        $status = DB::table('symbol_status')
            ->where('symbol_id', $record->id)
            ->first();

        return response()->json([
            'success' => true,
            'symbol'  => $record,
            'status'  => $status,
        ], 200);
    }

    public function marketTypes()
    {
        $types = DB::table('symbols')
            ->where('is_active', 1)
            ->select('market_type')
            ->distinct()
            ->orderBy('market_type')
            ->pluck('market_type');

        return response()->json([
            'success'      => true,
            'market_types' => $types,
        ], 200);
    }
}