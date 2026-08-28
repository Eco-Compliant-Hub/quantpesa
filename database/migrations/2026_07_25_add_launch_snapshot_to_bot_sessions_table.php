<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->integer('symbol_id')->nullable()->after('process_id');
            $table->integer('contract_type_id')->nullable()->after('symbol_id');
            $table->decimal('initial_stake', 10)->nullable()->after('contract_type_id');
            $table->decimal('stop_loss_amount', 10)->nullable()->after('initial_stake');
            $table->decimal('take_profit_amount', 10)->nullable()->after('stop_loss_amount');
            $table->unsignedInteger('bot_version')->nullable()->after('take_profit_amount');
            $table->string('bot_source', 20)->nullable()->after('bot_version');

            $table->foreign('symbol_id')->references('id')->on('symbols')->onDelete('restrict');
            $table->foreign('contract_type_id')->references('id')->on('contract_types')->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->dropForeign(['symbol_id']);
            $table->dropForeign(['contract_type_id']);
            $table->dropColumn([
                'symbol_id', 'contract_type_id', 'initial_stake',
                'stop_loss_amount', 'take_profit_amount', 'bot_version', 'bot_source',
            ]);
        });
    }
};
