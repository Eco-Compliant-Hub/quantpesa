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
        Schema::create('accounts', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('user_id')->index('user_id');
            $table->integer('provider_id')->index('provider_id');
            $table->integer('account_type_id')->index('account_type_id');
            $table->text('api_token_encrypted');
            $table->string('broker_account_id', 100)->nullable();
            $table->decimal('balance_cache', 15)->nullable();
            $table->string('currency', 10)->default('USD');
            $table->string('connection_status', 20)->default('disconnected');
            $table->timestamp('last_heartbeat_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
