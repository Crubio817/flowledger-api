import axios from 'axios';

export type ApiResponse<T> = {
  status: 'ok' | 'error';
  data: T;
  error: string | null;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:4000/api'
});
