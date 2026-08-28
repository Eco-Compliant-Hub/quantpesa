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
        Schema::table('risk_events', function (Blueprint $table) {
            $table->foreign(['user_id'], 'risk_events_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['bot_session_id'], 'risk_events_ibfk_2')->references(['id'])->on('bot_sessions')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('risk_events', function (Blueprint $table) {
            $table->dropForeign('risk_events_ibfk_1');
            $table->dropForeign('risk_events_ibfk_2');
        });
    }
};
