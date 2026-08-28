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
        Schema::create('feature_sets', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('name', 100)->unique('unique_name');
            $table->text('description')->nullable();
            $table->json('feature_list');
            $table->string('version', 20)->default('v1.0');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('feature_sets');
    }
};
