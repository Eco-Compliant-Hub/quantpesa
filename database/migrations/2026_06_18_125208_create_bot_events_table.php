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
        Schema::create('bot_events', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('bot_id');
            $table->integer('session_id')->nullable()->index('session_id');
            $table->string('event_type', 50);
            $table->json('payload')->nullable();
            $table->timestamp('occurred_at')->useCurrent();

            $table->index(['bot_id', 'occurred_at'], 'idx_bot_occurred');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bot_events');
    }
};
