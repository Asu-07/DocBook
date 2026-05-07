import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { formatApiError } from '../../core/utils/api-error';
import { FaceCapture } from '../../components/face-capture/face-capture';
import { ToastService } from '../../components/toast/toast.service';

@Component({
  selector: 'app-doctor-login',
  imports: [FormsModule, RouterLink, FaceCapture],
  templateUrl: './doctor-login.html',
  styleUrl: './doctor-login.scss',
})
export class DoctorLogin {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  email = '';
  password = '';
  errorMessage = signal('');
  isSubmitting = signal(false);
  faceModalOpen = signal(false);
  faceVerifying = signal(false);

  submitLogin(form: NgForm): void {
    if (form.invalid) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.login(this.email, this.password).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.role !== 'doctor') {
          // Wrong portal — clear the issued token and redirect them to the right place.
          this.api.logout();
          this.errorMessage.set('This account is not registered as a doctor. Use the patient or hospital sign-in instead.');
          return;
        }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/doctor-dashboard');
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(formatApiError(err, 'Invalid email or password.'));
      },
    });
  }

  openFaceLogin(): void {
    this.errorMessage.set('');
    if (!this.email.trim()) {
      this.errorMessage.set('Enter your email so we know whose face to verify.');
      return;
    }
    this.faceModalOpen.set(true);
  }

  onFaceCaptured(descriptor: number[]): void {
    this.faceModalOpen.set(false);
    this.faceVerifying.set(true);
    this.api.loginByFace(this.email, descriptor).subscribe({
      next: (res) => {
        this.faceVerifying.set(false);
        if (res.role !== 'doctor') {
          this.api.logout();
          this.errorMessage.set('This account is not registered as a doctor.');
          return;
        }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/doctor-dashboard');
      },
      error: (err: HttpErrorResponse) => {
        this.faceVerifying.set(false);
        this.errorMessage.set(formatApiError(err, 'Face did not match. Try password sign-in or set up Face ID first.'));
        this.toast.error('Face ID verification failed.');
      },
    });
  }

  onFaceCancelled(): void {
    this.faceModalOpen.set(false);
  }
}
