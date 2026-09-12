<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clip_candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('rank')->default(1);
            $table->float('start_s');
            $table->float('end_s');
            $table->string('hook_line', 200)->default('');
            $table->string('why_it_works', 500)->default('');
            $table->json('scores')->nullable();
            $table->unsignedInteger('score_total')->default(0);
            $table->string('title', 150)->default('');
            $table->json('hashtags')->nullable();
            $table->string('caption_style', 20)->default('tiktok');
            $table->string('source', 20)->default('llm');
            $table->string('status', 20)->default('proposed');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clip_candidates');
    }
};
