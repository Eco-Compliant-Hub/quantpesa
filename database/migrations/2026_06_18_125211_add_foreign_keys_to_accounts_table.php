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
        Schema::table('accounts', function (Blueprint $table) {
            $table->foreign(['user_id'], 'accounts_ibfk_1')->references(['id'])->on('users')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['provider_id'], 'accounts_ibfk_2')->references(['id'])->on('providers')->onUpdate('restrict')->onDelete('restrict');
            $table->foreign(['account_type_id'], 'accounts_ibfk_3')->references(['id'])->on('account_types')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropForeign('accounts_ibfk_1');
            $table->dropForeign('accounts_ibfk_2');
            $table->dropForeign('accounts_ibfk_3');
        });
    }
};
