import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('./home/home').then(m => m.HomeComponent)
  },
  {
    path: 'sessions',
    loadComponent: () => import('./sessions-list/sessions-list').then(m => m.SessionsListComponent)
  },
  {
    path: 'session/active',
    loadComponent: () => import('./session-active/session-active').then(m => m.SessionActiveComponent)
  },
  {
    path: 'session/end',
    loadComponent: () => import('./session-end/session-end').then(m => m.SessionEndComponent)
  },
  {
    path: 'session/trimm',
    loadComponent: () => import('./trimm-details/trimm-details').then(m => m.TrimmDetailsComponent)
  },
  {
    path: 'session/:id',
    loadComponent: () => import('./session-detail/session-detail').then(m => m.SessionDetailComponent)
  },
  {
    path: 'learnings',
    loadComponent: () => import('./learnings/learnings').then(m => m.LearningsComponent)
  },
  {
    path: 'auswertung',
    loadComponent: () => import('./auswertung/auswertung').then(m => m.AuswertungComponent)
  }
];
