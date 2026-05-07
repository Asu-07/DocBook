import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ApiService } from '../services/api.service';

export const hospitalGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const api = inject(ApiService);
  const router = inject(Router);

  if (api.isLoggedIn() && api.getRole() === 'hospital') {
    return true;
  }

  if (!api.isLoggedIn()) {
    return router.createUrlTree(['/hospital/login'], { queryParams: { returnUrl: state.url } });
  }

  return router.createUrlTree(['/']);
};
