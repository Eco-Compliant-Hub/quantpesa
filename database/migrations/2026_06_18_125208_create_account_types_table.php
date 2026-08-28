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
        Schema::create('account_types', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('provider_id')->index('provider_id');
            $table->string('name', 50);
            $table->string('currency', 10)->default('USD');
            $table->decimal('min_stake', 10)->default(0.35);
            $table->decimal('max_stake', 10)->default(50000);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('account_types');
    }
};
