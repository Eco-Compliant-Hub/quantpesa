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
        Schema::create('daily_summaries', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('user_id');
            $table->date('summary_date');
            $table->unsignedInteger('total_trades')->default(0);
            $table->unsignedInteger('total_wins')->default(0);
            $table->unsignedInteger('total_losses')->default(0);
            $table->decimal('total_stake', 12)->default(0);
            $table->decimal('total_pnl', 12)->default(0);

            $table->unique(['user_id', 'summary_date'], 'unique_user_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('daily_summaries');
    }
};
