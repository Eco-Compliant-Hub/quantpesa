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
        Schema::table('model_predictions', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'model_predictions_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['model_id'], 'model_predictions_ibfk_2')->references(['id'])->on('ai_models')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['snapshot_id'], 'model_predictions_ibfk_3')->references(['id'])->on('snapshots')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('model_predictions', function (Blueprint $table) {
            $table->dropForeign('model_predictions_ibfk_1');
            $table->dropForeign('model_predictions_ibfk_2');
            $table->dropForeign('model_predictions_ibfk_3');
        });
    }
};
