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
        Schema::table('bot_configurations', function (Blueprint $table) {
            $table->foreign(['bot_id'], 'bot_configurations_ibfk_1')->references(['id'])->on('user_bots')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['symbol_id'], 'bot_configurations_ibfk_2')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['contract_type_id'], 'bot_configurations_ibfk_3')->references(['id'])->on('contract_types')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bot_configurations', function (Blueprint $table) {
            $table->dropForeign('bot_configurations_ibfk_1');
            $table->dropForeign('bot_configurations_ibfk_2');
            $table->dropForeign('bot_configurations_ibfk_3');
        });
    }
};
