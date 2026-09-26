import { createHttpApi } from './http';
export const mockMode = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API === 'true';
export const api = mockMode ? (await import('./mock')).createMockApi() : createHttpApi();
