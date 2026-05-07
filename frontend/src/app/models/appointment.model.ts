export interface Appointment {
  id?: number;
  doctor_id: number;
  patient_name?: string;
  patient_email?: string;
  appointment_date: string;
  appointment_time: string;
  notes?: string;
  status?: string;
  doctor_name?: string;
  doctor_specialization?: string;
}
