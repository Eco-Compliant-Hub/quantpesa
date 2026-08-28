<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_bots', function (Blueprint $table) {
            $table->longText('raw_xml')->nullable()->after('bot_name');
            $table->json('parsed_ast')->nullable()->after('raw_xml');
            $table->enum('source', ['template', 'xml_upload'])->default('template')->after('parsed_ast');
            $table->unsignedInteger('version')->default(1)->after('source');
        });
    }

    public function down(): void
    {
        Schema::table('user_bots', function (Blueprint $table) {
            $table->dropColumn(['raw_xml', 'parsed_ast', 'source', 'version']);
        });
    }
};