import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { Appointment } from '../../models/appointment.model';

@Component({
  selector: 'app-my-appointments',
  imports: [DatePipe, RouterLink, LoadingSpinner],
  templateUrl: './my-appointments.html',
  styleUrl: './my-appointments.scss',
})
export class MyAppointments implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  appointments = signal<Appointment[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  ngOnInit(): void {
    this.loadAppointments();
  }

  loadAppointments(): void {
    this.api.getAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        if (err.status === 401) {
          this.api.logout();
          this.errorMessage.set('Your session expired. Please login again.');
          this.toast.error('Session expired. Please login again.');
          this.router.navigate(['/login']);
          this.isLoading.set(false);
          return;
        }
        this.errorMessage.set(err.error?.detail ?? 'Something went wrong. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  cancelAppointment(id: number): void {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    this.api.cancelAppointment(id).subscribe({
      next: () => {
        this.appointments.update((list) => list.filter((a) => a.id !== id));
        this.toast.success('Appointment cancelled.');
      },
      error: () => {
        this.toast.error('Failed to cancel appointment.');
      },
    });
  }
}
