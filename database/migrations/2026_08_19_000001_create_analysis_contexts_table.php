<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analysis_contexts', function (Blueprint $table) {
            // This schema's real convention is a signed INT primary key
            // (see users.id, symbols.id), not Laravel's default BIGINT
            // UNSIGNED. integer(..., true) already adds the primary key.
            $table->integer('id', true);

            $table->integer('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();

            $table->integer('symbol_id');
            $table->foreign('symbol_id')->references('id')->on('symbols');

            $table->unsignedInteger('lookback');

            $table->string('state');
            $table->string('evidence_quality');
            $table->json('evidence');
            $table->json('snapshot');

            $table->timestamp('captured_at');
            $table->timestamps();

            $table->index(['user_id', 'captured_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analysis_contexts');
    }
};