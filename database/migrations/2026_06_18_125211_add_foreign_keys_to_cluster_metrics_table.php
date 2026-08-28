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
        Schema::table('cluster_metrics', function (Blueprint $table) {
            $table->foreign(['snapshot_id'], 'cluster_metrics_ibfk_1')->references(['id'])->on('snapshots')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['symbol_id'], 'cluster_metrics_ibfk_2')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cluster_metrics', function (Blueprint $table) {
            $table->dropForeign('cluster_metrics_ibfk_1');
            $table->dropForeign('cluster_metrics_ibfk_2');
        });
    }
};
