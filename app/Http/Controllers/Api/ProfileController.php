<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        $profile = DB::table('profile')
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$profile) {
            return response()->json([
                'success' => false,
                'message' => 'Profile not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'profile' => $profile,
        ], 200);
    }

    public function update(Request $request)
    {
        $request->validate([
            'display_name' => 'sometimes|string|max:255',
            'avatar_url'   => 'sometimes|string|max:500',
            'country'      => 'sometimes|string|max:100',
            'bio'          => 'sometimes|string',
        ]);

        $existing = DB::table('profile')
            ->where('user_id', $request->user()->id)
            ->first();

        $data = array_filter([
            'display_name' => $request->display_name,
            'avatar_url'   => $request->avatar_url,
            'country'      => $request->country,
            'bio'          => $request->bio,
        ], fn($value) => !is_null($value));

        if ($existing) {
            DB::table('profile')
                ->where('user_id', $request->user()->id)
                ->update($data);
        } else {
            $data['user_id'] = $request->user()->id;
            DB::table('profile')->insert($data);
        }

        $profile = DB::table('profile')
            ->where('user_id', $request->user()->id)
            ->first();

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'profile' => $profile,
        ], 200);
    }
}