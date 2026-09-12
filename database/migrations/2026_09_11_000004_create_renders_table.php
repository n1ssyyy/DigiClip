<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('renders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clip_candidate_id')->constrained()->cascadeOnDelete();
            $table->string('preset', 20)->default('tiktok');
            $table->string('ass_path')->nullable();
            $table->string('srt_path')->nullable();
            $table->string('mp4_path')->nullable();
            $table->string('encoder', 30)->nullable();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('status', 20)->default('queued');
            $table->string('error', 500)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('renders');
    }
};
