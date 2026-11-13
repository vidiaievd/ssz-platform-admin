import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectButton } from 'primeng/selectbutton';
import { LanguageService } from '../core/i18n/language.service';
import { LANGUAGES, Language } from '../core/i18n/languages';

/** uk · en · nb toggle; language codes are shown as is, they read the same in every language. */
@Component({
  selector: 'app-language-switcher',
  imports: [FormsModule, SelectButton],
  template: `
    <p-selectbutton
      size="small"
      [options]="options"
      [allowEmpty]="false"
      [ngModel]="language.current()"
      (ngModelChange)="select($event)"
      optionLabel="label"
      optionValue="value"
    />
  `,
})
export class LanguageSwitcher {
  protected readonly language = inject(LanguageService);
  protected readonly options = LANGUAGES.map((value) => ({ value, label: value.toUpperCase() }));

  protected select(lang: Language): void {
    this.language.set(lang);
  }
}
