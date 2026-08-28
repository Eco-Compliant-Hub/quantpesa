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
        Schema::create('users', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('email')->unique('email');
            $table->string('password_hash');
            $table->string('status', 50)->default('active');
            $table->boolean('email_verified')->default(false);
            $table->string('totp_secret', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('last_login_at')->nullable();

            $table->unique(['email'], 'unique_email');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
