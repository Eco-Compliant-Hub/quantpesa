<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Provider;
use App\Models\AccountType;
use App\Models\ConnectionLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BrokerController extends Controller
{
    // List all providers
    public function providers()
    {
        $providers = Provider::where('is_active', 1)->get();

        return response()->json([
            'success'   => true,
            'providers' => $providers,
        ]);
    }

    // List account types for a provider
    public function accountTypes($providerId)
    {
        $types = AccountType::where('provider_id', $providerId)->get();

        return response()->json([
            'success'       => true,
            'account_types' => $types,
        ]);
    }

    // Connect a broker account -- upserts: if this user already has an
    // account row for this exact broker_account_id + account_type, update
    // it in place instead of creating a duplicate row.
    public function connect(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'provider_id'        => 'required|exists:providers,id',
            'account_type_id'    => 'required|exists:account_types,id',
            'api_token'          => 'required|string',
            'currency'           => 'required|string|max:10',
            'broker_account_id'  => 'required|string|max:50',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors()
            ], 422);
        }

        $balance = null;
        try {
            $otpResponse = Http::withHeaders([
                'Deriv-App-ID'  => env('DERIV_APP_ID', '1089'),
                'Authorization' => 'Bearer ' . $request->api_token,
            ])->post("https://api.derivws.com/trading/v1/options/accounts/{$request->broker_account_id}/otp");

            if ($otpResponse->failed()) {
                $errorMessage = $otpResponse->json('error.message')
                    ?? $otpResponse->json('message')
                    ?? 'Deriv rejected this login ID or token.';

                Log::warning('[BrokerController] OTP request failed', [
                    'status' => $otpResponse->status(),
                    'body'   => $otpResponse->body(),
                ]);

                return response()->json([
                    'success' => false,
                    'message' => 'Deriv rejected this account: ' . $errorMessage,
                ], 422);
            }

            $wsUrl = $otpResponse->json('data.url');
            Log::info('[BrokerController] OTP succeeded, ws url received', ['has_url' => (bool) $wsUrl]);

            $derivIsVirtual = null;
            $derivLoginId = null;

            if ($wsUrl) {
                try {
                    $client = new \WebSocket\Client($wsUrl, ['timeout' => 10]);

                    // authorize first -- this is Deriv's own source of truth
                    // for whether this account is real or demo (is_virtual),
                    // and its true login ID. We do NOT trust the account_type
                    // dropdown the user picked; we verify against this.
                    $client->send(json_encode(['authorize' => $request->api_token]));
                    $rawAuthMsg = $client->receive();
                    $authResponse = json_decode($rawAuthMsg, true);
                    $derivIsVirtual = $authResponse['authorize']['is_virtual'] ?? null;
                    $derivLoginId = $authResponse['authorize']['loginid'] ?? null;

                    $client->send(json_encode(['balance' => 1]));
                    $rawBalanceMsg = $client->receive();
                    Log::info('[BrokerController] balance raw response', ['raw' => $rawBalanceMsg]);
                    $balanceResponse = json_decode($rawBalanceMsg, true);
                    $client->close();
                    $balance = $balanceResponse['balance']['balance'] ?? null;
                } catch (\Exception $balanceError) {
                    Log::warning('[BrokerController] balance fetch failed', [
                        'message' => $balanceError->getMessage(),
                    ]);
                    $balance = null;
                }
            }

            // Guard: reject if the account type the user selected in the
            // dropdown doesn't match what Deriv actually reports for this
            // token. Prevents a Demo account from silently being saved/
            // relabeled as Real (or vice versa) due to a wrong dropdown pick.
            if ($derivIsVirtual !== null) {
                $selectedType = DB::table('account_types')->where('id', $request->account_type_id)->first();
                $selectedIsVirtual = $selectedType ? (bool) $selectedType->is_virtual : null;

                if ($selectedIsVirtual !== null && (bool) $derivIsVirtual !== $selectedIsVirtual) {
                    $actualLabel = $derivIsVirtual ? 'Demo' : 'Real';
                    $selectedLabel = $selectedIsVirtual ? 'Demo' : 'Real';
                    return response()->json([
                        'success' => false,
                        'message' => "This account is actually a {$actualLabel} account, but you selected {$selectedLabel}. Please choose the correct account type and try again.",
                    ], 422);
                }
            }

            if ($derivLoginId !== null && $derivLoginId !== $request->broker_account_id) {
                Log::warning('[BrokerController] login ID mismatch', [
                    'submitted' => $request->broker_account_id,
                    'deriv_reports' => $derivLoginId,
                ]);
            }
        } catch (\Exception $e) {
            Log::error('[BrokerController] OTP request exception', ['message' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Could not verify with Deriv right now. Please try again.',
            ], 502);
        }

        // Guard: never save a row for a connection attempt that didn't
        // actually succeed with Deriv. Prevents empty/placeholder rows
        // from junk or failed submissions.
        if (empty($request->broker_account_id) || $wsUrl === null) {
            return response()->json([
                'success' => false,
                'message' => 'Connection could not be verified with Deriv. No account was saved.',
            ], 422);
        }

        // Upsert: reuse an existing row for this exact account instead of
        // creating a duplicate every time the form is submitted.
        $account = Account::updateOrCreate(
            [
                'user_id'            => $request->user()->id,
                'broker_account_id'  => $request->broker_account_id,
            ],
            [
                'provider_id'         => $request->provider_id,
                'account_type_id'     => $request->account_type_id,
                'api_token_encrypted' => Crypt::encryptString($request->api_token),
                'currency'            => $request->currency,
                'balance_cache'       => $balance,
                'connection_status'   => 'connected',
            ]
        );

        return response()->json([
            'success'    => true,
            'message'    => 'Account connected and verified with Deriv.',
            'account_id' => $account->id,
        ], 201);
    }

    // List user accounts
    public function accounts(Request $request)
    {
        $accounts = Account::where('user_id', $request->user()->id)
            ->with(['provider', 'accountType'])
            ->get()
            ->map(function ($account) {
                return [
                    'id'                 => $account->id,
                    'provider'           => $account->provider->name,
                    'account_type'       => $account->accountType->name,
                    'broker_account_id'  => $account->broker_account_id,
                    'currency'           => $account->currency,
                    'connection_status'  => $account->connection_status,
                    'balance_cache'      => $account->balance_cache,
                ];
            });

        return response()->json([
            'success'  => true,
            'accounts' => $accounts,
        ]);
    }

    // Disconnect an account
    public function disconnect(Request $request, $accountId)
    {
        $account = Account::where('id', $accountId)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        $account->update(['connection_status' => 'disconnected']);

        return response()->json([
            'success' => true,
            'message' => 'Account disconnected.',
        ]);
    }
}
