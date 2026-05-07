import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Doctors } from './pages/doctors/doctors';
import { BookAppointment } from './pages/book-appointment/book-appointment';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { MyAppointments } from './pages/my-appointments/my-appointments';
import { Profile } from './pages/profile/profile';
import { DoctorDashboard } from './pages/doctor-dashboard/doctor-dashboard';
import { AdminDashboard } from './pages/admin-dashboard/admin-dashboard';
import { HospitalDashboard } from './pages/hospital-dashboard/hospital-dashboard';
import { HospitalLogin } from './pages/hospital-login/hospital-login';
import { HospitalRegister } from './pages/hospital-register/hospital-register';
import { DoctorLogin } from './pages/doctor-login/doctor-login';
import { DoctorRegister } from './pages/doctor-register/doctor-register';
import { NotFound } from './pages/not-found/not-found';
import { authGuard } from './guards/auth.guard';
import { doctorGuard } from './guards/doctor.guard';
import { adminGuard } from './guards/admin.guard';
import { hospitalGuard } from './guards/hospital.guard';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'doctors', component: Doctors },
  { path: 'book-appointment', component: BookAppointment, canActivate: [authGuard] },
  { path: 'book-appointment/:doctorId', component: BookAppointment, canActivate: [authGuard] },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'my-appointments', component: MyAppointments, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'doctor-dashboard', component: DoctorDashboard, canActivate: [doctorGuard] },
  { path: 'admin', component: AdminDashboard, canActivate: [adminGuard] },
  { path: 'hospital/login', component: HospitalLogin },
  { path: 'hospital/register', component: HospitalRegister },
  { path: 'hospital/dashboard', component: HospitalDashboard, canActivate: [hospitalGuard] },
  { path: 'doctor/login', component: DoctorLogin },
  { path: 'doctor/register', component: DoctorRegister },
  { path: '**', component: NotFound },
];
