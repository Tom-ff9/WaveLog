import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TouchZoomLockService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly teardownCallbacks: Array<() => void> = [];
  private lastTouchEndAt = 0;

  install() {
    if (this.teardownCallbacks.length || !this.documentRef?.addEventListener) return;

    const addListener = <K extends keyof DocumentEventMap>(
      type: K,
      listener: (event: DocumentEventMap[K]) => void
    ) => {
      const wrapped = listener as EventListener;
      this.documentRef.addEventListener(type, wrapped, { passive: false });
      this.teardownCallbacks.push(() => this.documentRef.removeEventListener(type, wrapped));
    };

    addListener('touchstart', (event) => {
      if (event.touches.length < 2 || this.isZoomAllowedTarget(event.target)) return;
      event.preventDefault();
    });

    addListener('touchmove', (event) => {
      if (event.touches.length < 2 || this.isZoomAllowedTarget(event.target)) return;
      event.preventDefault();
    });

    addListener('touchend', (event) => {
      if (this.isZoomAllowedTarget(event.target)) return;
      const now = Date.now();
      if (now - this.lastTouchEndAt < 320) {
        event.preventDefault();
      }
      this.lastTouchEndAt = now;
    });

    const gestureHandler = (event: Event) => {
      if (this.isZoomAllowedTarget(event.target)) return;
      event.preventDefault();
    };

    this.documentRef.addEventListener('gesturestart', gestureHandler, { passive: false } as AddEventListenerOptions);
    this.documentRef.addEventListener('gesturechange', gestureHandler, { passive: false } as AddEventListenerOptions);
    this.documentRef.addEventListener('gestureend', gestureHandler, { passive: false } as AddEventListenerOptions);
    this.teardownCallbacks.push(() => this.documentRef.removeEventListener('gesturestart', gestureHandler));
    this.teardownCallbacks.push(() => this.documentRef.removeEventListener('gesturechange', gestureHandler));
    this.teardownCallbacks.push(() => this.documentRef.removeEventListener('gestureend', gestureHandler));

    addListener('dblclick', (event) => {
      if (this.isZoomAllowedTarget(event.target)) return;
      event.preventDefault();
    });
  }

  uninstall() {
    while (this.teardownCallbacks.length) {
      this.teardownCallbacks.pop()?.();
    }
  }

  private isZoomAllowedTarget(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('[data-allow-touch-zoom="true"]');
  }
}
