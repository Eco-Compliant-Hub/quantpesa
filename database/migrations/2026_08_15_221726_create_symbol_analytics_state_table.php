<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('symbol_analytics_state', function (Blueprint $table) {
            // symbols.id is a signed INT (see create_symbols_table), not
            // BIGINT UNSIGNED. MySQL rejects the FK unless the types match.
            $table->integer('symbol_id')->primary();
            $table->unsignedBigInteger('last_processed_tick_id')->nullable();
            $table->timestamp('last_run_at')->nullable();

            $table->unsignedTinyInteger('open_run_digit')->nullable();
            $table->unsignedBigInteger('open_run_start_tick_id')->nullable();
            $table->unsignedInteger('open_run_length')->default(0);

            $table->foreign('symbol_id')->references('id')->on('symbols')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('symbol_analytics_state');
    }
};