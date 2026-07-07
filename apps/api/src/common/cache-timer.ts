export class CacheTimer {
  public static readonly ONE_SECOND = 1000;
  public static readonly ONE_MINUTE = 60 * this.ONE_SECOND;
  public static readonly ONE_HOUR = 60 * this.ONE_MINUTE;
  public static readonly TWO_HOURS = this.ONE_HOUR * 2;
  public static readonly ONE_DAY = this.ONE_HOUR * 24;

  public static readonly THIRTY_MINUTES = CacheTimer.ONE_MINUTE * 30;
  public static readonly SIX_HOURS = CacheTimer.ONE_HOUR * 6;
  public static readonly TWELVE_HOURS = CacheTimer.ONE_HOUR * 12;
  public static readonly TWENTY_FOUR_HOURS = CacheTimer.ONE_DAY;

  public static readonly SEVEN_DAYS = CacheTimer.ONE_DAY * 7;
  public static readonly TWO_WEEKS = CacheTimer.ONE_DAY * 14;

  public static readonly ONE_MONTH = CacheTimer.ONE_DAY * 30;
  public static readonly THREE_MONTHS = CacheTimer.ONE_DAY * 30 * 3;
  public static readonly SIX_MONTHS = CacheTimer.ONE_DAY * 30 * 6;

  public static readonly ONE_YEAR = CacheTimer.ONE_DAY * 365;
  public static readonly TWO_YEARS = CacheTimer.ONE_YEAR * 2;

  public static readonly SHORT_TERM = CacheTimer.ONE_HOUR;
  public static readonly MEDIUM_TERM = CacheTimer.ONE_DAY * 3;
  public static readonly LONG_TERM = CacheTimer.SEVEN_DAYS * 2; // 14 days

  public static readonly SESSION_DURATION = CacheTimer.ONE_HOUR * 8;
  public static readonly API_RATE_LIMIT = CacheTimer.ONE_MINUTE * 5;
  public static readonly REAL_TIME_DATA = CacheTimer.ONE_MINUTE * 2;

  public static custom(
    minutes?: number,
    hours?: number,
    days?: number,
    weeks?: number,
  ): number {
    let totalSeconds = 0;
    if (minutes) totalSeconds += minutes * this.ONE_MINUTE;
    if (hours) totalSeconds += hours * this.ONE_HOUR;
    if (days) totalSeconds += days * this.ONE_DAY;
    if (weeks) totalSeconds += weeks * this.SEVEN_DAYS;
    return totalSeconds;
  }

  public static toReadableTime(seconds: number): string {
    const days = Math.floor(seconds / this.ONE_DAY);
    const hours = Math.floor((seconds % this.ONE_DAY) / this.ONE_HOUR);
    const minutes = Math.floor((seconds % this.ONE_HOUR) / this.ONE_MINUTE);

    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);

    return parts.join(', ') || `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
}
