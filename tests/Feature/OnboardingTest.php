<?php

namespace Tests\Feature;

use App\Services\System\DeviceUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OnboardingTest extends TestCase
{
    use RefreshDatabase;

    public function test_device_user_name_never_throws_and_is_string_or_null(): void
    {
        $name = DeviceUser::name();
        $this->assertTrue($name === null || (is_string($name) && $name !== ''));
    }

    public function test_device_user_display_capitalizes_first_letter(): void
    {
        $this->assertSame('Nexaura', DeviceUser::display('nexaura'));
        $this->assertSame('A', DeviceUser::display('a'));
        $this->assertNull(DeviceUser::display(''));
        $this->assertNull(DeviceUser::display(null));
    }

    public function test_home_shares_username_prop(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Home')
                ->has('username'));
    }

    public function test_username_prop_matches_device_user(): void
    {
        $response = $this->get('/');
        $username = $response->viewData('page')['props']['username'] ?? null;
        $this->assertSame(DeviceUser::name(), $username);
    }
}
