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
        Schema::table('connection_logs', function (Blueprint $table) {
            $table->foreign(['account_id'], 'connection_logs_ibfk_1')->references(['id'])->on('accounts')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('connection_logs', function (Blueprint $table) {
            $table->dropForeign('connection_logs_ibfk_1');
        });
    }
};
