import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Cada teste começa com o navegador limpo: token de um teste vazando para o
// seguinte faria a suíte passar ou falhar conforme a ordem de execução.
beforeEach(() => {
  localStorage.clear();
});
