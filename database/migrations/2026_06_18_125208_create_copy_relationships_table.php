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
        Schema::create('copy_relationships', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('follower_id');
            $table->integer('provider_id')->index('provider_id');
            $table->decimal('allocation_pct', 5)->default(100);
            $table->boolean('is_active')->default(true);
            $table->timestamp('started_at')->useCurrent();

            $table->unique(['follower_id', 'provider_id'], 'unique_follow');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('copy_relationships');
    }
};
