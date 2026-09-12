<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->json('usage_json')->nullable()->after('error');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('usage_json');
        });
    }
};
