export const API_BASE = '/api';

export function getStoredToken(): string | null {
  return localStorage.getItem('meridian_token');
}

export function setStoredToken(token: string) {
  localStorage.setItem('meridian_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem('meridian_token');
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
  }

  return data;
}
