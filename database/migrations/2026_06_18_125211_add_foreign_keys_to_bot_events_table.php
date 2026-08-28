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
        Schema::table('bot_events', function (Blueprint $table) {
            $table->foreign(['bot_id'], 'bot_events_ibfk_1')->references(['id'])->on('user_bots')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['session_id'], 'bot_events_ibfk_2')->references(['id'])->on('bot_sessions')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bot_events', function (Blueprint $table) {
            $table->dropForeign('bot_events_ibfk_1');
            $table->dropForeign('bot_events_ibfk_2');
        });
    }
};
