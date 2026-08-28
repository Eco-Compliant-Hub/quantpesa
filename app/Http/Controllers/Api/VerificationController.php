<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class VerificationController extends Controller
{
    public function send(Request $request)
    {
        $user = $request->user();

        if ($user->email_verified) {
            return response()->json([
                'success' => false,
                'message' => 'Email already verified.',
            ], 400);
        }

        // Delete any existing token
        DB::table('email_verification_tokens')->where('user_id', $user->id)->delete();

        // Generate new token
        $token = Str::random(64);

        DB::table('email_verification_tokens')->insert([
            'user_id'    => $user->id,
            'token'      => $token,
            'expires_at' => now()->addHours(24),
        ]);

        // Log the token (since MAIL_MAILER=log)
        Mail::raw("Your verification token is: {$token}", function ($message) use ($user) {
            $message->to($user->email)->subject('Verify your QuantPesa email');
        });

        return response()->json([
            'success' => true,
            'message' => 'Verification email sent.',
        ], 200);
    }

    public function verify(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
        ]);

        $record = DB::table('email_verification_tokens')
            ->where('token', $request->token)
            ->first();

        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid token.',
            ], 400);
        }

        if (now()->greaterThan($record->expires_at)) {
            return response()->json([
                'success' => false,
                'message' => 'Token has expired.',
            ], 400);
        }

        // Mark email as verified
        User::where('id', $record->user_id)->update(['email_verified' => 1]);

        // Delete the token
        DB::table('email_verification_tokens')->where('token', $request->token)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
        ], 200);
    }
}