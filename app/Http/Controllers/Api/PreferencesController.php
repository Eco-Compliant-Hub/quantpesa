<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PreferencesController extends Controller
{
    public function show(Request $request)
    {
        $preferences = DB::table('preferences')
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$preferences) {
            return response()->json([
                'success' => false,
                'message' => 'Preferences not found.',
            ], 404);
        }

        return response()->json([
            'success'     => true,
            'preferences' => $preferences,
        ], 200);
    }

    public function update(Request $request)
    {
        $request->validate([
            'theme'                  => 'sometimes|string|in:dark,light',
            'default_symbol'         => 'sometimes|string|max:50',
            'notifications_enabled'  => 'sometimes|boolean',
            'custom_settings'        => 'sometimes|array',
        ]);

        $existing = DB::table('preferences')
            ->where('user_id', $request->user()->id)
            ->first();

        $data = array_filter([
            'theme'                 => $request->theme,
            'default_symbol'        => $request->default_symbol,
            'notifications_enabled' => $request->notifications_enabled,
            'custom_settings'       => $request->custom_settings
                ? json_encode($request->custom_settings)
                : null,
        ], fn($value) => !is_null($value));

        if ($existing) {
            DB::table('preferences')
                ->where('user_id', $request->user()->id)
                ->update($data);
        } else {
            $data['user_id'] = $request->user()->id;
            DB::table('preferences')->insert($data);
        }

        $preferences = DB::table('preferences')
            ->where('user_id', $request->user()->id)
            ->first();

        return response()->json([
            'success'     => true,
            'message'     => 'Preferences updated successfully.',
            'preferences' => $preferences,
        ], 200);
    }
}