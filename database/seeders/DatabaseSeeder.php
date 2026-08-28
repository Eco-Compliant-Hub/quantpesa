<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            SymbolSeeder::class,
            ContractTypeSeeder::class,
            PlanSeeder::class,
            UserSeeder::class,
            WindowDefinitionSeeder::class,
            BotTemplateSeeder::class,
            AiModelSeeder::class,
        ]);
    }
}