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
        Schema::table('bot_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('bot_templates', 'raw_xml')) {
                $table->text('raw_xml')->nullable()->after('description');
            }
            if (!Schema::hasColumn('bot_templates', 'parsed_ast')) {
                $table->longText('parsed_ast')->nullable()->after('raw_xml');
            }
            if (!Schema::hasColumn('bot_templates', 'source')) {
                $table->string('source')->nullable()->after('parsed_ast');
            }
            if (!Schema::hasColumn('bot_templates', 'status')) {
                $table->enum('status', ['draft', 'tested', 'deployed', 'retracted'])
                      ->default('draft')->after('is_active');
            }
            if (!Schema::hasColumn('bot_templates', 'created_by')) {
                $table->integer('created_by')->nullable()->after('status');
            }
            if (!Schema::hasColumn('bot_templates', 'created_at')) {
                $table->timestamp('created_at')->nullable()->after('created_by');
            }
        });
    
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bot_templates', function (Blueprint $table) {
            $table->dropColumn(['raw_xml', 'parsed_ast', 'source', 'status', 'created_by', 'created_at']);
        });
    }
};
