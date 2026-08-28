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
        Schema::create('ensemble_predictions', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id')->index('symbol_id');
            $table->integer('snapshot_id')->index('snapshot_id');
            $table->timestamp('created_at')->useCurrent();
            $table->string('final_signal', 20);
            $table->decimal('final_probability', 5, 4);
            $table->decimal('confidence_score', 5, 4);
            $table->string('confidence_grade', 10);
            $table->text('explanation')->nullable();
            $table->json('model_breakdown')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ensemble_predictions');
    }
};
