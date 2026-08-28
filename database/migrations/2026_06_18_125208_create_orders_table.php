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
        Schema::create('orders', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('user_id')->index('user_id');
            $table->integer('account_id')->index('account_id');
            $table->integer('bot_session_id')->nullable()->index('bot_session_id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->integer('contract_type_id')->index('contract_type_id');
            $table->integer('ensemble_prediction_id')->nullable()->index('ensemble_prediction_id');
            $table->decimal('stake', 10);
            $table->unsignedSmallInteger('duration_ticks')->default(5);
            $table->string('barrier', 10)->nullable();
            $table->string('status', 20)->default('pending');
            $table->decimal('payout', 10)->nullable();
            $table->string('broker_contract_id', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
