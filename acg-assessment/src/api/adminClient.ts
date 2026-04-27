const STORAGE_KEY = 'acg_admin_token';

export const setAdminToken = (token: string) => {
  if (token) {
    sessionStorage.setItem(STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
};

export const getAdminToken = (): string | null => sessionStorage.getItem(STORAGE_KEY);

export const apiBase = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error('VITE_API_URL missing');
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
};

export const adminFetch = async (path: string, init: RequestInit = {}) => {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${apiBase()}${path}`, { ...init, headers });
};
