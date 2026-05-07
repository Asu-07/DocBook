import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { formatApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  role = 'user';
  passwordMismatch = false;
  errorMessage = signal('');
  isSubmitting = signal(false);

  submitRegister(form: NgForm): void {
    if (form.invalid) return;

    if (this.password !== this.confirmPassword) {
      this.passwordMismatch = true;
      return;
    }

    this.passwordMismatch = false;
    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api
      .registerAccount({
        name: this.name,
        email: this.email,
        password: this.password,
        role: this.role as 'user' | 'doctor',
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.toast.success('Account created! Please sign in.');
          this.router.navigate(['/login']);
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(formatApiError(err, 'Registration failed. Please try again.'));
        },
      });
  }
}
