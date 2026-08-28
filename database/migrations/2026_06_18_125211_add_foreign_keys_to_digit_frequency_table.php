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
        Schema::table('digit_frequency', function (Blueprint $table) {
            $table->foreign(['snapshot_id'], 'digit_frequency_ibfk_1')->references(['id'])->on('snapshots')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['symbol_id'], 'digit_frequency_ibfk_2')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('digit_frequency', function (Blueprint $table) {
            $table->dropForeign('digit_frequency_ibfk_1');
            $table->dropForeign('digit_frequency_ibfk_2');
        });
    }
};
