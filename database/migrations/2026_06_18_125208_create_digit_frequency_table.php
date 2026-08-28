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
        Schema::create('digit_frequency', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('snapshot_id')->index('snapshot_id');
            $table->integer('symbol_id')->index('symbol_id');
            $table->unsignedTinyInteger('digit');
            $table->unsignedInteger('count');
            $table->decimal('percentage', 5);
            $table->timestamp('calculated_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('digit_frequency');
    }
};
