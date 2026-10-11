/** Small, deterministic PRNG for synthetic demonstration scenarios. */
export class SeededRandom {
  private state: number;

  constructor(seed: number, scenarioId = "") {
    if (!Number.isFinite(seed)) {
      throw new TypeError("Simulation seed must be a finite number.");
    }

    this.state = hashSeed(seed, scenarioId);
  }

  /** Returns a deterministic number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  between(minimum: number, maximum: number): number {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
      throw new RangeError("Random range must be finite and ordered.");
    }
    return minimum + this.next() * (maximum - minimum);
  }

  integer(minimum: number, maximumInclusive: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximumInclusive) || maximumInclusive < minimum) {
      throw new RangeError("Integer range must be ordered whole numbers.");
    }
    return minimum + Math.floor(this.next() * (maximumInclusive - minimum + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot choose from an empty list.");
    return items[this.integer(0, items.length - 1)];
  }
}

function hashSeed(seed: number, scenarioId: string): number {
  let hash = 0x811c9dc5;
  const input = `${Math.trunc(seed)}:${scenarioId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
