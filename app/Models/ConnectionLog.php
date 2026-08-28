<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConnectionLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'account_id',
        'event',
        'latency_ms',
        'details',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];

    public function account()
    {
        return $this->belongsTo(Account::class);
    }
}