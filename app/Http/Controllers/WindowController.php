<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;
use Native\Desktop\Facades\Window;

/**
 * Backend for the custom frameless titlebar (see Titlebar.jsx).
 *
 * NativePHP v2 exposes no JS window-control API to the renderer, so the
 * titlebar buttons POST here and we drive the Electron window server-side.
 * Every action is wrapped: outside the native runtime (plain browser dev,
 * tests) the Electron API bridge is absent, so we swallow the failure and
 * still answer 204 — window controls are a no-op on the web.
 */
class WindowController extends Controller
{
    public function minimize(): Response
    {
        $this->attempt(fn () => Window::minimize());

        return response()->noContent();
    }

    public function maximize(): Response
    {
        $this->attempt(fn () => Window::maximize());

        return response()->noContent();
    }

    public function unmaximize(): Response
    {
        $this->attempt(fn () => Window::unmaximize());

        return response()->noContent();
    }

    public function close(): Response
    {
        $this->attempt(fn () => Window::close());

        return response()->noContent();
    }

    private function attempt(callable $action): void
    {
        try {
            $action();
        } catch (\Throwable) {
            // Not running inside Electron (browser dev / tests) — ignore.
        }
    }
}
