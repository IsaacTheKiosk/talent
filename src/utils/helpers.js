/**
 * Get the start and end dates of the current week (Monday to Sunday)
 */
export function getWeekDates() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current, target) {
  if (target === 0) return 0;
  return Math.round((current / target) * 100);
}

/**
 * Get status class based on progress percentage
 */
export function getStatusClass(progress) {
  if (progress >= 80) return 'on-track';
  if (progress >= 50) return 'warning';
  return 'behind';
}

/**
 * Format date for display
 */
export function formatDate(date, options = {}) {
  const defaultOptions = {
    month: 'short',
    day: 'numeric',
    ...options
  };
  return new Date(date).toLocaleDateString('en-US', defaultOptions);
}

/**
 * Get days remaining in the week
 */
export function getDaysRemaining() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Sunday = 0, so we treat it as 7 for calculation
  const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  return 7 - adjustedDay;
}

/**
 * Calculate required daily rate to meet target
 */
export function getRequiredDailyRate(current, target) {
  const daysRemaining = getDaysRemaining();
  if (daysRemaining === 0) return 0;

  const remaining = target - current;
  if (remaining <= 0) return 0;

  return Math.ceil(remaining / daysRemaining);
}
