<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SymbolSeeder extends Seeder
{
    public function run(): void
    {
        $symbols = [
            // Standard (2s tick) Volatility
            ['symbol' => 'R_10',       'display_name' => 'Volatility 10 Index',      'market_type' => 'volatility', 'tick_rate_ms' => 2000, 'is_active' => 1],
            ['symbol' => 'R_25',       'display_name' => 'Volatility 25 Index',      'market_type' => 'volatility', 'tick_rate_ms' => 2000, 'is_active' => 1],
            ['symbol' => 'R_50',       'display_name' => 'Volatility 50 Index',      'market_type' => 'volatility', 'tick_rate_ms' => 2000, 'is_active' => 1],
            ['symbol' => 'R_75',       'display_name' => 'Volatility 75 Index',      'market_type' => 'volatility', 'tick_rate_ms' => 2000, 'is_active' => 1],
            ['symbol' => 'R_100',      'display_name' => 'Volatility 100 Index',     'market_type' => 'volatility', 'tick_rate_ms' => 2000, 'is_active' => 1],

            // 1s Volatility
            ['symbol' => '1HZ10V',     'display_name' => 'Volatility 10 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ15V',     'display_name' => 'Volatility 15 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ25V',     'display_name' => 'Volatility 25 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ30V',     'display_name' => 'Volatility 30 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ50V',     'display_name' => 'Volatility 50 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ75V',     'display_name' => 'Volatility 75 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ90V',     'display_name' => 'Volatility 90 (1s) Index',  'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ100V',    'display_name' => 'Volatility 100 (1s) Index', 'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ150V',    'display_name' => 'Volatility 150 (1s) Index', 'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => '1HZ250V',    'display_name' => 'Volatility 250 (1s) Index', 'market_type' => 'volatility', 'tick_rate_ms' => 1000, 'is_active' => 1],

            // Boom
            ['symbol' => 'BOOM300',    'display_name' => 'Boom 300 Index',    'market_type' => 'boom', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'BOOM500',    'display_name' => 'Boom 500 Index',    'market_type' => 'boom', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'BOOM600',    'display_name' => 'Boom 600 Index',    'market_type' => 'boom', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'BOOM900',    'display_name' => 'Boom 900 Index',    'market_type' => 'boom', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'BOOM1000',   'display_name' => 'Boom 1000 Index',   'market_type' => 'boom', 'tick_rate_ms' => 1000, 'is_active' => 1],

            // Crash
            ['symbol' => 'CRASH300',   'display_name' => 'Crash 300 Index',   'market_type' => 'crash', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'CRASH500',   'display_name' => 'Crash 500 Index',   'market_type' => 'crash', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'CRASH600',   'display_name' => 'Crash 600 Index',   'market_type' => 'crash', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'CRASH900',   'display_name' => 'Crash 900 Index',   'market_type' => 'crash', 'tick_rate_ms' => 1000, 'is_active' => 1],
            ['symbol' => 'CRASH1000',  'display_name' => 'Crash 1000 Index',  'market_type' => 'crash', 'tick_rate_ms' => 1000, 'is_active' => 1],
        ];

        DB::table('symbols')->insertOrIgnore($symbols);
    }
}