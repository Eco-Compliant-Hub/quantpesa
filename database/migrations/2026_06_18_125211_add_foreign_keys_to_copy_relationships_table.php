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
        Schema::table('copy_relationships', function (Blueprint $table) {
            $table->foreign(['follower_id'], 'copy_relationships_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['provider_id'], 'copy_relationships_ibfk_2')->references(['user_id'])->on('strategy_providers')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('copy_relationships', function (Blueprint $table) {
            $table->dropForeign('copy_relationships_ibfk_1');
            $table->dropForeign('copy_relationships_ibfk_2');
        });
    }
};
