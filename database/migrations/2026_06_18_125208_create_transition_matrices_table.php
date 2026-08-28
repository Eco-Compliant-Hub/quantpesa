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
        Schema::create('transition_matrices', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('symbol_id');
            $table->unsignedTinyInteger('from_digit');
            $table->unsignedTinyInteger('to_digit');
            $table->unsignedInteger('transition_count')->default(0);
            $table->decimal('probability', 6, 5);
            $table->timestamp('calculated_at')->useCurrent();

            $table->unique(['symbol_id', 'from_digit', 'to_digit', 'calculated_at'], 'unique_transition');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('transition_matrices');
    }
};
