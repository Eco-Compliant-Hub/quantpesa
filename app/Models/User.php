<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $table = 'users';

    protected $fillable = [
        'email',
        'password_hash',
        'status',
        'email_verified',
        'totp_secret',
    ];

    protected $hidden = [
        'password_hash',
        'totp_secret',
    ];
    public $timestamps = false;
    protected $casts = [
        'email_verified' => 'boolean',
    ];
}