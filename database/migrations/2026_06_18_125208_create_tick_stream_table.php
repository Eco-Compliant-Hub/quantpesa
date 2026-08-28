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
        Schema::create('tick_stream', function (Blueprint $table) {
            $table->integer('tick_id', true);
            $table->integer('symbol_id');
            $table->timestamp('received_at')->useCurrent();
            $table->decimal('raw_price', 12, 5);
            $table->unsignedTinyInteger('last_digit');
            $table->string('source', 20)->default('deriv_ws');

            $table->index(['symbol_id', 'received_at'], 'tick_symbol_time_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tick_stream');
    }
};
