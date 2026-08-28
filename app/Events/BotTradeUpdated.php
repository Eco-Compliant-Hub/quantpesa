<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

// Broadcasts whenever an order tied to a bot session changes state --
// placed, won, or lost. Private per-user (unlike TickReceived, which is
// public market data), since this is account-specific trade activity.
class BotTradeUpdated implements ShouldBroadcastNow
{
    use InteractsWithSockets;

    public function __construct(
        public int $userId,
        public int $botId,
        public int $sessionId,
        public int $orderId,
        public string $symbol,
        public string $contractType,
        public float $stake,
        public ?float $payout,
        public string $status,
        public float $sessionTotalPnl
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.' . $this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'bot.trade.update';
    }

    public function broadcastWith(): array
    {
        return [
            'bot_id'           => $this->botId,
            'session_id'       => $this->sessionId,
            'order_id'         => $this->orderId,
            'symbol'           => $this->symbol,
            'contract_type'    => $this->contractType,
            'stake'            => $this->stake,
            'payout'           => $this->payout,
            'status'           => $this->status,
            'session_total_pnl'=> $this->sessionTotalPnl,
        ];
    }
}
