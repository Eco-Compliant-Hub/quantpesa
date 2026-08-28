<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->integer('analysis_context_id')->nullable();
            $table->foreign('analysis_context_id')->references('id')->on('analysis_contexts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bot_sessions', function (Blueprint $table) {
            $table->dropForeign(['analysis_context_id']);
            $table->dropColumn('analysis_context_id');
        });
    }
};