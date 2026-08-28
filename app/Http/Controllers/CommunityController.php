<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class CommunityController extends Controller
{
    // ─────────────────────────────────────────
    // REGISTER AS SIGNAL PROVIDER
    // ─────────────────────────────────────────
    public function registerProvider(Request $request)
    {
        $request->validate([
            'display_name' => 'required|string|max:100',
        ]);

        $userId = Auth::id();

        $existing = DB::table('strategy_providers')
            ->where('user_id', $userId)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'You are already registered as a provider.',
            ], 409);
        }

        DB::table('strategy_providers')->insert([
            'user_id'           => $userId,
            'display_name'      => $request->display_name,
            'performance_score' => 0.000,
            'total_followers'   => 0,
            'verified'          => 0,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'You are now registered as a signal provider.',
        ]);
    }

    // ─────────────────────────────────────────
    // LEADERBOARD
    // ─────────────────────────────────────────
    public function leaderboard()
    {
        $providers = DB::table('strategy_providers')
            ->orderByDesc('performance_score')
            ->limit(50)
            ->get([
                'user_id',
                'display_name',
                'performance_score',
                'total_followers',
                'verified',
            ]);

        return response()->json([
            'success'   => true,
            'providers' => $providers,
        ]);
    }

    // ─────────────────────────────────────────
    // FOLLOW A PROVIDER
    // ─────────────────────────────────────────
    public function follow(Request $request, $providerId)
    {
        $followerId = Auth::id();

        if ($followerId == $providerId) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot follow yourself.',
            ], 422);
        }

        $providerExists = DB::table('strategy_providers')
            ->where('user_id', $providerId)
            ->exists();

        if (!$providerExists) {
            return response()->json([
                'success' => false,
                'message' => 'Provider not found.',
            ], 404);
        }

        $existing = DB::table('copy_relationships')
            ->where('follower_id', $followerId)
            ->where('provider_id', $providerId)
            ->first();

        if ($existing) {
            if ($existing->is_active) {
                return response()->json([
                    'success' => false,
                    'message' => 'You are already following this provider.',
                ], 409);
            }

            // Reactivate existing row instead of inserting a duplicate
            DB::table('copy_relationships')
                ->where('id', $existing->id)
                ->update([
                    'is_active'  => 1,
                    'started_at' => now(),
                ]);
        } else {
            DB::table('copy_relationships')->insert([
                'follower_id'    => $followerId,
                'provider_id'    => $providerId,
                'allocation_pct' => 100.00,
                'is_active'      => 1,
                'started_at'     => now(),
            ]);
        }

        DB::table('strategy_providers')
            ->where('user_id', $providerId)
            ->increment('total_followers');

        return response()->json([
            'success' => true,
            'message' => 'You are now following this provider.',
        ]);
    }

    // ─────────────────────────────────────────
    // UNFOLLOW A PROVIDER
    // ─────────────────────────────────────────
    public function unfollow($providerId)
    {
        $followerId = Auth::id();

        $relationship = DB::table('copy_relationships')
            ->where('follower_id', $followerId)
            ->where('provider_id', $providerId)
            ->where('is_active', 1)
            ->first();

        if (!$relationship) {
            return response()->json([
                'success' => false,
                'message' => 'You are not following this provider.',
            ], 404);
        }

        DB::table('copy_relationships')
            ->where('id', $relationship->id)
            ->update(['is_active' => 0]);

        // Decrement follower count (never below 0)
        DB::table('strategy_providers')
            ->where('user_id', $providerId)
            ->where('total_followers', '>', 0)
            ->decrement('total_followers');

        return response()->json([
            'success' => true,
            'message' => 'You have unfollowed this provider.',
        ]);
    }

    // ─────────────────────────────────────────
    // MARK ALERT AS READ
    // ─────────────────────────────────────────
    public function markAlertRead($alertId)
    {
        $followerId = Auth::id();

        $alert = DB::table('follower_alerts')
            ->where('id', $alertId)
            ->where('follower_id', $followerId)
            ->first();

        if (!$alert) {
            return response()->json([
                'success' => false,
                'message' => 'Alert not found.',
            ], 404);
        }

        DB::table('follower_alerts')
            ->where('id', $alertId)
            ->update(['is_read' => 1]);

        return response()->json([
            'success' => true,
            'message' => 'Alert marked as read.',
        ]);
    }


    // ─────────────────────────────────────────
    // MY FOLLOWING LIST
    // ─────────────────────────────────────────
    public function myFollowing()
    {
        $followerId = Auth::id();

        $following = DB::table('copy_relationships')
            ->join('strategy_providers', 'copy_relationships.provider_id', '=', 'strategy_providers.user_id')
            ->where('copy_relationships.follower_id', $followerId)
            ->where('copy_relationships.is_active', 1)
            ->get([
                'strategy_providers.user_id as provider_id',
                'strategy_providers.display_name',
                'strategy_providers.performance_score',
                'strategy_providers.verified',
                'copy_relationships.started_at',
            ]);

        return response()->json([
            'success'   => true,
            'following' => $following,
        ]);
    }

    // ─────────────────────────────────────────
// PROVIDER STATS
// ─────────────────────────────────────────
public function providerStats($providerId)
{
    $provider = DB::table('strategy_providers')
        ->where('user_id', $providerId)
        ->first();

    if (!$provider) {
        return response()->json([
            'success' => false,
            'message' => 'Provider not found.',
        ], 404);
    }

    return response()->json([
        'success'  => true,
        'provider' => $provider,
    ]);
}
}  

