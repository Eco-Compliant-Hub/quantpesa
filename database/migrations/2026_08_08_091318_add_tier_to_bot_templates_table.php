<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bot_templates', function (Blueprint $table) {
            $table->enum('tier', ['free', 'premium'])->default('free')->after('risk_level');
        });
    }

    public function down(): void
    {
        Schema::table('bot_templates', function (Blueprint $table) {
            $table->dropColumn('tier');
        });
    }
};