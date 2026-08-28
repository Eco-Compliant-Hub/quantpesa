<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->integer('configuration_id')->nullable()->change();
        });

        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->foreign('configuration_id')
                  ->references('id')->on('bot_configurations')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->dropForeign(['configuration_id']);
        });

        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->bigInteger('configuration_id')->unsigned()->nullable()->change();
        });
    }
};