<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ContractTypeSeeder extends Seeder
{
    public function run(): void
    {
        $contractTypes = [
            // Digits
            ['name' => 'DIGITEVEN',   'description' => 'Digit Even',       'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 0, 'is_active' => 1],
            ['name' => 'DIGITODD',    'description' => 'Digit Odd',        'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 0, 'is_active' => 1],
            ['name' => 'DIGITOVER',   'description' => 'Digit Over',       'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'DIGITUNDER',  'description' => 'Digit Under',      'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'DIGITMATCH',  'description' => 'Digit Match',      'base_payout' => 9.0000, 'win_probability' => 0.1000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'DIGITDIFF',   'description' => 'Digit Differs',    'base_payout' => 1.1500, 'win_probability' => 0.9000, 'requires_barrier' => 1, 'is_active' => 1],
            // Up/Down
            ['name' => 'CALL',        'description' => 'Rise',             'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 0, 'is_active' => 1],
            ['name' => 'PUT',         'description' => 'Fall',             'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 0, 'is_active' => 1],
            ['name' => 'CALLE',       'description' => 'Higher',           'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'PUTE',        'description' => 'Lower',            'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            // Touch/No Touch
            ['name' => 'ONETOUCH',    'description' => 'One Touch',        'base_payout' => 2.0000, 'win_probability' => 0.4000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'NOTOUCH',     'description' => 'No Touch',         'base_payout' => 2.0000, 'win_probability' => 0.4000, 'requires_barrier' => 1, 'is_active' => 1],
            // Ends In/Out
            ['name' => 'EXPIRYRANGE', 'description' => 'Ends Between',     'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'EXPIRYMISS',  'description' => 'Ends Outside',     'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            // Stays In/Out
            ['name' => 'RANGE',       'description' => 'Stays Between',    'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            ['name' => 'UPORDOWN',    'description' => 'Goes Outside',     'base_payout' => 1.9500, 'win_probability' => 0.5000, 'requires_barrier' => 1, 'is_active' => 1],
            // Accumulator
            ['name' => 'ACCU',        'description' => 'Accumulator',      'base_payout' => 0.0000, 'win_probability' => 0.0000, 'requires_barrier' => 0, 'is_active' => 1],
        ];

        DB::table('contract_types')->insertOrIgnore($contractTypes);
    }
}