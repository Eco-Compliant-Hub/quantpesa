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
        Schema::create('bot_sessions', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('bot_id')->index('bot_id');
            $table->integer('configuration_id')->index('configuration_id');
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('stopped_at')->nullable();
            $table->string('stop_reason', 50)->nullable();
            $table->unsignedInteger('total_trades')->default(0);
            $table->unsignedInteger('total_wins')->default(0);
            $table->unsignedInteger('total_losses')->default(0);
            $table->decimal('total_pnl', 12)->default(0);
            $table->decimal('peak_pnl', 12)->default(0);
            $table->decimal('max_drawdown', 12)->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bot_sessions');
    }
};
