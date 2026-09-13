<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Services\Notifications\Notifier;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** Latest unread, oldest first so toasts stack in order. */
    public function index()
    {
        $items = Notification::unread()->latest()->take(20)->get()->reverse()->values();

        return response()->json([
            'notifications' => $items->map(fn (Notification $n) => [
                'id' => $n->id,
                'type' => $n->type,
                'title' => $n->title,
                'body' => $n->body,
                'data' => $n->data,
                'created_at' => $n->created_at?->toIso8601String(),
            ]),
        ]);
    }

    public function read(Request $request)
    {
        $ids = $request->validate(['ids' => ['required', 'array', 'max:50'], 'ids.*' => ['integer']])['ids'];
        Notification::whereIn('id', $ids)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function presence(Request $request, Notifier $notify)
    {
        $focused = $request->validate(['focused' => ['required', 'boolean']])['focused'];
        Notifier::heartbeat($focused);

        return response()->json(['ok' => true, 'focused' => Notifier::focused()]);
    }
}
