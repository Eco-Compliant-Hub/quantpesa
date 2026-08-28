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
        Schema::create('leaderboard_history', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('provider_id');
            $table->date('rank_date');
            $table->unsignedInteger('rank_position');
            $table->decimal('performance_score', 6, 3);
            $table->unsignedInteger('total_followers');

            $table->unique(['provider_id', 'rank_date'], 'unique_provider_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leaderboard_history');
    }
};
