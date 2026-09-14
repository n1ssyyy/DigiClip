<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'app' => [
                'name' => config('app.name', 'DigiClip'),
            ],
            // Device owner's login for the onboarding greeting.
            // Null when unresolvable (frontend falls back to nameless).
            'username' => \App\Services\System\DeviceUser::name(),
        ];
    }
}
