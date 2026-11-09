import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { AdminLevel } from './admin-level';
import { SessionStore } from './session.store';

/**
 * Renders its content only for the given admin level and above:
 * `<button pButton *appIfLevel="'admin'" …>`. What the level may not do is not drawn at all — no
 * disabled buttons (§2 of plan 90); the server checks the level again on every call.
 */
@Directive({ selector: '[appIfLevel]' })
export class IfLevelDirective {
  readonly appIfLevel = input.required<AdminLevel>();

  private readonly session = inject(SessionStore);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly allowed = computed(() => this.session.hasLevel(this.appIfLevel()));
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.allowed();
      if (allowed && !this.shown) {
        this.container.createEmbeddedView(this.template);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.container.clear();
        this.shown = false;
      }
    });
  }
}
