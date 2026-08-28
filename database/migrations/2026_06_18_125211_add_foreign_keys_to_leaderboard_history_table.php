<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('leaderboard_history', function (Blueprint $table) {
            $table->foreign(['provider_id'], 'leaderboard_history_ibfk_1')->references(['user_id'])->on('strategy_providers')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('leaderboard_history', function (Blueprint $table) {
            $table->dropForeign('leaderboard_history_ibfk_1');
        });
    }
};
