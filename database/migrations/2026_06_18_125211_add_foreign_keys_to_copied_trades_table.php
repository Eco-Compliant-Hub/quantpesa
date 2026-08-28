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
        Schema::table('copied_trades', function (Blueprint $table) {
            $table->foreign(['copy_relationship_id'], 'copied_trades_ibfk_1')->references(['id'])->on('copy_relationships')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['source_order_id'], 'copied_trades_ibfk_2')->references(['id'])->on('orders')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['copied_order_id'], 'copied_trades_ibfk_3')->references(['id'])->on('orders')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('copied_trades', function (Blueprint $table) {
            $table->dropForeign('copied_trades_ibfk_1');
            $table->dropForeign('copied_trades_ibfk_2');
            $table->dropForeign('copied_trades_ibfk_3');
        });
    }
};
