/**
 * logout.js
 * Handles user logout by clearing JWT tokens and redirecting to login page.
 * Designed to be imported by auth.js and other modules.
 */

/**
 * Logs out the current user by:
 * 1. Removing the admin_token JWT cookie
 * 2. Clearing localStorage entries for tokens and user data
 * 3. Redirecting to the login page (or homepage for regular users)
 *
 * @async
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax;';
    document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax;';

    localStorage.removeItem('userToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('adminToken');

    window.location.href = '/login.html';
  } catch (e) {
    console.warn('Logout failed:', e);
    // Fallback: still try to redirect
    window.location.href = '/login.html';
  }
}

/**
 * Checks if the user is authenticated based on the presence of a valid JWT token.
 *
 * @returns {boolean} True if authenticated, false otherwise
 */
export function isAuthenticated() {
  return !!localStorage.getItem('userToken') || document.cookie.includes('admin_token=');
}
