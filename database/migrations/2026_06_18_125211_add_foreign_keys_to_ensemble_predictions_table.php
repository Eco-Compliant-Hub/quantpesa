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
        Schema::table('ensemble_predictions', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'ensemble_predictions_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['snapshot_id'], 'ensemble_predictions_ibfk_2')->references(['id'])->on('snapshots')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ensemble_predictions', function (Blueprint $table) {
            $table->dropForeign('ensemble_predictions_ibfk_1');
            $table->dropForeign('ensemble_predictions_ibfk_2');
        });
    }
};
