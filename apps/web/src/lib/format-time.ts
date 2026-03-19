/**
 * Formats a date string into a human-readable relative time.
 * Uses date-fns for reliable formatting.
 */
import { formatDistanceToNowStrict } from 'date-fns';

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);

  // Guard against invalid dates
  if (isNaN(date.getTime())) {
    return '';
  }

  const distance = formatDistanceToNowStrict(date, { addSuffix: true });

  // Shorten common patterns for compact display
  return distance
    .replace(' seconds', 's')
    .replace(' second', 's')
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' days', 'd')
    .replace(' day', 'd')
    .replace(' months', 'mo')
    .replace(' month', 'mo')
    .replace(' years', 'y')
    .replace(' year', 'y');
}
