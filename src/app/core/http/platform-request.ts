/**
 * Requests of the platform admin pages (`/platform/**`, E36) get the platform admin's own token
 * from the web server's session (E48), never the shop user's, and no branch / terminal header.
 * Kept tiny: the eager interceptors use it.
 */

/** Whether a request goes to the platform API (`<apiUrl>/platform/…`). */
export const isPlatformRequest = (url: string): boolean => /\/platform\//.test(url);
