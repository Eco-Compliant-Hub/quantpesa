<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $duplicateGroups = DB::table('accounts')
            ->select('user_id', 'broker_account_id')
            ->whereNotNull('broker_account_id')
            ->groupBy('user_id', 'broker_account_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicateGroups as $group) {
            $rows = DB::table('accounts')
                ->where('user_id', $group->user_id)
                ->where('broker_account_id', $group->broker_account_id)
                ->orderByRaw('balance_cache IS NULL')
                ->orderByDesc('id')
                ->get();

            $remove = $rows->skip(1);

            DB::table('accounts')
                ->whereIn('id', $remove->pluck('id'))
                ->delete();
        }

        Schema::table('accounts', function (Blueprint $table) {
            $table->unique(['user_id', 'broker_account_id'], 'unique_user_broker_account');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropUnique('unique_user_broker_account');
        });
    }
};
