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
        Schema::create('strategy_providers', function (Blueprint $table) {
            $table->integer('user_id')->primary();
            $table->string('display_name', 100);
            $table->decimal('performance_score', 6, 3)->default(0);
            $table->unsignedInteger('total_followers')->default(0);
            $table->boolean('verified')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('strategy_providers');
    }
};
