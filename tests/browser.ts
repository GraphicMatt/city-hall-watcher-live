export class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: number[];
  readonly scrollMargin = '0px';
  readonly observed = new Set<Element>();

  constructor(private callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
    TestIntersectionObserver.instances.push(this);
  }
  observe(target: Element) { this.observed.add(target); }
  unobserve(target: Element) { this.observed.delete(target); }
  disconnect() { this.observed.clear(); }
  takeRecords(): IntersectionObserverEntry[] { return []; }

  intersect(target: Element, ratio = 1) {
    if (!this.observed.has(target)) throw new Error('The target is not observed');
    this.callback([{
      target, intersectionRatio: ratio, isIntersecting: ratio > 0,
      boundingClientRect: target.getBoundingClientRect(), intersectionRect: new DOMRect(),
      rootBounds: null, time: performance.now(),
    }], this);
  }
}

export function intersect(target: Element, ratio = 1) {
  const observer = TestIntersectionObserver.instances.find(instance => instance.observed.has(target));
  if (!observer) throw new Error('No observer watches this target');
  observer.intersect(target, ratio);
}
