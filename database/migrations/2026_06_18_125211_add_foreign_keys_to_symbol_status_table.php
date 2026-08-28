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
        Schema::table('symbol_status', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'symbol_status_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('symbol_status', function (Blueprint $table) {
            $table->dropForeign('symbol_status_ibfk_1');
        });
    }
};
