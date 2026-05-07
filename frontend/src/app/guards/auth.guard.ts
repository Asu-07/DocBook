import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ApiService } from '../services/api.service';

export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const api = inject(ApiService);
  const router = inject(Router);

  if (api.isLoggedIn()) {
    return true;
  }

  // Store the attempted URL so login can redirect back
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
