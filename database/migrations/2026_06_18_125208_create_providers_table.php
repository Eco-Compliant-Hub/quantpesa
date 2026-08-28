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
        Schema::create('providers', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('name', 100)->unique('unique_name');
            $table->string('slug', 50)->unique('unique_slug');
            $table->string('api_base_url', 500)->nullable();
            $table->string('ws_url', 500)->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('supported_markets')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('providers');
    }
};
