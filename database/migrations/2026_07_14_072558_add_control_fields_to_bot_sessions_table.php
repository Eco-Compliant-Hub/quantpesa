<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->enum('status', ['idle', 'running', 'paused', 'stopped', 'error'])->default('idle')->after('configuration_id');
            $table->enum('control_command', ['none', 'pause', 'stop', 'resume'])->default('none')->after('status');
            $table->decimal('stake_current', 12, 2)->nullable()->after('control_command');
            $table->unsignedInteger('loss_streak')->default(0)->after('stake_current');
            $table->unsignedBigInteger('last_tick_processed')->nullable()->after('loss_streak');
        });
    }

    public function down(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->dropColumn(['status', 'control_command', 'stake_current', 'loss_streak', 'last_tick_processed']);
        });
    }
};