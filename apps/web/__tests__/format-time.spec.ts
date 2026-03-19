/**
 * Format Time Utilities — Unit Tests
 *
 * Tests the formatRelativeTime function with real Date objects.
 * No mocking — uses real date-fns formatting.
 */
import { formatRelativeTime } from '../src/lib/format-time';

describe('formatRelativeTime', () => {
  describe('invalid input', () => {
    it('should return empty string for invalid date strings', () => {
      expect(formatRelativeTime('not-a-date')).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(formatRelativeTime('')).toBe('');
    });

    it('should return empty string for garbage input', () => {
      expect(formatRelativeTime('abc123xyz')).toBe('');
    });
  });

  describe('recent timestamps', () => {
    it('should format a recent timestamp with shortened units', () => {
      // Use a date that is exactly 5 minutes ago
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo.toISOString());

      // date-fns formatDistanceToNowStrict should produce "5 minutes ago"
      // After shortening: "5m ago"
      expect(result).toBe('5m ago');
    });

    it('should format a timestamp from seconds ago', () => {
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
      const result = formatRelativeTime(tenSecondsAgo.toISOString());

      // Should be "10s ago" (or close — timing may vary by 1-2s)
      expect(result).toMatch(/^\d+s ago$/);
    });

    it('should format a timestamp from hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo.toISOString());

      expect(result).toBe('2h ago');
    });

    it('should format exactly 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const result = formatRelativeTime(oneHourAgo.toISOString());

      expect(result).toBe('1h ago');
    });

    it('should format exactly 1 minute ago', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const result = formatRelativeTime(oneMinuteAgo.toISOString());

      expect(result).toBe('1m ago');
    });
  });

  describe('older timestamps', () => {
    it('should format a timestamp from days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(threeDaysAgo.toISOString());

      expect(result).toBe('3d ago');
    });

    it('should format exactly 1 day ago', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(oneDayAgo.toISOString());

      expect(result).toBe('1d ago');
    });

    it('should format a timestamp from months ago', () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoMonthsAgo.toISOString());

      expect(result).toBe('2mo ago');
    });

    it('should format a timestamp from one year ago', () => {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(oneYearAgo.toISOString());

      expect(result).toBe('1y ago');
    });
  });

  describe('future timestamps', () => {
    it('should handle future dates with "in" prefix', () => {
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesFromNow.toISOString());

      // date-fns with addSuffix produces "in 5 minutes"
      // After shortening: "in 5m"
      expect(result).toBe('in 5m');
    });

    it('should handle a future date hours away', () => {
      const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const result = formatRelativeTime(threeHoursFromNow.toISOString());

      expect(result).toBe('in 3h');
    });
  });

  describe('ISO string formats', () => {
    it('should handle ISO 8601 date strings with timezone', () => {
      const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(date.toISOString());

      expect(result).toBe('2h ago');
    });

    it('should handle non-ISO date strings that are valid', () => {
      // A date string in a format parseable by Date constructor
      const date = new Date(Date.now() - 10 * 60 * 1000);
      const dateStr = date.toString(); // e.g. "Thu Mar 13 2026 ..."
      const result = formatRelativeTime(dateStr);

      expect(result).toBe('10m ago');
    });
  });

  describe('shortening replacements', () => {
    // These tests verify the specific string replacements work correctly
    // by computing known time offsets and checking the shortened output.

    it('should shorten "seconds" to "s"', () => {
      const fiveSecondsAgo = new Date(Date.now() - 5 * 1000);
      const result = formatRelativeTime(fiveSecondsAgo.toISOString());
      expect(result).toContain('s ago');
      expect(result).not.toContain('second');
    });

    it('should shorten "minutes" to "m"', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const result = formatRelativeTime(tenMinutesAgo.toISOString());
      expect(result).toBe('10m ago');
      expect(result).not.toContain('minute');
    });

    it('should shorten "hours" to "h"', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const result = formatRelativeTime(fiveHoursAgo.toISOString());
      expect(result).toBe('5h ago');
      expect(result).not.toContain('hour');
    });

    it('should shorten "days" to "d"', () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(sevenDaysAgo.toISOString());
      expect(result).toBe('7d ago');
      expect(result).not.toContain('day');
    });
  });
});
