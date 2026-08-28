<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    public function forgot(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', strtolower($request->email))->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'No account found with that email.',
            ], 404);
        }

        // Delete any existing token
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();

        // Generate the raw token (this is what we send to the user)
        $token = Str::random(64);

        // Store only the HASHED version — raw token is never saved
        DB::table('password_reset_tokens')->insert([
            'email'      => $user->email,
            'token'      => hash('sha256', $token),
            'expires_at' => now()->addHour(),
        ]);

        // Log the RAW token (since MAIL_MAILER=log) — this is fine for dev,
        // but in production this should go through a real mail provider, not the log file
        Mail::raw("Your password reset token is: {$token}", function ($message) use ($user) {
            $message->to($user->email)->subject('Reset your QuantPesa password');
        });

        return response()->json([
            'success' => true,
            'message' => 'Password reset token sent to your email.',
        ], 200);
    }

    public function reset(Request $request)
    {
        $request->validate([
            'token'    => 'required|string',
            'password' => 'required|min:8|confirmed',
        ]);

        // Hash the incoming token the same way, then compare hashes
        $hashedToken = hash('sha256', $request->token);

        $record = DB::table('password_reset_tokens')
            ->where('token', $hashedToken)
            ->first();

        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid token.',
            ], 400);
        }

        if (now()->greaterThan($record->expires_at)) {
            DB::table('password_reset_tokens')->where('token', $hashedToken)->delete();

            return response()->json([
                'success' => false,
                'message' => 'Token has expired.',
            ], 400);
        }

        // Update password
        User::where('email', $record->email)->update([
            'password_hash' => Hash::make($request->password),
        ]);

        // Delete the token
        DB::table('password_reset_tokens')->where('token', $hashedToken)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully.',
        ], 200);
    }
}