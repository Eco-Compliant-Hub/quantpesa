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
        Schema::create('snapshots', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id');
            $table->integer('window_id')->index('window_id');
            $table->timestamp('calculated_at')->useCurrent();

            $table->index(['symbol_id', 'calculated_at'], 'idx_symbol_calculated');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('snapshots');
    }
};
