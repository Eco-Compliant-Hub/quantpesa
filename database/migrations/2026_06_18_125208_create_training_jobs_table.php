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
        Schema::create('training_jobs', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('model_id')->index('model_id');
            $table->string('status', 20)->default('queued');
            $table->timestamp('training_data_from')->nullable();
            $table->timestamp('training_data_to')->nullable();
            $table->decimal('accuracy_score', 5, 4)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('training_jobs');
    }
};
