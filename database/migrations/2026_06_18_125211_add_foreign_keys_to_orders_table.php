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
        Schema::table('orders', function (Blueprint $table) {
            $table->foreign(['user_id'], 'orders_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['account_id'], 'orders_ibfk_2')->references(['id'])->on('accounts')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['symbol_id'], 'orders_ibfk_3')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['contract_type_id'], 'orders_ibfk_4')->references(['id'])->on('contract_types')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['bot_session_id'], 'orders_ibfk_5')->references(['id'])->on('bot_sessions')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['ensemble_prediction_id'], 'orders_ibfk_6')->references(['id'])->on('ensemble_predictions')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign('orders_ibfk_1');
            $table->dropForeign('orders_ibfk_2');
            $table->dropForeign('orders_ibfk_3');
            $table->dropForeign('orders_ibfk_4');
            $table->dropForeign('orders_ibfk_5');
            $table->dropForeign('orders_ibfk_6');
        });
    }
};
