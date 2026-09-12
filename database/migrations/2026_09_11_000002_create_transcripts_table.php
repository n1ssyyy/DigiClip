<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transcripts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('model');
            $table->string('lang', 12)->default('en');
            $table->longText('full_text')->nullable();
            $table->longText('words_json')->nullable();
            $table->longText('segments_json')->nullable();
            $table->float('conf_avg')->nullable();
            $table->string('status')->default('done');
            $table->timestamps();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->string('error', 500)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transcripts');
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('error');
        });
    }
};
