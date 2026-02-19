function fibonacci(index) {
  if (index <= 1) return 1;

  let previous = 1;
  let current = 2;

  for (let i = 2; i < index; i += 1) {
    const next = previous + current;
    previous = current;
    current = next;
  }

  return current;
}

export function getFibonacciDelayHours(step = 1, aggressivenessShift = 0) {
  const normalizedStep = Number.isFinite(step)
    ? Math.max(1, Math.floor(step))
    : 1;

  const normalizedShift = Number.isFinite(aggressivenessShift)
    ? Math.trunc(aggressivenessShift)
    : 0;

  const fibIndex = Math.max(1, normalizedStep - normalizedShift);
  return fibonacci(fibIndex);
}

export function shouldAlignToBestTime(delayHours) {
  return Number.isFinite(delayHours) && delayHours >= 24;
}

export function alignToHourOnOrAfter(baseTime, targetHour) {
  const reference = baseTime instanceof Date
    ? new Date(baseTime.getTime())
    : new Date(baseTime);

  if (!Number.isFinite(reference.getTime())) {
    return new Date();
  }

  const normalizedHour = Number.isFinite(targetHour)
    ? Math.min(23, Math.max(0, Math.floor(targetHour)))
    : reference.getHours();

  const aligned = new Date(reference.getTime());
  aligned.setHours(normalizedHour, 0, 0, 0);

  if (aligned.getTime() < reference.getTime()) {
    aligned.setDate(aligned.getDate() + 1);
  }

  return aligned;
}
