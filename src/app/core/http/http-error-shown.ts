/**
 * `error:` callback for a subscription that has no local UI state to reset: `errorInterceptor`
 * already showed the snackbar (and logs out on 401). Having an error callback at all keeps a
 * handled HTTP error out of `GlobalErrorHandler`, so the console stays clean (B13).
 */
export const httpErrorShown = (): void => undefined;
