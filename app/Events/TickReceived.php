<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class TickReceived implements ShouldBroadcastNow
{
    use InteractsWithSockets;

    public function __construct(
        public string $symbol,
        public float $price,
        public int $lastDigit,
        public int $tickCount,
        public int $pipSize = 2
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel('ticks.' . $this->symbol)];
    }

    public function broadcastAs(): string
    {
        return 'tick';
    }

    public function broadcastWith(): array
    {
        return [
            'symbol'     => $this->symbol,
            // Rounded to this symbol's real pip size, not a hardcoded
            // guess. This is the field that must agree with last_digit --
            // both are now derived from the same precision.
            'price'      => round($this->price, $this->pipSize),
            'pip_size'   => $this->pipSize,
            'last_digit' => $this->lastDigit,
            'tick_count' => $this->tickCount,
        ];
    }
}