import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { AdminStats, Hospital } from '../../models/hospital.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-admin-dashboard',
  imports: [LoadingSpinner],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  private api = inject(ApiService);

  stats = signal<AdminStats | null>(null);
  users = signal<User[]>([]);
  appointments = signal<any[]>([]);
  hospitals = signal<Hospital[]>([]);
  isLoading = signal(true);
  activeTab = signal<'users' | 'appointments' | 'hospitals'>('users');

  ngOnInit(): void {
    this.api.getAdminStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });

    this.api.getAdminUsers().subscribe({ next: (data) => this.users.set(data) });
    this.api.getAdminAppointments().subscribe({ next: (data) => this.appointments.set(data) });
    this.api.getAdminHospitals().subscribe({ next: (data) => this.hospitals.set(data) });
  }
}
