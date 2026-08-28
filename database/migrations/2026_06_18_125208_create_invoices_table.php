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
        Schema::create('invoices', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('subscription_id')->index('subscription_id');
            $table->decimal('amount', 10);
            $table->string('currency', 10)->default('USD');
            $table->string('status', 20)->default('pending');
            $table->string('provider_invoice_id', 100)->nullable();
            $table->timestamp('issued_at')->useCurrent();
            $table->timestamp('paid_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
