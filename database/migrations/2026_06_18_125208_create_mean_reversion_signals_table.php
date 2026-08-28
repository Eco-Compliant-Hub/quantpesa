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
        Schema::create('mean_reversion_signals', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('snapshot_id')->index('snapshot_id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->unsignedTinyInteger('digit');
            $table->decimal('deviation_pct', 6);
            $table->decimal('signal_strength', 5, 4);
            $table->string('direction', 10);
            $table->timestamp('calculated_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mean_reversion_signals');
    }
};
