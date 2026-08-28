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
        Schema::create('ai_models', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('name', 100);
            $table->string('version', 20)->default('v1.0');
            $table->string('status', 20)->default('active');
            $table->decimal('weight', 4, 3);
            $table->timestamp('last_trained_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_models');
    }
};
