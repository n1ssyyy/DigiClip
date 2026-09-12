<?php

namespace App\Services\Clips;

use RuntimeException;

class OpenRouterException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status,
    ) {
        parent::__construct($message);
    }

    public function isClientError(): bool
    {
        return $this->status >= 400 && $this->status < 500;
    }
}
