import { bootstrapApplication } from '@angular/platform-browser';
import { buildAppConfig } from './app/app.config';
import { App } from './app/app';
import { loadAppConfig } from './app/core/config/app-config';

loadAppConfig()
  .then((config) => bootstrapApplication(App, buildAppConfig(config)))
  .catch((err: unknown) => {
    console.error(err);
    // Without its config the panel cannot reach the gateway; say so instead of a blank page.
    document.body.textContent =
      `The admin panel could not start: ${String(err)}. ` +
      'Copy public/config.example.json to public/config.json (see README).';
  });
