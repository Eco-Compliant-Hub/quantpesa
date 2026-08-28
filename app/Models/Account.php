<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'provider_id',
        'account_type_id',
        'api_token_encrypted',
        'broker_account_id',
        'balance_cache',
        'currency',
        'connection_status',
        'last_heartbeat_at',
    ];

    protected $hidden = [
        'api_token_encrypted',
    ];

    protected $casts = [
        'balance_cache'     => 'decimal:2',
        'last_heartbeat_at' => 'datetime',
    ];

    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    public function accountType()
    {
        return $this->belongsTo(AccountType::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function connectionLogs()
    {
        return $this->hasMany(ConnectionLog::class);
    }
}