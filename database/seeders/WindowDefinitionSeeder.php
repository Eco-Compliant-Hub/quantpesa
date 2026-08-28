<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class WindowDefinitionSeeder extends Seeder
{
    public function run(): void
    {
        $windows = [
            ['name' => 'last_10',   'tick_count' => 10,   'description' => 'Last 10 ticks'],
            ['name' => 'last_25',   'tick_count' => 25,   'description' => 'Last 25 ticks'],
            ['name' => 'last_50',   'tick_count' => 50,   'description' => 'Last 50 ticks'],
            ['name' => 'last_100',  'tick_count' => 100,  'description' => 'Last 100 ticks'],
            ['name' => 'last_250',  'tick_count' => 250,  'description' => 'Last 250 ticks'],
            ['name' => 'last_500',  'tick_count' => 500,  'description' => 'Last 500 ticks'],
            ['name' => 'last_1000', 'tick_count' => 1000, 'description' => 'Last 1000 ticks'],
        ];

        DB::table('window_definitions')->insertOrIgnore($windows);
    }
}