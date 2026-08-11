/* The meter.

   Real Hyderabad structure — a flag-down charge plus a per-kilometre rate —
   scaled so a typical ride across one of these maps pays out in the ₹40-60
   range and Tank Bund unlocks in roughly eight to ten rides.

   Bonuses are the dopamine. They are all things a player did on purpose, and
   one of them deliberately rewards nearly tipping the auto over, because that
   is the most auto-rickshaw thing that can happen to you. */

export const FLAG_DOWN = 25;
export const PER_METRE = 0.09;

export class Meter {
  constructor() {
    this.reset();
  }

  reset() {
    this.running = false;
    this.distance = 0;
    this.time = 0;
    this.fare = 0;
    this.collisions = 0;
    this.peakRoll = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
  }

  start() {
    this.reset();
    this.running = true;
    this.fare = FLAG_DOWN;
  }

  update(dt, vehicle) {
    if (!this.running) return;
    const step = Math.abs(vehicle.speed) * dt;
    this.distance += step;
    this.time += dt;
    this.fare = FLAG_DOWN + this.distance * PER_METRE;

    this.peakRoll = Math.max(this.peakRoll, Math.abs(vehicle.roll));
    this.speedSum += Math.abs(vehicle.speed);
    this.speedSamples++;
  }

  noteCollision() {
    if (this.running) this.collisions++;
  }

  /** @returns {{total:number, base:number, bonuses:{label:string, amount:number}[]}} */
  settle(beat) {
    const base = Math.round(this.fare);
    const bonuses = [];

    if (this.collisions === 0 && this.distance > 60) {
      bonuses.push({ label: "Smooth ride", amount: 10 });
    }
    const avg = this.speedSamples ? this.speedSum / this.speedSamples : 0;
    if (avg > 8) {
      bonuses.push({ label: "Fast hands", amount: 15 });
    }
    if (this.peakRoll > 0.24) {
      bonuses.push({ label: "Almost tipped", amount: 20 });
    }
    if (beat && beat.confidence > 0.5 && beat.barPhase > 0.75) {
      bonuses.push({ label: "Dropped on the beat", amount: 5 });
    }

    const total = base + bonuses.reduce((s, b) => s + b.amount, 0);
    this.running = false;
    return { total, base, bonuses };
  }
}
