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
        Schema::create('tick_buffer', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->decimal('raw_price', 12, 5);
            $table->timestamp('received_at')->useCurrent();
            $table->boolean('processed')->default(false)->index('idx_processed');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tick_buffer');
    }
};
