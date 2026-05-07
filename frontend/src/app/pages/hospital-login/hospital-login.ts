import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { formatApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-hospital-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './hospital-login.html',
  styleUrl: './hospital-login.scss',
})
export class HospitalLogin {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  errorMessage = signal('');
  isSubmitting = signal(false);

  submitLogin(form: NgForm): void {
    if (form.invalid) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.login(this.email, this.password).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.role !== 'hospital') {
          this.errorMessage.set('This account is not registered as a hospital.');
          this.api.logout();
          return;
        }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/hospital/dashboard');
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(formatApiError(err, 'Invalid email or password.'));
      },
    });
  }
}
