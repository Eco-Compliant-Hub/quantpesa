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
        Schema::create('bot_configurations', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('bot_id')->index('bot_id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->integer('contract_type_id')->index('contract_type_id');
            $table->unsignedTinyInteger('barrier_digit')->nullable();
            $table->string('entry_condition', 100)->default('always');
            $table->unsignedSmallInteger('tick_duration')->default(5);
            $table->unsignedSmallInteger('number_of_runs')->nullable();
            $table->decimal('stake_per_trade', 10);
            $table->decimal('stop_loss_amount', 10);
            $table->decimal('take_profit_amount', 10)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bot_configurations');
    }
};
