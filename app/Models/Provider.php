<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Provider extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'name',
        'slug',
        'api_base_url',
        'ws_url',
        'is_active',
        'supported_markets',
    ];

    protected $casts = [
        'is_active'         => 'boolean',
        'supported_markets' => 'array',
    ];

    public function accountTypes()
    {
        return $this->hasMany(AccountType::class);
    }

    public function accounts()
    {
        return $this->hasMany(Account::class);
    }
}