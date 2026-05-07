import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Doctor } from '../models/doctor.model';
import { Appointment } from '../models/appointment.model';
import { User } from '../models/user.model';
import { AdminStats, Hospital, HospitalDashboard, HospitalPatient, PublicStats } from '../models/hospital.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  getRole(): string {
    return localStorage.getItem('role') ?? 'user';
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  }

  // Auth
  getMe(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/auth/me`, { headers: this.getAuthHeaders() });
  }

  login(email: string, password: string): Observable<{ access_token: string; token_type: string; role: string }> {
    return this.http
      .post<{ access_token: string; token_type: string; role: string }>(`${this.baseUrl}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem('token', res.access_token);
          localStorage.setItem('role', res.role);
        }),
      );
  }

  register(user: User): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/auth/register`, user);
  }

  /** Patient / doctor self-registration — only sends fields the API expects. */
  registerAccount(payload: { name: string; email: string; password: string; role: 'user' | 'doctor' }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/auth/register`, {
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      role: payload.role,
    });
  }

  /** Sign in by face descriptor (computed locally with face-api.js). Doctor accounts only. */
  loginByFace(email: string, descriptor: number[]): Observable<{ access_token: string; token_type: string; role: string }> {
    return this.http
      .post<{ access_token: string; token_type: string; role: string }>(`${this.baseUrl}/auth/face/login`, {
        email: email.trim().toLowerCase(),
        descriptor,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem('token', res.access_token);
          localStorage.setItem('role', res.role);
        }),
      );
  }

  faceStatus(): Observable<{ enrolled: boolean }> {
    return this.http.get<{ enrolled: boolean }>(`${this.baseUrl}/auth/face/status`, { headers: this.getAuthHeaders() });
  }

  enrollFace(descriptor: number[]): Observable<{ enrolled: boolean }> {
    return this.http.post<{ enrolled: boolean }>(
      `${this.baseUrl}/auth/face/enroll`,
      { descriptor },
      { headers: this.getAuthHeaders() },
    );
  }

  unenrollFace(): Observable<{ enrolled: boolean }> {
    return this.http.delete<{ enrolled: boolean }>(`${this.baseUrl}/auth/face/enroll`, {
      headers: this.getAuthHeaders(),
    });
  }

  registerHospital(payload: {
    name: string;
    email: string;
    password: string;
    hospital_name: string;
    address?: string;
    phone?: string;
  }): Observable<Hospital> {
    return this.http.post<Hospital>(`${this.baseUrl}/auth/register/hospital`, {
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      hospital_name: payload.hospital_name.trim(),
      address: payload.address?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
    });
  }

  // Hospitals (public)
  getHospitals(): Observable<Hospital[]> {
    return this.http.get<Hospital[]>(`${this.baseUrl}/hospitals/`);
  }

  getHospitalsByRegion(region: string): Observable<Hospital[]> {
    return this.http.get<Hospital[]>(`${this.baseUrl}/hospitals/`, { params: { region } });
  }

  /** DB hospitals with lat/lon within radius (km), nearest first. Falls back to region list if none. */
  getHospitalsNear(latitude: number, longitude: number, radiusKm = 75): Observable<Hospital[]> {
    return this.http.get<Hospital[]>(`${this.baseUrl}/hospitals/near`, {
      params: {
        latitude: String(latitude),
        longitude: String(longitude),
        radius_km: String(radiusKm),
      },
    });
  }

  getPublicStats(): Observable<PublicStats> {
    return this.http.get<PublicStats>(`${this.baseUrl}/stats/public`);
  }

  getHospitalRegions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/hospitals/regions`);
  }

  reverseGeocode(latitude: number, longitude: number): Observable<{
    region: string;
    label: string;
    latitude: number;
    longitude: number;
  }> {
    return this.http.get<{
      region: string;
      label: string;
      latitude: number;
      longitude: number;
    }>(`${this.baseUrl}/location/reverse`, {
      params: { latitude: String(latitude), longitude: String(longitude) },
    });
  }

  getDoctorTypesByHospital(hospitalId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/hospitals/${hospitalId}/doctor-types`);
  }

  // Doctors
  getDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.baseUrl}/doctors/`);
  }

  getDoctorsByHospital(hospitalId: number): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.baseUrl}/doctors/`, { params: { hospital_id: hospitalId } });
  }

  getDoctorsByHospitalAndType(hospitalId: number, specialization: string): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.baseUrl}/doctors/`, {
      params: { hospital_id: hospitalId, specialization },
    });
  }

  // Appointments
  getAppointments(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.baseUrl}/appointments/me`, { headers: this.getAuthHeaders() });
  }

  bookAppointment(payload: {
    doctor_id: number;
    appointment_date: string;
    appointment_time: string;
    notes?: string;
  }): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.baseUrl}/appointments/`, payload, { headers: this.getAuthHeaders() });
  }

  getDoctorAppointments(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.baseUrl}/appointments/doctor`, { headers: this.getAuthHeaders() });
  }

  approveAppointment(appointmentId: number): Observable<Appointment> {
    return this.http.patch<Appointment>(`${this.baseUrl}/appointments/${appointmentId}/approve`, {}, { headers: this.getAuthHeaders() });
  }

  cancelAppointment(appointmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/appointments/${appointmentId}`, { headers: this.getAuthHeaders() });
  }

  // Admin
  getAdminStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.baseUrl}/admin/stats`, { headers: this.getAuthHeaders() });
  }

  getAdminUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/admin/users`, { headers: this.getAuthHeaders() });
  }

  getAdminAppointments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/admin/appointments`, { headers: this.getAuthHeaders() });
  }

  getAdminHospitals(): Observable<Hospital[]> {
    return this.http.get<Hospital[]>(`${this.baseUrl}/admin/hospitals`, { headers: this.getAuthHeaders() });
  }

  // Hospital
  getHospitalDashboard(): Observable<HospitalDashboard> {
    return this.http.get<HospitalDashboard>(`${this.baseUrl}/hospital/dashboard`, { headers: this.getAuthHeaders() });
  }

  getHospitalDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.baseUrl}/hospital/doctors`, { headers: this.getAuthHeaders() });
  }

  addHospitalDoctor(payload: {
    name: string;
    specialization: string;
    experience_years: number;
  }): Observable<Doctor> {
    return this.http.post<Doctor>(`${this.baseUrl}/hospital/doctors`, payload, { headers: this.getAuthHeaders() });
  }

  getHospitalAppointments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/hospital/appointments`, { headers: this.getAuthHeaders() });
  }

  confirmHospitalAppointment(appointmentId: number, appointmentDate: string, appointmentTime: string): Observable<Appointment> {
    return this.http.patch<Appointment>(
      `${this.baseUrl}/hospital/appointments/${appointmentId}/confirm`,
      { appointment_date: appointmentDate, appointment_time: appointmentTime },
      { headers: this.getAuthHeaders() },
    );
  }

  getHospitalPatients(): Observable<HospitalPatient[]> {
    return this.http.get<HospitalPatient[]>(`${this.baseUrl}/hospital/patients`, { headers: this.getAuthHeaders() });
  }
}
