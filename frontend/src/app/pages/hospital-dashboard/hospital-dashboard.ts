import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { HospitalDashboard as HospitalDashboardData, HospitalPatient } from '../../models/hospital.model';
import { Doctor } from '../../models/doctor.model';

@Component({
  selector: 'app-hospital-dashboard',
  imports: [FormsModule, LoadingSpinner],
  templateUrl: './hospital-dashboard.html',
  styleUrl: './hospital-dashboard.scss',
})
export class HospitalDashboard implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  dashboard = signal<HospitalDashboardData | null>(null);
  doctors = signal<Doctor[]>([]);
  patients = signal<HospitalPatient[]>([]);
  appointments = signal<any[]>([]);
  isLoading = signal(true);
  confirmingId = signal<number | null>(null);
  activeTab = signal<'doctors' | 'patients' | 'appointments'>('doctors');

  showAddDoctor = signal(false);
  isAddingDoctor = signal(false);
  newDoctorName = '';
  newDoctorSpec = '';
  newDoctorExp: number | null = null;

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.api.getHospitalDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });

    this.api.getHospitalDoctors().subscribe({ next: (data) => this.doctors.set(data) });
    this.api.getHospitalPatients().subscribe({ next: (data) => this.patients.set(data) });
    this.api.getHospitalAppointments().subscribe({ next: (data) => this.appointments.set(data) });
  }

  confirmAppointment(appointmentId: number, date: string, time: string): void {
    if (!date || !time) {
      this.toast.error('Date and time are required.');
      return;
    }
    this.confirmingId.set(appointmentId);
    this.api.confirmHospitalAppointment(appointmentId, date, time).subscribe({
      next: (updated) => {
        this.appointments.update((list) =>
          list.map((a) =>
            a.id === appointmentId
              ? { ...a, status: updated.status, appointment_date: updated.appointment_date, appointment_time: updated.appointment_time }
              : a,
          ),
        );
        this.toast.success('Appointment confirmed successfully.');
        this.confirmingId.set(null);
      },
      error: (err) => {
        this.toast.error(err.error?.detail ?? 'Failed to confirm appointment.');
        this.confirmingId.set(null);
      },
    });
  }

  confirmWithPrompt(appointmentId: number): void {
    const date = window.prompt('Assign appointment date (YYYY-MM-DD):', '');
    if (!date) return;
    const time = window.prompt('Assign appointment time (HH:MM):', '');
    if (!time) return;
    this.confirmAppointment(appointmentId, date, time);
  }

  submitAddDoctor(form: NgForm): void {
    if (form.invalid || !this.newDoctorExp) return;

    this.isAddingDoctor.set(true);

    this.api.addHospitalDoctor({
      name: this.newDoctorName,
      specialization: this.newDoctorSpec,
      experience_years: this.newDoctorExp,
    }).subscribe({
      next: (doc) => {
        this.doctors.update((list) => [...list, doc]);
        const dash = this.dashboard();
        if (dash) {
          this.dashboard.set({
            ...dash,
            total_doctors: dash.total_doctors + 1,
          });
        }
        this.toast.success(`Dr. ${doc.name} added successfully!`);
        form.resetForm();
        this.showAddDoctor.set(false);
        this.isAddingDoctor.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.detail ?? 'Failed to add doctor.');
        this.isAddingDoctor.set(false);
      },
    });
  }
}
