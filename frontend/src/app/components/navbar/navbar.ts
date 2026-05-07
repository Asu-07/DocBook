import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AccountSidebar } from '../account-sidebar/account-sidebar';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, AccountSidebar],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  private api = inject(ApiService);
  sidebarOpen = false;
  mobileMenuOpen = signal(false);

  get isLoggedIn(): boolean {
    return this.api.isLoggedIn();
  }

  get role(): string {
    return this.api.getRole();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleMobile(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileMenuOpen.set(false);
  }
}
