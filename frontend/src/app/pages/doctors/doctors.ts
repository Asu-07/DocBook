import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DoctorCard } from '../../components/doctor-card/doctor-card';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { ApiService } from '../../services/api.service';
import { Doctor } from '../../models/doctor.model';

@Component({
  selector: 'app-doctors',
  imports: [FormsModule, DoctorCard, LoadingSpinner],
  templateUrl: './doctors.html',
  styleUrl: './doctors.scss',
})
export class Doctors implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  doctors = signal<Doctor[]>([]);
  searchTerm = signal('');
  activeSuggestionIndex = signal(-1);
  /** Optional region hint from home search (informational until API filters by region). */
  regionHint = signal<string | null>(null);
  isLoading = signal(true);
  errorMessage = signal('');

  filteredDoctors = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.doctors();
    return this.doctors().filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        d.specialization.toLowerCase().includes(term),
    );
  });

  suggestions = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [] as string[];

    const names = this.doctors()
      .map((d) => d.name.trim())
      .filter((name) => name.toLowerCase().includes(term));
    const specs = this.doctors()
      .map((d) => d.specialization.trim())
      .filter((spec) => spec.toLowerCase().includes(term));

    return [...new Set([...names, ...specs])].slice(0, 7);
  });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) {
      this.searchTerm.set(q);
    }
    const region = this.route.snapshot.queryParamMap.get('region');
    if (region) {
      this.regionHint.set(region);
    }
    this.loadDoctors();
  }

  reload(): void {
    this.errorMessage.set('');
    this.isLoading.set(true);
    this.loadDoctors();
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.activeSuggestionIndex.set(-1);
  }

  applySuggestion(value: string): void {
    this.searchTerm.set(value);
    this.activeSuggestionIndex.set(-1);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const list = this.suggestions();
    if (!list.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = this.activeSuggestionIndex() + 1;
      this.activeSuggestionIndex.set(next >= list.length ? 0 : next);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = this.activeSuggestionIndex() - 1;
      this.activeSuggestionIndex.set(prev < 0 ? list.length - 1 : prev);
      return;
    }

    if (event.key === 'Enter') {
      const idx = this.activeSuggestionIndex();
      if (idx >= 0 && idx < list.length) {
        event.preventDefault();
        this.applySuggestion(list[idx]);
      }
    }
  }

  resetSuggestionSelection(): void {
    this.activeSuggestionIndex.set(-1);
  }

  private loadDoctors(): void {
    this.api.getDoctors().subscribe({
      next: (data) => {
        this.doctors.set(data);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 0) {
          this.errorMessage.set(
            'Cannot reach the server. Start the backend (uvicorn) and check the API URL / CORS.',
          );
        } else {
          this.errorMessage.set(err.error?.detail ?? 'Something went wrong. Please try again.');
        }
        this.isLoading.set(false);
      },
    });
  }
}
