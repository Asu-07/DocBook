import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { formatApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-hospital-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './hospital-register.html',
  styleUrl: './hospital-register.scss',
})
export class HospitalRegister {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  hospitalName = '';
  address = '';
  phone = '';
  errorMessage = signal('');
  isSubmitting = signal(false);

  submitRegister(form: NgForm): void {
    if (form.invalid) return;
    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.registerHospital({
      name: this.name,
      email: this.email,
      password: this.password,
      hospital_name: this.hospitalName,
      address: this.address || undefined,
      phone: this.phone || undefined,
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success('Hospital registered! Please sign in.');
        this.router.navigate(['/hospital/login']);
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(formatApiError(err, 'Registration failed. Please try again.'));
      },
    });
  }
}
