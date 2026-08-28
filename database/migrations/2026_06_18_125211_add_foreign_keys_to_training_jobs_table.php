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
        Schema::table('training_jobs', function (Blueprint $table) {
            $table->foreign(['model_id'], 'training_jobs_ibfk_1')->references(['id'])->on('ai_models')->onUpdate('restrict')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('training_jobs', function (Blueprint $table) {
            $table->dropForeign('training_jobs_ibfk_1');
        });
    }
};
