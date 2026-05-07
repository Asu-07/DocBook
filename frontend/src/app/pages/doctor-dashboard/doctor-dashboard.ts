import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { FaceCapture } from '../../components/face-capture/face-capture';
import { Appointment } from '../../models/appointment.model';

@Component({
  selector: 'app-doctor-dashboard',
  imports: [DatePipe, LoadingSpinner, FaceCapture],
  templateUrl: './doctor-dashboard.html',
  styleUrl: './doctor-dashboard.scss',
})
export class DoctorDashboard implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  doctorName = signal('');
  appointments = signal<Appointment[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  /** Face ID enrollment state. */
  faceEnrolled = signal(false);
  faceModalOpen = signal(false);
  faceBusy = signal(false);

  totalAppointments = computed(() => this.appointments().length);
  pendingCount = computed(() => this.appointments().filter((a) => a.status === 'pending').length);
  approvedCount = computed(() => this.appointments().filter((a) => a.status === 'approved').length);

  ngOnInit(): void {
    this.api.getMe().subscribe({
      next: (user) => this.doctorName.set(user.name),
      error: () => {},
    });

    this.api.faceStatus().subscribe({
      next: (s) => this.faceEnrolled.set(!!s.enrolled),
      error: () => {},
    });

    this.loadAppointments();
  }

  openFaceEnroll(): void {
    this.faceModalOpen.set(true);
  }

  onFaceCaptured(descriptor: number[]): void {
    this.faceModalOpen.set(false);
    this.faceBusy.set(true);
    this.api.enrollFace(descriptor).subscribe({
      next: (s) => {
        this.faceBusy.set(false);
        this.faceEnrolled.set(!!s.enrolled);
        this.toast.success('Face ID set up. You can now sign in by face.');
      },
      error: () => {
        this.faceBusy.set(false);
        this.toast.error('Could not save your face. Please try again.');
      },
    });
  }

  onFaceCancelled(): void {
    this.faceModalOpen.set(false);
  }

  removeFaceEnrollment(): void {
    if (!confirm('Remove Face ID for this doctor account?')) return;
    this.faceBusy.set(true);
    this.api.unenrollFace().subscribe({
      next: () => {
        this.faceBusy.set(false);
        this.faceEnrolled.set(false);
        this.toast.success('Face ID removed.');
      },
      error: () => {
        this.faceBusy.set(false);
        this.toast.error('Could not remove Face ID.');
      },
    });
  }

  loadAppointments(): void {
    this.api.getDoctorAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Something went wrong. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  approveAppointment(id: number): void {
    this.api.approveAppointment(id).subscribe({
      next: (updated) => {
        this.appointments.update((list) =>
          list.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)),
        );
        this.toast.success('Appointment approved!');
      },
      error: () => this.toast.error('Failed to approve appointment.'),
    });
  }
}
