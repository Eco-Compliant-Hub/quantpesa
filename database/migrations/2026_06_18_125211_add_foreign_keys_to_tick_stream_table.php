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
        Schema::table('tick_stream', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'tick_stream_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tick_stream', function (Blueprint $table) {
            $table->dropForeign('tick_stream_ibfk_1');
        });
    }
};
