<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class BillingController extends Controller
{
    // ─────────────────────────────────────────
    // LIST ALL PLANS
    // ─────────────────────────────────────────
    public function plans()
    {
        $plans = DB::table('plans')
            ->where('is_active', 1)
            ->orderBy('monthly_price')
            ->get(['id', 'name', 'monthly_price', 'features']);

        // Decode features JSON for each plan
        $plans = $plans->map(function ($plan) {
            $plan->features = json_decode($plan->features, true);
            return $plan;
        });

        return response()->json([
            'success' => true,
            'plans'   => $plans,
        ]);
    }

    // ─────────────────────────────────────────
    // MY CURRENT SUBSCRIPTION
    // ─────────────────────────────────────────
    public function mySubscription()
    {
        $userId = Auth::id();

        $subscription = DB::table('subscriptions')
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->where('subscriptions.user_id', $userId)
            ->where('subscriptions.status', 'active')
            ->first([
                'subscriptions.id',
                'subscriptions.status',
                'subscriptions.started_at',
                'subscriptions.expires_at',
                'plans.name as plan_name',
                'plans.monthly_price',
                'plans.features',
            ]);

        if (!$subscription) {
            return response()->json([
                'success'      => true,
                'subscription' => null,
                'message'      => 'No active subscription.',
            ]);
        }

        $subscription->features = json_decode($subscription->features, true);

        return response()->json([
            'success'      => true,
            'subscription' => $subscription,
        ]);
    }

    // ─────────────────────────────────────────
    // SUBSCRIBE TO A PLAN
    // ─────────────────────────────────────────
    public function subscribe(Request $request)
    {
        $request->validate([
            'plan_id' => 'required|integer',
        ]);

        $userId = Auth::id();

        $plan = DB::table('plans')
            ->where('id', $request->plan_id)
            ->where('is_active', 1)
            ->first();

        if (!$plan) {
            return response()->json([
                'success' => false,
                'message' => 'Plan not found or inactive.',
            ], 404);
        }

        // Check if already subscribed
        $existing = DB::table('subscriptions')
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'You already have an active subscription. Cancel it first.',
            ], 409);
        }

        // Create subscription
        $subscriptionId = DB::table('subscriptions')->insertGetId([
            'user_id'    => $userId,
            'plan_id'    => $plan->id,
            'status'     => 'active',
            'started_at' => now(),
            'expires_at' => now()->addMonth(),
        ]);

        // Create invoice
        DB::table('invoices')->insert([
            'subscription_id' => $subscriptionId,
            'amount'          => $plan->monthly_price,
            'currency'        => 'USD',
            'status'          => 'pending',
            'issued_at'       => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Subscribed to {$plan->name} successfully.",
        ], 201);
    }

    // ─────────────────────────────────────────
    // CANCEL SUBSCRIPTION
    // ─────────────────────────────────────────
    public function cancel()
    {
        $userId = Auth::id();

        $subscription = DB::table('subscriptions')
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->first();

        if (!$subscription) {
            return response()->json([
                'success' => false,
                'message' => 'No active subscription found.',
            ], 404);
        }

        DB::table('subscriptions')
            ->where('id', $subscription->id)
            ->update(['status' => 'cancelled']);

        return response()->json([
            'success' => true,
            'message' => 'Subscription cancelled.',
        ]);
    }

    // ─────────────────────────────────────────
    // MY INVOICES
    // ─────────────────────────────────────────
    public function myInvoices()
    {
        $userId = Auth::id();

        $invoices = DB::table('invoices')
            ->join('subscriptions', 'invoices.subscription_id', '=', 'subscriptions.id')
            ->where('subscriptions.user_id', $userId)
            ->orderByDesc('invoices.issued_at')
            ->get([
                'invoices.id',
                'invoices.amount',
                'invoices.currency',
                'invoices.status',
                'invoices.issued_at',
                'invoices.paid_at',
            ]);

        return response()->json([
            'success'  => true,
            'invoices' => $invoices,
        ]);
    }

    // ─────────────────────────────────────────
    // ADD PAYMENT METHOD
    // ─────────────────────────────────────────
    public function addPaymentMethod(Request $request)
    {
        $request->validate([
            'provider'  => 'required|string|max:50',
            'token'     => 'required|string|max:255',
            'last_four' => 'nullable|string|size:4',
        ]);

        $userId = Auth::id();

        // If first payment method, set as default
        $count = DB::table('payment_methods')
            ->where('user_id', $userId)
            ->count();

        DB::table('payment_methods')->insert([
            'user_id'    => $userId,
            'provider'   => $request->provider,
            'token'      => $request->token,
            'last_four'  => $request->last_four,
            'is_default' => $count === 0 ? 1 : 0,
            'created_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment method added.',
        ], 201);
    }

    // ─────────────────────────────────────────
    // LIST MY PAYMENT METHODS
    // ─────────────────────────────────────────
    public function myPaymentMethods()
    {
        $userId = Auth::id();

        $methods = DB::table('payment_methods')
            ->where('user_id', $userId)
            ->orderByDesc('is_default')
            ->get(['id', 'provider', 'last_four', 'is_default', 'created_at']);

        return response()->json([
            'success' => true,
            'methods' => $methods,
        ]);
    }

    // ─────────────────────────────────────────
    // REMOVE PAYMENT METHOD
    // ─────────────────────────────────────────
    public function removePaymentMethod($id)
    {
        $userId = Auth::id();

        $method = DB::table('payment_methods')
            ->where('id', $id)
            ->where('user_id', $userId)
            ->first();

        if (!$method) {
            return response()->json([
                'success' => false,
                'message' => 'Payment method not found.',
            ], 404);
        }

        DB::table('payment_methods')->where('id', $id)->delete();

        // If deleted method was default, set next one as default
        if ($method->is_default) {
            $next = DB::table('payment_methods')
                ->where('user_id', $userId)
                ->first();

            if ($next) {
                DB::table('payment_methods')
                    ->where('id', $next->id)
                    ->update(['is_default' => 1]);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Payment method removed.',
        ]);
    }
}