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
        Schema::create('model_predictions', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id')->index('symbol_id');
            $table->integer('model_id')->index('model_id');
            $table->integer('snapshot_id')->index('snapshot_id');
            $table->timestamp('generated_at')->useCurrent();
            $table->string('prediction_type', 50);
            $table->decimal('probability_over', 5, 4)->default(0);
            $table->decimal('probability_under', 5, 4)->default(0);
            $table->decimal('confidence', 5, 4)->default(0);
            $table->string('signal', 20);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('model_predictions');
    }
};
