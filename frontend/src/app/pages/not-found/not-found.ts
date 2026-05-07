import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="not-found">
      <div class="not-found__content">
        <span class="not-found__code">404</span>
        <h1 class="not-found__title">Page Not Found</h1>
        <p class="not-found__text">The page you're looking for doesn't exist or has been moved.</p>
        <a class="btn btn--primary btn--lg" routerLink="/">Back to Home</a>
      </div>
    </section>
  `,
  styles: `
    .not-found {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 140px);
      text-align: center;
      padding: var(--space-12) var(--space-6);
    }

    .not-found__code {
      display: block;
      font-size: 8rem;
      font-weight: 900;
      color: var(--color-primary);
      line-height: 1;
      opacity: 0.2;
    }

    .not-found__title {
      font-size: var(--font-3xl);
      margin-bottom: var(--space-4);
    }

    .not-found__text {
      font-size: var(--font-lg);
      color: var(--color-text-muted);
      margin-bottom: var(--space-8);
      max-width: 400px;
    }
  `,
})
export class NotFound {}
