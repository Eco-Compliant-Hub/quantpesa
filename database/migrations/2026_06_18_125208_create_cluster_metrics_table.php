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
        Schema::create('cluster_metrics', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('snapshot_id')->unique('unique_snapshot_id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->decimal('lower_pct', 5);
            $table->decimal('upper_pct', 5);
            $table->decimal('even_pct', 5);
            $table->decimal('odd_pct', 5);
            $table->decimal('entropy_score', 6, 4);
            $table->string('market_state', 50);
            $table->timestamp('calculated_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cluster_metrics');
    }
};
