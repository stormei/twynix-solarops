import {bootstrapApplication} from '@angular/platform-browser';
import {provideRouter, withComponentInputBinding, withInMemoryScrolling} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {AppComponent} from './app/app';
import {routes} from './app/app.routes';
bootstrapApplication(AppComponent,{providers:[provideRouter(routes,withComponentInputBinding(),withInMemoryScrolling({scrollPositionRestoration:'enabled',anchorScrolling:'enabled'})),provideHttpClient()]}).catch(console.error);
