<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AiModelSeeder extends Seeder
{
    public function run(): void
    {
        $models = [
            [
                'name'    => 'Digit Frequency Classifier',
                'version' => 'v1.0',
                'status'  => 'active',
                'weight'  => 0.200,
            ],
            [
                'name'    => 'Even/Odd Predictor',
                'version' => 'v1.0',
                'status'  => 'active',
                'weight'  => 0.200,
            ],
            [
                'name'    => 'Over/Under Predictor',
                'version' => 'v1.0',
                'status'  => 'active',
                'weight'  => 0.200,
            ],
            [
                'name'    => 'Rise/Fall Predictor',
                'version' => 'v1.0',
                'status'  => 'active',
                'weight'  => 0.200,
            ],
            [
                'name'    => 'Ensemble Voting Model',
                'version' => 'v1.0',
                'status'  => 'active',
                'weight'  => 0.200,
            ],
        ];

        DB::table('ai_models')->insertOrIgnore($models);
    }
}