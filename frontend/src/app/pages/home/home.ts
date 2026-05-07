import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../components/toast/toast.service';
import { Doctor } from '../../models/doctor.model';
import { Hospital } from '../../models/hospital.model';
import { DoctorCard } from '../../components/doctor-card/doctor-card';

export type SpecialtyIconKind =
  | 'cardio'
  | 'dental'
  | 'ortho'
  | 'neuro'
  | 'pediatric'
  | 'derma'
  | 'gyneco'
  | 'general'
  | 'default';

export interface SpecialtyShowcaseItem {
  spec: string;
  hint: string;
  icon: SpecialtyIconKind;
}

interface HomePathCard {
  title: string;
  desc: string;
  link: string;
  tint: 'rose' | 'blush' | 'slate' | 'mist';
  queryFromRegion: boolean;
  fragment?: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DecimalPipe, DoctorCard, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  readonly api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  steps = [
    { number: '1', title: 'Find the right specialist', desc: 'Browse doctors by specialization, hospital, experience, and patient ratings.' },
    { number: '2', title: 'Pick a slot that works', desc: 'See open dates and times across partner hospitals — choose what fits your day.' },
    { number: '3', title: 'Walk in, not wait in', desc: 'Get a confirmation, show up at your time, and manage everything from one dashboard.' },
  ];

  features: { iconKind: 'calendar' | 'verified' | 'access' | 'secure'; title: string; desc: string }[] = [
    { iconKind: 'calendar', title: 'Real availability', desc: 'See live open slots at hospitals near you — no more guessing or callbacks.' },
    { iconKind: 'verified', title: 'Verified doctors', desc: 'Every doctor is tied to a partner hospital with experience and patient ratings on file.' },
    { iconKind: 'access',   title: 'One place for visits', desc: 'Upcoming, past, and follow-up appointments — all visible from your dashboard.' },
    { iconKind: 'secure',   title: 'Your records, private', desc: 'Health details stay encrypted and only shared with the doctor you choose.' },
  ];

  stats = signal<{ value: string; label: string }[]>([]);
  statsLoaded = signal(false);

  featuredDoctors = signal<Doctor[]>([]);
  allDoctors = signal<Doctor[]>([]);
  regions = signal<string[]>([]);
  specialtyShowcase = signal<SpecialtyShowcaseItem[]>([]);
  previewHospitals = signal<Hospital[]>([]);

  searchQuery = signal('');
  activeSuggestionIndex = signal(-1);
  heroRegion = signal('');
  isLocatingHero = signal(false);
  detectedRegionLabel = signal<string | null>(null);
  /** Counter to ignore stale geolocation callbacks if user retries. */
  private heroGeoAttempt = 0;
  private heroGeoGotPosition = false;

  bookQueryParams = computed(() => {
    const r = this.heroRegion().trim();
    return r ? { region: r } : {};
  });

  searchSuggestions = computed(() => {
    const term = this.searchQuery().trim().toLowerCase();
    if (!term) return [] as string[];

    const names = this.allDoctors()
      .map((d) => d.name.trim())
      .filter((name) => name.toLowerCase().includes(term));
    const specs = this.allDoctors()
      .map((d) => d.specialization.trim())
      .filter((spec) => spec.toLowerCase().includes(term));

    return [...new Set([...names, ...specs])].slice(0, 7);
  });

  /** Quick paths — inspired by common healthcare homepages; routes and copy are DocBook’s own. */
  servicePaths = computed((): HomePathCard[] => {
    const hospitals: HomePathCard = {
      title: 'Partner hospitals',
      desc: 'Explore facilities and find care close to you.',
      link: '/',
      fragment: 'partner-hospitals',
      tint: 'mist',
      queryFromRegion: false,
    };
    const book: HomePathCard = {
      title: 'Book a visit',
      desc: 'Pick a region, hospital, doctor, and time slot in a guided flow.',
      link: '/book-appointment',
      tint: 'blush',
      queryFromRegion: true,
    };
    const find: HomePathCard = {
      title: 'Find a doctor',
      desc: 'Search by specialization or name across our hospital network.',
      link: '/doctors',
      tint: 'rose',
      queryFromRegion: false,
    };
    if (this.api.isLoggedIn()) {
      return [
        find,
        book,
        {
          title: 'Your appointments',
          desc: 'See upcoming visits and manage bookings in one place.',
          link: '/my-appointments',
          tint: 'slate',
          queryFromRegion: false,
        },
        hospitals,
      ];
    }
    return [
      find,
      book,
      {
        title: 'Create your account',
        desc: 'Save your details and book faster next time.',
        link: '/register',
        tint: 'slate',
        queryFromRegion: false,
      },
      hospitals,
    ];
  });

  ngOnInit(): void {
    const stored = sessionStorage.getItem('docbook_preferred_region');
    if (stored) {
      this.heroRegion.set(stored);
    }

    forkJoin({
      stats: this.api.getPublicStats().pipe(catchError(() => of(null))),
      doctors: this.api.getDoctors().pipe(catchError(() => of([] as Doctor[]))),
      hospitals: this.api.getHospitals().pipe(catchError(() => of([] as Hospital[]))),
      regions: this.api.getHospitalRegions().pipe(catchError(() => of([] as string[]))),
    }).subscribe({
      next: ({ stats: s, doctors, hospitals, regions: regionList }) => {
        if (s) {
          this.stats.set([
            { value: String(s.total_doctors), label: 'Doctors' },
            { value: String(s.total_hospitals), label: 'Hospitals' },
            { value: String(s.total_appointments), label: 'Appointments' },
            { value: String(s.total_regions), label: 'Regions' },
          ]);
        } else {
          this.stats.set([
            { value: '—', label: 'Doctors' },
            { value: '—', label: 'Hospitals' },
            { value: '—', label: 'Appointments' },
            { value: '—', label: 'Regions' },
          ]);
        }
        this.statsLoaded.set(true);

        const featured = [...doctors].sort((a, b) => b.rating - a.rating).slice(0, 6);
        this.allDoctors.set(doctors);
        this.featuredDoctors.set(featured);

        const specs = [...new Set(doctors.map((d) => d.specialization))].sort((a, b) => a.localeCompare(b));

        this.specialtyShowcase.set(
          specs.slice(0, 8).map((spec) => ({
            spec,
            hint: this.hintForSpec(spec),
            icon: this.iconKindForSpec(spec),
          })),
        );

        const regionsSorted = [...regionList].sort((a, b) => a.localeCompare(b));
        this.regions.set(regionsSorted);
        const hr = this.heroRegion();
        if (hr && !regionsSorted.some((r) => r === hr)) {
          this.heroRegion.set('');
        }

        const hospitalsSorted = [...hospitals].sort((a, b) => a.name.localeCompare(b.name));
        this.previewHospitals.set(hospitalsSorted.slice(0, 6));
      },
      error: () => {
        this.statsLoaded.set(true);
      },
    });
  }

  private hintForSpec(spec: string): string {
    const s = spec.toLowerCase();
    if (s.includes('cardio')) return 'Heart & blood pressure';
    if (s.includes('pediat')) return 'Infants & children';
    if (s.includes('derma')) return 'Skin, hair & allergies';
    if (s.includes('ortho')) return 'Bones & joints';
    if (s.includes('neuro')) return 'Brain & nerves';
    if (s.includes('gyn')) return 'Women’s health';
    if (s.includes('dent')) return 'Teeth & gums';
    if (s.includes('general')) return 'First point of care';
    return 'Talk to a specialist';
  }

  private iconKindForSpec(spec: string): SpecialtyIconKind {
    const s = spec.toLowerCase();
    if (s.includes('cardio')) return 'cardio';
    if (s.includes('dent')) return 'dental';
    if (s.includes('ortho')) return 'ortho';
    if (s.includes('neuro')) return 'neuro';
    if (s.includes('pediat')) return 'pediatric';
    if (s.includes('derma')) return 'derma';
    if (s.includes('gyn')) return 'gyneco';
    if (s.includes('general')) return 'general';
    return 'default';
  }

  runSearch(): void {
    const q = this.searchQuery().trim();
    this.activeSuggestionIndex.set(-1);
    const region = this.heroRegion().trim();
    if (region) {
      sessionStorage.setItem('docbook_preferred_region', region);
    } else {
      sessionStorage.removeItem('docbook_preferred_region');
    }
    const params: Record<string, string> = {};
    if (q) params['q'] = q;
    if (region) params['region'] = region;
    this.router.navigate(['/doctors'], { queryParams: Object.keys(params).length ? params : {} });
  }

  onHeroSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.activeSuggestionIndex.set(-1);
  }

  applyHeroSuggestion(value: string): void {
    this.searchQuery.set(value);
    this.activeSuggestionIndex.set(-1);
  }

  onHeroSearchKeydown(event: KeyboardEvent): void {
    const list = this.searchSuggestions();
    if (event.key === 'Enter') {
      const idx = this.activeSuggestionIndex();
      if (idx >= 0 && idx < list.length) {
        event.preventDefault();
        this.applyHeroSuggestion(list[idx]);
      }
      this.runSearch();
      return;
    }
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
    }
  }

  clearHeroSuggestionSelection(): void {
    this.activeSuggestionIndex.set(-1);
  }

  useMyLocationForRegion(): void {
    if (!navigator.geolocation) {
      this.toast.error('Location is not supported in this browser. Pick a city from the list.');
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      this.toast.error('Location needs HTTPS. Pick a city from the list.');
      return;
    }

    const attempt = ++this.heroGeoAttempt;
    this.heroGeoGotPosition = false;
    this.detectedRegionLabel.set(null);
    this.isLocatingHero.set(true);

    const finishWithPosition = (pos: GeolocationPosition) => {
      if (attempt !== this.heroGeoAttempt) return;
      this.heroGeoGotPosition = true;
      this.api.reverseGeocode(pos.coords.latitude, pos.coords.longitude).subscribe({
        next: (loc) => {
          if (attempt !== this.heroGeoAttempt) return;
          this.isLocatingHero.set(false);
          this.detectedRegionLabel.set(loc.region);
          const list = this.regions();
          const match = list.find((r) => r.toLowerCase() === loc.region.toLowerCase());
          if (match) {
            this.heroRegion.set(match);
            sessionStorage.setItem('docbook_preferred_region', match);
            this.toast.success(`Region set to ${match}`);
          } else {
            this.toast.show(
              `We detected "${loc.region}", which isn't on our network yet. Pick the closest city from the list.`,
              'info',
            );
          }
        },
        error: (err) => {
          if (attempt !== this.heroGeoAttempt) return;
          this.isLocatingHero.set(false);
          const msg = err?.error?.detail ?? 'Could not resolve your area from location.';
          this.toast.error(msg);
        },
      });
    };

    const onFinalError = (err: GeolocationPositionError) => {
      if (attempt !== this.heroGeoAttempt) return;
      this.isLocatingHero.set(false);
      // Browsers occasionally deliver a late error after a successful fix — never toast then.
      const msg =
        err.code === 1
          ? 'Location permission denied. Allow access in your browser address bar (lock icon → Site settings → Location), then try again.'
          : err.code === 2
            ? "Couldn't get a position fix. Check that your OS location service is on, or pick a city manually."
            : 'Location request timed out. Try again or pick a city manually.';
      setTimeout(() => {
        if (attempt !== this.heroGeoAttempt) return;
        if (this.heroGeoGotPosition) return;
        this.toast.error(msg);
      }, 350);
    };

    const onGeoError = (err: GeolocationPositionError) => {
      if (attempt !== this.heroGeoAttempt) return;
      if (this.heroGeoGotPosition) return;
      // TIMEOUT — retry once with cached / lower-accuracy fix.
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

    navigator.geolocation.getCurrentPosition(finishWithPosition, onGeoError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  }
}
