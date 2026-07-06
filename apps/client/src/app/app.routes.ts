import { Route } from '@angular/router';
import { App } from './app';

export const appRoutes: Route[] = [
  {
    path: '',
    // redirectTo: 'products',
    // pathMatch: 'full',
    component: App,
  },
  // {
  //   path: 'products',
  //   loadChildren: () =>
  //     import('@org/client/feature-products').then(
  //       (m) => m.featureProductsRoutes,
  //     ),
  // },
  // {
  //   path: 'products',
  //   loadChildren: () =>
  //     import('@org/client/feature-product-detail').then(
  //       (m) => m.featureProductDetailRoutes,
  //     ),
  // },
  {
    path: '**',
    redirectTo: '',
  },
];
