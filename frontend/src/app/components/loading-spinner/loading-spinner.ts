import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  imports: [],
  template: `
    <div class="spinner-container" [class.spinner-container--overlay]="overlay()">
      <div class="spinner"></div>
      @if (message()) {
        <p class="spinner-text">{{ message() }}</p>
      }
    </div>
  `,
  styleUrl: './loading-spinner.scss',
})
export class LoadingSpinner {
  message = input('');
  overlay = input(false);
}
