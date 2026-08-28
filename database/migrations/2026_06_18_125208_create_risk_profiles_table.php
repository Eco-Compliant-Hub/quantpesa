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
        Schema::create('risk_profiles', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('user_id')->unique('unique_user_id');
            $table->decimal('max_daily_loss', 10)->default(100);
            $table->decimal('max_stake_per_trade', 10)->default(50);
            $table->decimal('stop_loss_pct', 5)->default(20);
            $table->unsignedSmallInteger('max_concurrent_bots')->default(3);
            $table->unsignedInteger('cooling_off_minutes')->default(0);
            $table->timestamp('updated_at')->useCurrentOnUpdate()->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('risk_profiles');
    }
};
