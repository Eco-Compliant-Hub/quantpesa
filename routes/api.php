<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\PreferencesController;
use App\Http\Controllers\Api\BrokerController;
use App\Http\Controllers\Api\MarketController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\TradingController;
use App\Http\Controllers\Api\BotController;
use App\Http\Controllers\Api\RiskController;
use App\Http\Controllers\Api\Internal\InternalBotController;
use App\Http\Controllers\CommunityController;
use Illuminate\Support\Facades\Broadcast;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\Api\AnalysisContextController;

Route::post('/register', [AuthController::class, 'register'])
    ->middleware('throttle:10,15');

Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,15');

Route::post('/password/forgot', [PasswordResetController::class, 'forgot']);
Route::post('/password/reset', [PasswordResetController::class, 'reset']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/email/send-verification', [VerificationController::class, 'send']);
    Route::post('/email/verify', [VerificationController::class, 'verify']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::get('/preferences', [PreferencesController::class, 'show']);
    Route::put('/preferences', [PreferencesController::class, 'update']);

    // Broker routes
    Route::get('/providers', [BrokerController::class, 'providers']);
    Route::get('/providers/{providerId}/account-types', [BrokerController::class, 'accountTypes']);
    Route::post('/accounts/connect', [BrokerController::class, 'connect']);
    Route::get('/accounts', [BrokerController::class, 'accounts']);
    Route::put('/accounts/{accountId}/disconnect', [BrokerController::class, 'disconnect']);

    // Market routes
    Route::get('/market/types', [MarketController::class, 'marketTypes']);
    Route::get('/market/symbols', [MarketController::class, 'symbols']);
    Route::get('/market/symbols/{symbol}', [MarketController::class, 'symbol']);

    // Analytics routes
    Route::get('/analytics/{symbol}/observe', [AnalyticsController::class, 'observe']);
    Route::get('/analytics/{symbol}/absence', [AnalyticsController::class, 'absence']);
    Route::get('/analytics/{symbol}/digits', [AnalyticsController::class, 'digits']);
    Route::get('/analytics/{symbol}/signals', [AnalyticsController::class, 'signals']);
    Route::get('/analytics/{symbol}/runs', [AnalyticsController::class, 'runs']);
    Route::get('/analytics/{symbol}/summary', [AnalyticsController::class, 'summary']);
        // Analysis Context routes
    Route::post('/analysis-contexts', [AnalysisContextController::class, 'store']);
    Route::get('/analysis-contexts/{id}', [AnalysisContextController::class, 'show']);

    // AI routes
    Route::get('/ai/predictions', [AiController::class, 'predictions']);
    Route::get('/ai/predictions/{symbol}', [AiController::class, 'predictionForSymbol']);
    Route::get('/ai/models', [AiController::class, 'models']);
    Route::get('/ai/models/{id}/performance', [AiController::class, 'modelPerformance']);

    // Trading routes
    Route::get('/trading/contract-types', [TradingController::class, 'contractTypes']);
    Route::post('/trading/orders', [TradingController::class, 'placeOrder']);
    Route::get('/trading/orders', [TradingController::class, 'myOrders']);
    Route::get('/trading/orders/{id}', [TradingController::class, 'orderDetail']);

    
    // Broadcasting auth -- overrides Laravel's default /broadcasting/auth
    // (registered via the 'channels' key in bootstrap/app.php, which uses
    // session-based 'web' middleware by default). This app authenticates
    // with Bearer tokens everywhere else, so private-channel subscriptions
    // need to go through auth:sanctum instead, which this route group
    // already provides.
    Route::post('/broadcasting/auth', function (\Illuminate\Http\Request $request) {
        return Broadcast::auth($request);
    });

    // Risk routes
    Route::get('/risk/accounts/{accountId}/exposure', [RiskController::class, 'exposure']);
    Route::post('/risk/accounts/{accountId}/evaluate', [RiskController::class, 'evaluate']);

    // Bot routes
    Route::get('/bots/templates', [BotController::class, 'templates']);
    Route::post('/bots', [BotController::class, 'createBot']);
    Route::post('/bots/upload-xml', [BotController::class, 'uploadXml']);
    Route::get('/bots', [BotController::class, 'myBots']);
    Route::get('/bots/{id}', [BotController::class, 'botDetail']);
    Route::get('/bots/{id}/live', [BotController::class, 'live']);
    Route::post('/bots/{id}/configure', [BotController::class, 'configure']);
    Route::post('/bots/{id}/start', [BotController::class, 'start']);
    Route::post('/bots/{id}/stop', [BotController::class, 'stop']);
    Route::post('/bots/{id}/pause', [BotController::class, 'pause']);
    Route::post('/bots/{id}/resume', [BotController::class, 'resume']);

    // ── Community ──────────────────────────────────────
    Route::prefix('community')->group(function () {
        Route::post('/register-provider', [CommunityController::class, 'registerProvider']);
        Route::get('/leaderboard', [CommunityController::class, 'leaderboard']);
        Route::post('/follow/{providerId}', [CommunityController::class, 'follow']);
        Route::delete('/unfollow/{providerId}', [CommunityController::class, 'unfollow']);
        Route::get('/my-following', [CommunityController::class, 'myFollowing']);
        Route::get('/alerts', [CommunityController::class, 'myAlerts']);
        Route::patch('/alerts/{alertId}/read', [CommunityController::class, 'markAlertRead']);
        Route::get('/provider/{providerId}', [CommunityController::class, 'providerStats']);
    });
});

// ── Admin ──────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('admin')->group(function () {
    Route::get('/users', [AdminController::class, 'users']);
    Route::patch('/users/{userId}/ban', [AdminController::class, 'ban']);
    Route::patch('/users/{userId}/unban', [AdminController::class, 'unban']);
    Route::patch('/users/{userId}/suspend', [AdminController::class, 'suspend']);
    Route::patch('/providers/{providerId}/verify', [AdminController::class, 'verifyProvider']);
    Route::get('/orders', [AdminController::class, 'orders']);
    Route::get('/bots', [AdminController::class, 'bots']);
    Route::patch('/bots/{botId}/kill', [AdminController::class, 'killBot']);
    Route::post('/bots/{botId}/start', [AdminController::class, 'startBot']);
    Route::get('/stats', [AdminController::class, 'stats']);
    Route::get('/settings', [AdminController::class, 'getSettings']);
    Route::patch('/settings/{key}', [AdminController::class, 'updateSetting']);

    // Bot catalog (templates)
    Route::get('/bot-templates', [AdminController::class, 'listBotTemplates']);
    Route::post('/bot-templates', [AdminController::class, 'uploadBotTemplate']);
    Route::post('/bot-templates/{id}/test-run', [AdminController::class, 'testRunBotTemplate']);
    Route::get('/bot-templates/{id}/test-runs', [AdminController::class, 'listTemplateTestRuns']);
    Route::patch('/bot-templates/{id}/tier', [AdminController::class, 'updateBotTemplateTier']);
    Route::patch('/bot-templates/{id}/deploy', [AdminController::class, 'deployBotTemplate']);
    Route::patch('/bot-templates/{id}/retract', [AdminController::class, 'retractBotTemplate']);
    Route::delete('/bot-templates/{id}', [AdminController::class, 'deleteBotTemplate']);
});

// ── Billing ────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('billing')->group(function () {
    Route::get('/plans', [BillingController::class, 'plans']);
    Route::get('/subscription', [BillingController::class, 'mySubscription']);
    Route::post('/subscribe', [BillingController::class, 'subscribe']);
    Route::delete('/cancel', [BillingController::class, 'cancel']);
    Route::get('/invoices', [BillingController::class, 'myInvoices']);
    Route::post('/payment-methods', [BillingController::class, 'addPaymentMethod']);
    Route::get('/payment-methods', [BillingController::class, 'myPaymentMethods']);
    Route::delete('/payment-methods/{id}', [BillingController::class, 'removePaymentMethod']);
});

// ── Internal (bot_runner.py callbacks) ──────────────────────────
Route::middleware('internal.token')->prefix('internal')->group(function () {
    Route::post('/bots/{id}/trade-result', [InternalBotController::class, 'tradeResult']);
    Route::get('/bots/{id}/runtime-data', [InternalBotController::class, 'runtimeData']);
    Route::post('/bots/{id}/session-end', [InternalBotController::class, 'sessionEnd']);
    Route::post('/bots/{id}/contract-opened', [InternalBotController::class, 'contractOpened']);
    Route::get('/bots/{id}/open-orders', [InternalBotController::class, 'openOrders']);
    Route::post('/bots/{id}/heartbeat', [InternalBotController::class, 'heartbeat']);
    Route::get('/bots/session/{sessionId}/control', [InternalBotController::class, 'sessionControl']);
});