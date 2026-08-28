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
        Schema::table('user_bots', function (Blueprint $table) {
            $table->foreign(['user_id'], 'user_bots_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['template_id'], 'user_bots_ibfk_2')->references(['id'])->on('bot_templates')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['account_id'], 'user_bots_ibfk_3')->references(['id'])->on('accounts')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('user_bots', function (Blueprint $table) {
            $table->dropForeign('user_bots_ibfk_1');
            $table->dropForeign('user_bots_ibfk_2');
            $table->dropForeign('user_bots_ibfk_3');
        });
    }
};
