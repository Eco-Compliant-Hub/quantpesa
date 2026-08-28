<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BotTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            [
                'name'          => 'Digit Even/Odd',
                'description'   => 'Trades digit even or odd based on frequency analysis',
                'strategy_type' => 'digit_evenodd',
                'risk_level'    => 'low',
                'is_active'     => 1,
            ],
            [
                'name'          => 'Digit Over/Under',
                'description'   => 'Trades digit over or under a threshold digit',
                'strategy_type' => 'digit_overunder',
                'risk_level'    => 'low',
                'is_active'     => 1,
            ],
            [
                'name'          => 'Rise/Fall',
                'description'   => 'Trades rise or fall based on mean reversion signals',
                'strategy_type' => 'rise_fall',
                'risk_level'    => 'medium',
                'is_active'     => 1,
            ],
            [
                'name'          => 'Accumulator',
                'description'   => 'Accumulator bot with configurable growth rate',
                'strategy_type' => 'accumulator',
                'risk_level'    => 'high',
                'is_active'     => 1,
            ],
        ];

        DB::table('bot_templates')->insertOrIgnore($templates);
    }
}