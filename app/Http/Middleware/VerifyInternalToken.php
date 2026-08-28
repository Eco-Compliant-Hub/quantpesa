<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyInternalToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $providedToken = $request->bearerToken();
        $expectedToken = config('app.internal_api_token');

        if (!$expectedToken || !$providedToken || !hash_equals($expectedToken, $providedToken)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or missing internal API token.',
            ], 401);
        }

        return $next($request);
    }
}
