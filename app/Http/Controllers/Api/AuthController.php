<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors()
            ], 422);
        }

        $email = strtolower($request->email);
        $lockKey = 'login_lockout:' . $email;
        $attemptsKey = 'login_attempts:' . $email;

        // Check if this account is currently locked out
        if (cache()->has($lockKey)) {
            return response()->json([
                'success' => false,
                'message' => 'Too many failed login attempts. This account is temporarily locked. Please try again in 15 minutes.',
            ], 429);
        }

        $user = User::where('email', $email)->first();

        if (!$user || !Hash::check($request->password, $user->password_hash)) {
            // Increment failed attempts, expires after 15 minutes of no activity
            $attempts = cache()->get($attemptsKey, 0) + 1;
            cache()->put($attemptsKey, $attempts, now()->addMinutes(15));

            if ($attempts >= 5) {
                // Lock the account for 15 minutes
                cache()->put($lockKey, true, now()->addMinutes(15));
                cache()->forget($attemptsKey);

                return response()->json([
                    'success' => false,
                    'message' => 'Too many failed login attempts. This account is temporarily locked. Please try again in 15 minutes.',
                ], 429);
            }

            return response()->json([
                'success' => false,
                'message' => 'Invalid email or password.',
                'attempts_remaining' => 5 - $attempts,
            ], 401);
        }

        // Successful login — clear any failed attempt history
        cache()->forget($attemptsKey);
        cache()->forget($lockKey);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
    'success' => true,
    'message' => 'Login successful.',
    'token'   => $token,
    'user_id' => $user->id,
    'status'  => $user->status,
], 200);
    }


    
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully.',
        ], 200);
    }
}