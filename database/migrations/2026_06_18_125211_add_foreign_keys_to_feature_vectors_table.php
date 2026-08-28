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
        Schema::table('feature_vectors', function (Blueprint $table) {
            $table->foreign(['symbol_id'], 'feature_vectors_ibfk_1')->references(['id'])->on('symbols')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['feature_set_id'], 'feature_vectors_ibfk_2')->references(['id'])->on('feature_sets')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('feature_vectors', function (Blueprint $table) {
            $table->dropForeign('feature_vectors_ibfk_1');
            $table->dropForeign('feature_vectors_ibfk_2');
        });
    }
};
