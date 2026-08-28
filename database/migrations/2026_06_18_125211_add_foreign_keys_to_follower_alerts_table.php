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
        Schema::table('follower_alerts', function (Blueprint $table) {
            $table->foreign(['follower_id'], 'follower_alerts_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['copied_trade_id'], 'follower_alerts_ibfk_2')->references(['id'])->on('copied_trades')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('follower_alerts', function (Blueprint $table) {
            $table->dropForeign('follower_alerts_ibfk_1');
            $table->dropForeign('follower_alerts_ibfk_2');
        });
    }
};
