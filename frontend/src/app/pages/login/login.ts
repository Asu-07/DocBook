import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { formatApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
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
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else {
          const roleRoutes: Record<string, string> = {
            doctor: '/doctor-dashboard',
            hospital: '/hospital/dashboard',
            admin: '/admin',
          };
          const target = roleRoutes[res.role] ?? '/doctors';
          this.router.navigate([target]);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(formatApiError(err, 'Invalid email or password.'));
      },
    });
  }
}
