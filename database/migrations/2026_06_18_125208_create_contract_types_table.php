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
        Schema::create('contract_types', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('name', 50)->unique('unique_name');
            $table->string('description')->nullable();
            $table->decimal('base_payout', 6, 4);
            $table->decimal('win_probability', 5, 4);
            $table->boolean('requires_barrier')->default(false);
            $table->boolean('is_active')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('contract_types');
    }
};
