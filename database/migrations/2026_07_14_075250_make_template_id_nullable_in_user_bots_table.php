<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_bots', function (Blueprint $table) {
            $table->integer('template_id')->nullable()->change();
        });

        Schema::table('user_bots', function (Blueprint $table) {
            $table->foreign('template_id')
                ->references('id')->on('bot_templates')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_bots', function (Blueprint $table) {
            $table->dropForeign(['template_id']);
        });

        Schema::table('user_bots', function (Blueprint $table) {
            $table->integer('template_id')->nullable(false)->change();
        });

        Schema::table('user_bots', function (Blueprint $table) {
            $table->foreign('template_id')
                ->references('id')->on('bot_templates');
        });
    }
};