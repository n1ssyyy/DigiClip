<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Native\Desktop\Facades\Shell;

/**
 * Links that must leave the app (GitHub, school site) open in the real
 * browser. No-op outside the native runtime: the frontend falls back
 * to a normal tab there.
 */
class LinkController extends Controller
{
    public function open(Request $request)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:500']]);
        if (! preg_match('#^https?://#i', $data['url'])) {
            abort(422, 'Only http(s) links leave the app.');
        }

        try {
            Shell::openExternal($data['url']);
        } catch (\Throwable) {
            // Plain browser dev without the shell bridge.
        }

        return response()->json(['ok' => true]);
    }
}
