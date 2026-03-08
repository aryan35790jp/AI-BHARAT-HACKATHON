import axios, { isAxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const MAX_RETRIES = 1;
const RETRY_BASE_DELAY = 500;

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  // Note: userId is sent in the request body — no custom header needed
  // (custom headers trigger CORS preflight failures on API Gateway)
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableConfig;
    config._retryCount = config._retryCount ?? 0;

    const status = error.response?.status ?? 0;
    const isRetryable = status >= 500;

    if (!isRetryable || config._retryCount >= MAX_RETRIES) {
      return Promise.reject(error);
    }

    config._retryCount += 1;
    const delay = RETRY_BASE_DELAY * config._retryCount;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return client(config);
  }
);

export default client;
