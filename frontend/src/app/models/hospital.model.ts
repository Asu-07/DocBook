export interface Hospital {
  id: number;
  name: string;
  region: string;
  address?: string;
  phone?: string;
  latitude?: number | null;
  longitude?: number | null;
  user_id: number;
}

export interface PublicStats {
  total_doctors: number;
  total_hospitals: number;
  total_appointments: number;
  total_regions: number;
}

export interface HospitalDashboard {
  hospital: Hospital;
  total_doctors: number;
  total_appointments: number;
  total_patients: number;
}

export interface AdminStats {
  total_users: number;
  total_doctors: number;
  total_appointments: number;
  total_hospitals: number;
  booked_appointments: number;
  cancelled_appointments: number;
}

export interface HospitalPatient {
  id: number;
  name: string;
  email: string;
  total_appointments: number;
}
