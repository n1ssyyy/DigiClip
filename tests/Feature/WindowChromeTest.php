<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Custom frameless titlebar endpoints (WindowController).
 * Outside the native runtime the Electron bridge is absent, the actions
 * must degrade to a silent no-op (204), never a 500.
 */
class WindowChromeTest extends TestCase
{
    public function test_window_actions_answer_no_content(): void
    {
        foreach (['minimize', 'maximize', 'unmaximize', 'close'] as $action) {
            $this->post("/native/window/{$action}")->assertNoContent();
        }
    }
}
