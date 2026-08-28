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
        Schema::table('transition_matrices', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'transition_matrices_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('transition_matrices', function (Blueprint $table) {
            $table->dropForeign('transition_matrices_ibfk_1');
        });
    }
};
