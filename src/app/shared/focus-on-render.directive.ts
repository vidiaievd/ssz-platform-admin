import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Focuses the element once it is rendered — for the field a step of a flow starts with.
 * Unlike the `autofocus` attribute it also works for elements Angular adds later.
 */
@Directive({ selector: '[appFocusOnRender]' })
export class FocusOnRender {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => element.focus());
  }
}
