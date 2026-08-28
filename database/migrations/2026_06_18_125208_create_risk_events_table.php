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
        Schema::create('risk_events', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('user_id');
            $table->integer('bot_session_id')->nullable()->index('bot_session_id');
            $table->string('event_type', 50);
            $table->json('details')->nullable();
            $table->timestamp('triggered_at')->useCurrent();

            $table->index(['user_id', 'triggered_at'], 'idx_user_triggered');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('risk_events');
    }
};
