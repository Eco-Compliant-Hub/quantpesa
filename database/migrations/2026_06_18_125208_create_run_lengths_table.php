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
        Schema::create('run_lengths', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id')->index('symbol_id');
            $table->unsignedTinyInteger('digit');
            $table->unsignedInteger('run_length');
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('run_lengths');
    }
};
