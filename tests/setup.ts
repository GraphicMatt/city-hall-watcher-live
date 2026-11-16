import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { TestIntersectionObserver } from './browser';

beforeEach(() => {
  // Node's optional global localStorage can mask jsdom's actual DOM storage.
  vi.stubGlobal('localStorage', Reflect.get(globalThis, 'jsdom').window.localStorage);
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  TestIntersectionObserver.instances = [];
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
