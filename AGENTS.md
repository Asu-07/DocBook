# DocBook Project Context

DocBook is a doctor appointment booking platform.

Tech Stack:

Frontend:
- Angular (latest version)
- TypeScript
- Angular Router
- Angular Forms
- Standalone Components
- SCSS

Backend:
- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- PostgreSQL (later)

Project Goal:
Allow users to search doctors by specialization and book appointments easily.

Core Features (MVP):

1. Landing Page
- Welcome page
- CTA button "Find a Doctor"

2. Doctors Page
- List doctors by specialization
- Show doctor name
- Show experience
- Book appointment button

3. Appointment Booking
- Choose doctor
- Enter patient name
- Select date
- Select time
- Save appointment

4. Authentication
- Register
- Login

5. My Appointments
- View booked appointments

Frontend Structure:

frontend/src/app/

components/
- navbar
- doctor-card
- search-bar

pages/
- home
- doctors
- book-appointment
- login
- register
- my-appointments

services/
- api.service.ts

models/
- doctor.model.ts
- appointment.model.ts
- user.model.ts

Backend API Endpoints:

GET /doctors
POST /appointments
GET /appointments
POST /login
POST /register

Project name: DocBook