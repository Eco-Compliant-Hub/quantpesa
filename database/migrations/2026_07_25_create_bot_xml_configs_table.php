<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bot_xml_configs', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('bot_id')->index();
            $table->integer('symbol_id')->index();
            $table->decimal('stake_per_trade', 10);
            $table->decimal('stop_loss_amount', 10);
            $table->decimal('take_profit_amount', 10)->nullable();
            $table->unsignedSmallInteger('number_of_runs')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('bot_id')->references('id')->on('user_bots')->onDelete('restrict');
            $table->foreign('symbol_id')->references('id')->on('symbols')->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bot_xml_configs');
    }
};