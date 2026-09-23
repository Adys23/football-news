/** Circuit breaker zrodla: po tylu kolejnych bledach wylaczamy pobieranie. */
export const SOURCE_FAILURE_LIMIT = 10;

export type CircuitBreakerState = {
  consecutiveFailures: number;
  active: boolean;
};

export function recordSourceSuccess(): CircuitBreakerState {
  return { consecutiveFailures: 0, active: true };
}

export function recordSourceFailure(consecutiveFailures: number): CircuitBreakerState {
  const next = consecutiveFailures + 1;
  return {
    consecutiveFailures: next,
    active: next < SOURCE_FAILURE_LIMIT,
  };
}
