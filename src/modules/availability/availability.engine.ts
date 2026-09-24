import { AvailabilityState, InventorySourceType } from '../../common/types.js';

export interface AvailabilityEvaluation {
  state: AvailabilityState;
  customerCopy: string; // 'Available', 'Likely available', 'Availability uncertain', 'Unavailable'
  freshnessLabel: string; // e.g. 'Updated 6 min ago'
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'None';
  availableQuantity: number;
}

export class AvailabilityEngine {
  /**
   * Evaluate availability state, confidence level, and human-friendly freshness
   * from current inventory evidence.
   */
  public static evaluate(params: {
    sourceType: InventorySourceType;
    observedQuantity: number;
    reservedQuantity: number;
    observedAt: Date | string;
    confirmedAt?: Date | string | null;
  }): AvailabilityEvaluation {
    const observedAt = new Date(params.observedAt);
    const confirmedAt = params.confirmedAt ? new Date(params.confirmedAt) : null;
    const now = new Date();

    const availableQuantity = Math.max(0, params.observedQuantity - params.reservedQuantity);

    // If available quantity is zero, state is UNAVAILABLE
    if (availableQuantity === 0) {
      return {
        state: 'UNAVAILABLE',
        customerCopy: 'Unavailable',
        freshnessLabel: this.formatFreshness(observedAt),
        confidenceLevel: 'None',
        availableQuantity: 0,
      };
    }

    const ageHours = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60);

    // 1. Physical confirmation evaluation
    if (confirmedAt) {
      const confirmAgeHours = (now.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60);
      const isSameOperatingDay =
        now.toDateString() === confirmedAt.toDateString() && confirmAgeHours < 24;

      if (isSameOperatingDay) {
        return {
          state: 'VERIFIED',
          customerCopy: 'Available',
          freshnessLabel: `Confirmed today at ${confirmedAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}`,
          confidenceLevel: 'High',
          availableQuantity,
        };
      } else if (confirmAgeHours < 48) {
        // Carry forward yesterday's confirmed stock as 'Likely available'
        return {
          state: 'LIKELY',
          customerCopy: 'Likely available',
          freshnessLabel: 'Confirmed yesterday',
          confidenceLevel: 'Medium',
          availableQuantity,
        };
      }
    }

    // 2. POS / API integration evaluation
    if (params.sourceType === 'POS') {
      if (ageHours <= 4) {
        return {
          state: 'VERIFIED',
          customerCopy: 'Available',
          freshnessLabel: this.formatFreshness(observedAt),
          confidenceLevel: 'High',
          availableQuantity,
        };
      } else if (ageHours <= 24) {
        return {
          state: 'LIKELY',
          customerCopy: 'Likely available',
          freshnessLabel: this.formatFreshness(observedAt),
          confidenceLevel: 'Medium',
          availableQuantity,
        };
      } else {
        return {
          state: 'UNCERTAIN',
          customerCopy: 'Availability uncertain',
          freshnessLabel: this.formatFreshness(observedAt),
          confidenceLevel: 'Low',
          availableQuantity,
        };
      }
    }

    // 3. File / Manual evaluation
    if (ageHours <= 12) {
      return {
        state: 'LIKELY',
        customerCopy: 'Likely available',
        freshnessLabel: this.formatFreshness(observedAt),
        confidenceLevel: 'Medium',
        availableQuantity,
      };
    } else {
      return {
        state: 'UNCERTAIN',
        customerCopy: 'Availability uncertain',
        freshnessLabel: this.formatFreshness(observedAt),
        confidenceLevel: 'Low',
        availableQuantity,
      };
    }
  }

  public static formatFreshness(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Updated just now';
    if (diffMinutes === 1) return 'Updated 1 min ago';
    if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;
    if (diffHours === 1) return 'Updated 1 hour ago';
    if (diffHours < 24) return `Updated ${diffHours} hours ago`;
    if (diffDays === 1) return 'Updated yesterday';
    return `Updated ${diffDays} days ago`;
  }
}
