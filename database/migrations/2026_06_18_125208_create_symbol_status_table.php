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
        Schema::create('symbol_status', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id')->unique('unique_symbol_id');
            $table->decimal('current_price', 12, 5)->nullable();
            $table->unsignedTinyInteger('last_digit')->nullable();
            $table->unsignedBigInteger('tick_count_today')->default(0);
            $table->timestamp('last_updated_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('symbol_status');
    }
};
