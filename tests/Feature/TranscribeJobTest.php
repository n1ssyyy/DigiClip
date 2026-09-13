<?php

namespace Tests\Feature;

use App\Jobs\TranscribeJob;
use Tests\TestCase;

class TranscribeJobTest extends TestCase
{
    public function test_timeout_tiers_scale_with_model_size(): void
    {
        // Small weights finish in minutes; the "best" (GB-scale) weights
        // need hours on CPU. Tiers must cover the worker's 4h ceiling.
        $this->assertSame(1800, TranscribeJob::timeoutForModel('tiny.en'));
        $this->assertSame(1800, TranscribeJob::timeoutForModel('base.en'));
        $this->assertSame(7200, TranscribeJob::timeoutForModel('large-v3-turbo-q5_0'));
        $this->assertSame(14400, TranscribeJob::timeoutForModel('large-v3-turbo'));
        $this->assertSame(14400, TranscribeJob::timeoutForModel('large-v3'));
        $this->assertSame(1800, TranscribeJob::timeoutForModel('unknown-id'));
        $this->assertSame(1800, TranscribeJob::timeoutForModel(null));
    }

    public function test_worker_timeout_covers_largest_tier(): void
    {
        // The worker SIGKILLs past $timeout (re-reserved jobs die as
        // "attempted too many times"), so the static ceiling must be at
        // least the largest per-model tier.
        $job = new TranscribeJob(1);

        $this->assertGreaterThanOrEqual(TranscribeJob::timeoutForModel('large-v3'), $job->timeout);
        $this->assertSame(1, $job->tries);
    }
}
