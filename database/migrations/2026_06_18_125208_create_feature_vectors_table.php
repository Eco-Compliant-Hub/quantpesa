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
        Schema::create('feature_vectors', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id')->index('symbol_id');
            $table->integer('feature_set_id')->index('feature_set_id');
            $table->json('vector_data');
            $table->string('label', 20)->nullable();
            $table->timestamp('captured_at')->useCurrent()->index('idx_captured_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('feature_vectors');
    }
};
