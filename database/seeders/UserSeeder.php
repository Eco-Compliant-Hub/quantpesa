<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Local login accounts. Shared password: Password123!
     *
     *   admin@quantpesa.test  — platform admin (Admin nav + catalog)
     *   trader@quantpesa.test — Pro trader
     *   demo@quantpesa.test   — Free-plan trader
     */
    public function run(): void
    {
        $passwordHash = Hash::make('Password123!');

        $accounts = [
            [
                'email'        => 'admin@quantpesa.com',
                'status'       => 'admin',
                'display_name' => 'QuantPesa Admin',
                'role'         => 'admin',
                'plan'         => 'Elite',
            ],
            [
                'email'        => 'trader@quantpesa.com',
                'status'       => 'active',
                'display_name' => 'Demo Trader',
                'role'         => 'trader',
                'plan'         => 'Pro',
            ],
            [
                'email'        => 'demo@quantpesa.com',
                'status'       => 'active',
                'display_name' => 'Free Demo',
                'role'         => 'trader',
                'plan'         => 'Free',
            ],
        ];

        foreach ($accounts as $account) {
            $userId = $this->upsertUser($account, $passwordHash);
            $this->upsertProfile($userId, $account['display_name']);
            $this->attachRole($userId, $account['role']);
            $this->attachPlan($userId, $account['plan']);
        }
    }

    private function upsertUser(array $account, string $passwordHash): int
    {
        $existing = DB::table('users')->where('email', $account['email'])->first();

        $payload = [
            'password_hash'  => $passwordHash,
            'status'         => $account['status'],
            'email_verified' => 1,
        ];

        if ($existing) {
            DB::table('users')->where('id', $existing->id)->update($payload);

            return (int) $existing->id;
        }

        $payload['email'] = $account['email'];
        $payload['created_at'] = now();

        return (int) DB::table('users')->insertGetId($payload);
    }

    private function upsertProfile(int $userId, string $displayName): void
    {
        DB::table('profile')->updateOrInsert(
            ['user_id' => $userId],
            ['display_name' => $displayName]
        );
    }

    private function attachRole(int $userId, string $roleName): void
    {
        $role = DB::table('roles')->where('name', $roleName)->first();

        if (!$role) {
            return;
        }

        DB::table('user_roles')->updateOrInsert(
            [
                'user_id' => $userId,
                'role_id' => $role->id,
            ],
            ['granted_at' => now()]
        );
    }

    private function attachPlan(int $userId, string $planName): void
    {
        $plan = DB::table('plans')->where('name', $planName)->first();

        if (!$plan) {
            return;
        }

        $existing = DB::table('subscriptions')
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->first();

        if ($existing) {
            DB::table('subscriptions')->where('id', $existing->id)->update([
                'plan_id'    => $plan->id,
                'started_at' => now(),
                'expires_at' => now()->addYear(),
            ]);

            return;
        }

        DB::table('subscriptions')->insert([
            'user_id'    => $userId,
            'plan_id'    => $plan->id,
            'status'     => 'active',
            'started_at' => now(),
            'expires_at' => now()->addYear(),
        ]);
    }
}
