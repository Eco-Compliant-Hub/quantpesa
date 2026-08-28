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
        Schema::table('mean_reversion_signals', function (Blueprint $table) {
            $table->foreign(['snapshot_id'], 'mean_reversion_signals_ibfk_1')->references(['id'])->on('snapshots')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['symbol_id'], 'mean_reversion_signals_ibfk_2')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mean_reversion_signals', function (Blueprint $table) {
            $table->dropForeign('mean_reversion_signals_ibfk_1');
            $table->dropForeign('mean_reversion_signals_ibfk_2');
        });
    }
};
