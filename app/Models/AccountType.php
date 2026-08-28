<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountType extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'provider_id',
        'name',
        'currency',
        'min_stake',
        'max_stake',
    ];

    protected $casts = [
        'min_stake' => 'decimal:2',
        'max_stake' => 'decimal:2',
    ];

    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    public function accounts()
    {
        return $this->hasMany(Account::class);
    }
}