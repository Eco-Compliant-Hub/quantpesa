<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $keepIds = DB::table('window_definitions')
            ->selectRaw('MIN(id) as id')
            ->groupBy('tick_count')
            ->pluck('id');

        DB::table('window_definitions')
            ->whereNotIn('id', $keepIds)
            ->delete();
    }

    public function down(): void
    {
        // Not reversible — duplicates were junk data, not meaningful history.
    }
};