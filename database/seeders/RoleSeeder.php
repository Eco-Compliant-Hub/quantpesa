<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['name' => 'admin',     'description' => 'Platform administrator'],
            ['name' => 'trader',    'description' => 'Standard trader account'],
            ['name' => 'provider',  'description' => 'Copy trade signal provider'],
            ['name' => 'support',   'description' => 'Customer support agent'],
        ];

        DB::table('roles')->insertOrIgnore($roles);
    }
}