// A sprint has one departure and one arrival; it never wraps back to gate zero.
// Keep this independent of rendering so checkpoint validation is deterministic.
export function createRaceProgress(gates, {radius = 11, maxSweepDistance = 100} = {}) {
  if (!Array.isArray(gates) || gates.length < 2) {
    throw new TypeError('A sprint needs a start gate and a finish gate.');
  }
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(maxSweepDistance) || maxSweepDistance <= 0) {
    throw new TypeError('Checkpoint radius and maximum sweep distance must be positive.');
  }

  // Copy coordinates instead of retaining mutable THREE.Vector3 instances.
  const course = gates.map(gate => {
    const point = gate?.point ?? gate;
    const gateRadius = gate?.radius ?? radius;
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z) || !Number.isFinite(gateRadius) || gateRadius <= 0) {
      throw new TypeError('Every gate needs finite x/z coordinates and a positive radius.');
    }
    return {x: point.x, z: point.z, radius: Math.min(gateRadius, 15)};
  });

  let nextGate, completed, finished, splits, lastValidIndex, previous;
  const progress = {
    get nextGate() { return nextGate; },
    get completed() { return completed; },
    get finished() { return finished; },
    // Cumulative split times, in the same units as the supplied elapsed time.
    get splits() { return [...splits]; },
    get lastValidIndex() { return lastValidIndex; },
    reset() {
      nextGate = 1;
      completed = 0;
      finished = false;
      splits = [];
      lastValidIndex = 0;
      previous = null;
      return progress;
    },
    // Call after a recovery/teleport so the replacement line cannot pass a gate.
    resetPosition(x, z) {
      previous = Number.isFinite(x) && Number.isFinite(z) ? {x, z} : null;
      return progress;
    },
    update(x, z, elapsed) {
      if (finished || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(elapsed) || elapsed < 0) return null;
      const lastTotal = splits.at(-1) ?? 0;
      if (elapsed < lastTotal) return null;

      const target = course[nextGate];
      const current = {x, z};
      let touched = Math.hypot(x - target.x, z - target.z) <= target.radius;
      if (!touched && previous) {
        const dx = x - previous.x, dz = z - previous.z;
        const lengthSquared = dx * dx + dz * dz;
        // Fast normal driving may cross a whole trigger between frames. Large
        // teleports must not validate a checkpoint merely by drawing that line.
        if (lengthSquared > 0 && lengthSquared <= maxSweepDistance * maxSweepDistance) {
          const t = Math.max(0, Math.min(1, ((target.x - previous.x) * dx + (target.z - previous.z) * dz) / lengthSquared));
          touched = Math.hypot(previous.x + dx * t - target.x, previous.z + dz * t - target.z) <= target.radius;
        }
      }
      previous = current;
      if (!touched) return null;

      const index = nextGate;
      lastValidIndex = index;
      completed++;
      nextGate++;
      finished = index === course.length - 1;
      splits.push(elapsed);
      return {index, finished, split: elapsed - lastTotal, total: elapsed, checkpoint: !finished};
    },
  };
  return progress.reset();
}
