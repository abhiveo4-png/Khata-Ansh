export function getActiveUserId(): string {
  try {
    return localStorage.getItem('teleexpense_user_id') || '';
  } catch {
    return '';
  }
}

export function getAuthToken(): string {
  try {
    return localStorage.getItem('teleexpense_auth_token') || '';
  } catch {
    return '';
  }
}

export function setAuthSession(userId: string, token?: string): void {
  try {
    if (userId) {
      localStorage.setItem('teleexpense_user_id', userId);
      if (token) {
        localStorage.setItem('teleexpense_auth_token', token);
      }
    } else {
      localStorage.removeItem('teleexpense_user_id');
      localStorage.removeItem('teleexpense_auth_token');
    }
  } catch {
    // Ignore in restricted storage environments
  }
}

export function setActiveUserId(userId: string): void {
  setAuthSession(userId);
}

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null; ok: boolean }> {
  try {
    const activeUserId = getActiveUserId();
    const token = getAuthToken();
    const headers = new Headers(options?.headers || {});

    if (activeUserId && !headers.has('x-user-id')) {
      headers.set('x-user-id', activeUserId);
    }
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        data: null,
        error: !res.ok ? `Request failed with status ${res.status}` : 'Received non-JSON response from server',
        ok: res.ok,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        data,
        error: data?.error || `Request failed with status ${res.status}`,
        ok: false,
      };
    }

    return { data, error: null, ok: true };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error',
      ok: false,
    };
  }
}

