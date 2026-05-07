import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FaceRecognitionService } from '../../services/face-recognition.service';

export type FaceCaptureMode = 'enroll' | 'login';

/**
 * Modal that opens the camera, lets the user position their face, and captures a
 * single 128-dim face descriptor. Used by both the doctor enrollment flow on the
 * dashboard and the Face ID sign-in on the doctor-login page.
 */
@Component({
  selector: 'app-face-capture',
  imports: [],
  templateUrl: './face-capture.html',
  styleUrl: './face-capture.scss',
})
export class FaceCapture implements OnDestroy {
  private faceRec = inject(FaceRecognitionService);

  @Input() open = false;
  @Input() mode: FaceCaptureMode = 'login';
  @Input() title = 'Face ID';
  @Output() captured = new EventEmitter<number[]>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('videoEl') videoElRef?: ElementRef<HTMLVideoElement>;

  status = signal<'idle' | 'loading' | 'streaming' | 'capturing' | 'error'>('idle');
  errorText = signal<string>('');

  private stream: MediaStream | null = null;
  /** Cancels the auto-capture loop when the modal closes. */
  private autoCaptureLoop: number | null = null;

  ngOnChanges(): void {
    if (this.open && this.status() === 'idle') {
      void this.start();
    }
    if (!this.open && this.status() !== 'idle') {
      this.stopCamera();
      this.status.set('idle');
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  async start(): Promise<void> {
    this.errorText.set('');
    this.status.set('loading');

    try {
      await this.faceRec.ensureReady();
    } catch (err) {
      console.error('Face model load failed', err);
      this.status.set('error');
      this.errorText.set('Could not load the face model. Check your network and try again.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.status.set('error');
      this.errorText.set('Your browser does not support camera capture.');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
    } catch (err: any) {
      console.error('Camera permission failed', err);
      this.status.set('error');
      this.errorText.set(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera in your browser site settings and retry.'
          : 'Could not start the camera. Check that no other app is using it.',
      );
      return;
    }

    // Wait one tick so #videoEl is in the DOM
    setTimeout(() => {
      const video = this.videoElRef?.nativeElement;
      if (!video || !this.stream) {
        this.status.set('error');
        this.errorText.set('Camera element missing.');
        return;
      }
      video.srcObject = this.stream;
      video.play().catch(() => {
        /* autoplay refusal is fine — onloadedmetadata will fire */
      });
      this.status.set('streaming');
      // Start auto-capture: try to detect a face every 600ms; on success, emit and stop.
      this.startAutoCapture();
    }, 0);
  }

  private startAutoCapture(): void {
    const tick = async () => {
      if (this.status() !== 'streaming') return;
      const video = this.videoElRef?.nativeElement;
      if (!video || video.readyState < 2) {
        this.autoCaptureLoop = window.setTimeout(tick, 400);
        return;
      }
      try {
        const desc = await this.faceRec.detectDescriptor(video);
        if (desc) {
          this.status.set('capturing');
          const arr = this.faceRec.descriptorToArray(desc);
          this.stopCamera();
          this.captured.emit(arr);
          return;
        }
      } catch (err) {
        console.warn('Face detect tick error', err);
      }
      this.autoCaptureLoop = window.setTimeout(tick, 600);
    };
    this.autoCaptureLoop = window.setTimeout(tick, 800);
  }

  retry(): void {
    void this.start();
  }

  cancel(): void {
    this.stopCamera();
    this.status.set('idle');
    this.cancelled.emit();
  }

  private stopCamera(): void {
    if (this.autoCaptureLoop !== null) {
      window.clearTimeout(this.autoCaptureLoop);
      this.autoCaptureLoop = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = this.videoElRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }
}
