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
        Schema::create('system_health', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('service_name', 100);
            $table->string('status', 20)->default('healthy');
            $table->decimal('cpu_pct', 5)->nullable();
            $table->decimal('memory_pct', 5)->nullable();
            $table->timestamp('checked_at')->useCurrent();

            $table->index(['service_name', 'checked_at'], 'idx_service_checked');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_health');
    }
};
