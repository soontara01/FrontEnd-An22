/**
 * Requests of the platform admin pages (`/platform/**`, E36) carry the platform admin's own token,
 * never the shop user's, and no branch / terminal header. Kept tiny: the eager interceptors use it.
 */
export const PLATFORM_TOKEN_KEY = 'platformToken';

/** Whether a request goes to the platform API (`<apiUrl>/platform/…`). */
export const isPlatformRequest = (url: string): boolean => /\/platform\//.test(url);
