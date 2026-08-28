<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ── Scheduled Tasks ────────────────────────────────
Schedule::command('deriv:cleanup-ticks')
    ->dailyAt('02:00')
    ->appendOutputTo(storage_path('logs/cleanup-ticks.log'));

Schedule::command('analytics:process')
    ->everyFiveMinutes()
    ->appendOutputTo(storage_path('logs/analytics.log'));

Schedule::command('ai:generate-predictions')
    ->everyTenMinutes()
    ->appendOutputTo(storage_path('logs/ai-predictions.log'));