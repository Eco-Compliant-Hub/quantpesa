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
        Schema::create('websocket_events', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('account_id')->nullable()->index('account_id');
            $table->string('event_type', 50);
            $table->string('symbol', 50)->nullable();
            $table->text('details')->nullable();
            $table->timestamp('occurred_at')->useCurrent()->index('idx_occurred_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('websocket_events');
    }
};
