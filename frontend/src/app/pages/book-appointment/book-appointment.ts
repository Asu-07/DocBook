import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { Doctor } from '../../models/doctor.model';
import { Hospital } from '../../models/hospital.model';

@Component({
  selector: 'app-book-appointment',
  imports: [FormsModule, RouterLink, LoadingSpinner],
  templateUrl: './book-appointment.html',
  styleUrl: './book-appointment.scss',
})
export class BookAppointment implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  patientName = signal('');
  /** Filled from GET /hospitals/regions (database). */
  regions = signal<string[]>([]);
  selectedRegion = signal('');
  locationHint = signal('');
  /** Shown in the region UI after a successful "Use my location" resolve. */
  detectedRegion = signal<string | null>(null);
  isLocating = signal(false);
  hospitals = signal<Hospital[]>([]);
  selectedHospitalId = signal<number | null>(null);
  doctorTypes = signal<string[]>([]);
  selectedDoctorType = signal('');
  doctors = signal<Doctor[]>([]);
  selectedDoctorId = signal<number | null>(null);
  appointmentDate = '';
  appointmentTime = '';
  notes = '';

  isLoadingHospitals = signal(true);
  isLoadingDoctors = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal('');

  /** Ignores stale HTTP responses when region / location loads overlap. */
  private hospitalLoadSeq = 0;
  /** Ignores stale geolocation callbacks when user taps "Use my location" again. */
  private geoAttempt = 0;
  /** True once we have a GPS fix for the current attempt — suppresses late error toasts. */
  private geoGotPosition = false;

  selectedHospitalName = computed(() => {
    const id = this.selectedHospitalId();
    const match = this.hospitals().find((h) => h.id === id);
    return match?.name ?? '';
  });

  ngOnInit(): void {
    this.api.getMe().subscribe({
      next: (user) => this.patientName.set(user.name),
      error: () => this.errorMessage.set('Could not load your profile.'),
    });

    const regionFromUrl = this.route.snapshot.queryParamMap.get('region')?.trim() ?? '';

    this.api.getHospitalRegions().subscribe({
      next: (list) => {
        if (list.length) {
          this.regions.set(list);
          const match =
            regionFromUrl &&
            list.find((x) => x.toLowerCase() === regionFromUrl.toLowerCase());
          const chosen = match ?? (this.selectedRegion() && list.includes(this.selectedRegion()) ? this.selectedRegion() : list[0]);
          this.selectedRegion.set(chosen);
        }
        const r = this.selectedRegion();
        if (r) this.loadHospitalsForArea(r);
        else this.isLoadingHospitals.set(false);
      },
      error: () => {
        const r = this.selectedRegion();
        if (r) this.loadHospitalsForArea(r);
        else this.isLoadingHospitals.set(false);
      },
    });
  }

  onRegionChange(region: string): void {
    this.locationHint.set('');
    this.detectedRegion.set(null);
    this.selectedRegion.set(region);
    this.selectedHospitalId.set(null);
    this.selectedDoctorType.set('');
    this.selectedDoctorId.set(null);
    this.doctorTypes.set([]);
    this.doctors.set([]);
    this.loadHospitalsForArea(region);
  }

  useMyLocation(): void {
    if (!navigator.geolocation) {
      this.toast.error('Location is not supported in this browser.');
      return;
    }
    const attempt = ++this.geoAttempt;
    this.geoGotPosition = false;
    this.detectedRegion.set(null);
    this.isLocating.set(true);
    this.errorMessage.set('');

    const finishWithPosition = (pos: GeolocationPosition) => {
      if (attempt !== this.geoAttempt) return;
      this.geoGotPosition = true;
      this.api.reverseGeocode(pos.coords.latitude, pos.coords.longitude).subscribe({
        next: (loc) => {
          if (attempt !== this.geoAttempt) return;
          this.isLocating.set(false);
          this.locationHint.set(loc.label);
          this.detectedRegion.set(loc.region);
          this.regions.update((list) => {
            if (list.includes(loc.region)) return list;
            return [...list, loc.region].sort((a, b) => a.localeCompare(b));
          });
          this.selectedRegion.set(loc.region);
          this.selectedHospitalId.set(null);
          this.selectedDoctorType.set('');
          this.selectedDoctorId.set(null);
          this.doctorTypes.set([]);
          this.doctors.set([]);
          this.loadHospitalsForArea(loc.region, { lat: loc.latitude, lon: loc.longitude });
          this.toast.success(`Showing hospitals near ${loc.region}`);
        },
        error: (err) => {
          if (attempt !== this.geoAttempt) return;
          this.isLocating.set(false);
          const msg = err.error?.detail ?? 'Could not resolve your area from location.';
          this.toast.error(msg);
        },
      });
    };

    const onGeoError = (err: GeolocationPositionError) => {
      if (attempt !== this.geoAttempt) return;
      if (this.geoGotPosition) return;
      // TIMEOUT (3): try again with cached / lower accuracy — avoids spurious error + success toasts.
      if (err.code === 3) {
        navigator.geolocation.getCurrentPosition(finishWithPosition, onFinalError, {
          enableHighAccuracy: false,
          timeout: 25000,
          maximumAge: 300000,
        });
        return;
      }
      onFinalError(err);
    };

    const onFinalError = (err: GeolocationPositionError) => {
      if (attempt !== this.geoAttempt) return;
      this.isLocating.set(false);
      // Browsers sometimes deliver a late error after a successful fix — never toast if we already got coords.
      const msg =
        err.code === 1
          ? 'Location permission denied. Enable it in your browser settings and try again.'
          : 'Could not get your position. Try again or pick a region from the list.';
      setTimeout(() => {
        if (attempt !== this.geoAttempt) return;
        if (this.geoGotPosition) return;
        this.toast.error(msg);
      }, 350);
    };

    navigator.geolocation.getCurrentPosition(finishWithPosition, onGeoError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  }

  /**
   * Loads hospitals from the API: prefers GPS radius when coords are given (DB lat/lon),
   * otherwise filters by region.m
   */
  private loadHospitalsForArea(region: string, coords?: { lat: number; lon: number }): void {
    const seq = ++this.hospitalLoadSeq;
    this.isLoadingHospitals.set(true);
    this.errorMessage.set('');

    const apply = (data: Hospital[]) => {
      if (seq !== this.hospitalLoadSeq) return;
      this.hospitals.set(data);
      this.isLoadingHospitals.set(false);
    };

    const fail = () => {
      if (seq !== this.hospitalLoadSeq) return;
      this.errorMessage.set('Could not load hospitals.');
      this.isLoadingHospitals.set(false);
    };

    const byRegion = () => {
      this.api.getHospitalsByRegion(region).subscribe({
        next: apply,
        error: fail,
      });
    };

    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
      this.api.getHospitalsNear(coords.lat, coords.lon).subscribe({
        next: (data) => {
          if (seq !== this.hospitalLoadSeq) return;
          if (data.length) apply(data);
          else byRegion();
        },
        error: () => {
          if (seq !== this.hospitalLoadSeq) return;
          byRegion();
        },
      });
    } else {
      byRegion();
    }
  }

  onHospitalSelect(hospitalId: number): void {
    this.selectedHospitalId.set(hospitalId);
    this.selectedDoctorType.set('');
    this.selectedDoctorId.set(null);
    this.doctorTypes.set([]);
    this.doctors.set([]);
    this.errorMessage.set('');

    this.api.getDoctorTypesByHospital(hospitalId).subscribe({
      next: (data) => {
        this.doctorTypes.set(data);
        this.scrollToSection('booking-doctor-types');
      },
      error: () => {
        this.errorMessage.set('Could not load doctor types for this hospital.');
      },
    });
  }

  onDoctorTypeSelect(doctorType: string): void {
    const hospitalId = this.selectedHospitalId();
    if (!hospitalId) return;

    this.selectedDoctorType.set(doctorType);
    this.selectedDoctorId.set(null);
    this.doctors.set([]);
    this.isLoadingDoctors.set(true);
    this.errorMessage.set('');

    this.api.getDoctorsByHospitalAndType(hospitalId, doctorType).subscribe({
      next: (data) => {
        this.doctors.set(data);
        this.isLoadingDoctors.set(false);
        this.scrollToSection('booking-doctors');

        const paramId = this.route.snapshot.paramMap.get('doctorId');
        if (paramId) {
          const numId = Number(paramId);
          if (data.some((d) => d.id === numId)) {
            this.selectedDoctorId.set(numId);
            this.scrollToSection('booking-schedule');
          }
        }
      },
      error: () => {
        this.errorMessage.set('Could not load doctors for selected type.');
        this.isLoadingDoctors.set(false);
      },
    });
  }

  onDoctorSelect(doctorId: number): void {
    this.selectedDoctorId.set(doctorId);
    this.scrollToSection('booking-schedule');
  }

  /** Smooth-scroll to the next step after the DOM updates. */
  private scrollToSection(elementId: string): void {
    queueMicrotask(() => {
      setTimeout(() => {
        document.getElementById(elementId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 50);
    });
  }

  submitAppointment(form: NgForm): void {
    if (form.invalid) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.bookAppointment({
      doctor_id: Number(this.selectedDoctorId()),
      appointment_date: this.appointmentDate,
      appointment_time: this.appointmentTime,
      notes: this.notes || undefined,
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success('Appointment submitted! Waiting for doctor approval.');
        const name = this.patientName();
        const hospId = this.selectedHospitalId();
        form.resetForm();
        this.patientName.set(name);
        if (hospId) {
          this.selectedHospitalId.set(hospId);
          this.onHospitalSelect(hospId);
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg = err.error?.detail ?? 'Something went wrong. Please try again.';
        this.errorMessage.set(msg);
        this.toast.error(msg);
      },
    });
  }
}
