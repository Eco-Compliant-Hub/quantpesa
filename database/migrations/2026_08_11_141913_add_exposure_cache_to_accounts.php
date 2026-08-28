<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->decimal('cached_exposure', 12, 2)->nullable()->after('balance_cache');
            $table->string('cached_exposure_zone', 10)->nullable()->after('cached_exposure');
            $table->timestamp('exposure_synced_at')->nullable()->after('cached_exposure_zone');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn(['cached_exposure', 'cached_exposure_zone', 'exposure_synced_at']);
        });
    }
};
