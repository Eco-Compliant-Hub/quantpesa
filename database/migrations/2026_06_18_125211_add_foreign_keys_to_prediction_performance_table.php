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
        Schema::table('prediction_performance', function (Blueprint $table) {
            $table->foreign(['ensemble_prediction_id'], 'prediction_performance_ibfk_1')->references(['id'])->on('ensemble_predictions')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['order_id'], 'prediction_performance_ibfk_2')->references(['id'])->on('orders')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('prediction_performance', function (Blueprint $table) {
            $table->dropForeign('prediction_performance_ibfk_1');
            $table->dropForeign('prediction_performance_ibfk_2');
        });
    }
};
