<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name'          => 'Free',
                'monthly_price' => 0.00,
                'features'      => json_encode([
                    'max_bots'         => 1,
                    'max_accounts'     => 1,
                    'analytics_access' => false,
                    'ai_access'        => false,
                    'copy_trading'     => false,
                ]),
                'is_active'     => 1,
            ],
            [
                'name'          => 'Pro',
                'monthly_price' => 29.99,
                'features'      => json_encode([
                    'max_bots'         => 5,
                    'max_accounts'     => 3,
                    'analytics_access' => true,
                    'ai_access'        => true,
                    'copy_trading'     => false,
                ]),
                'is_active'     => 1,
            ],
            [
                'name'          => 'Elite',
                'monthly_price' => 79.99,
                'features'      => json_encode([
                    'max_bots'         => 20,
                    'max_accounts'     => 10,
                    'analytics_access' => true,
                    'ai_access'        => true,
                    'copy_trading'     => true,
                ]),
                'is_active'     => 1,
            ],
        ];

        DB::table('plans')->insertOrIgnore($plans);
    }
}