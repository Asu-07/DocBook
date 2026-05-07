import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-account-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './account-sidebar.html',
  styleUrl: './account-sidebar.scss',
})
export class AccountSidebar {
  private api = inject(ApiService);
  private router = inject(Router);

  open = input(false);
  closed = output<void>();

  get role(): string {
    return this.api.getRole();
  }

  close(): void {
    this.closed.emit();
  }

  logout(): void {
    this.api.logout();
    this.closed.emit();
    this.router.navigate(['/login']);
  }
}
