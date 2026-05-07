#!/usr/bin/env bash
# Comprehensive end-to-end smoke audit of every public + protected route.
# Run from repo root or anywhere; targets local backend + frontend dev servers.

B="${BACKEND:-http://127.0.0.1:8000}"
F="${FRONTEND:-http://localhost:4200}"
OK=0; FAIL=0

pass() { OK=$((OK+1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL  $1 -- $2"; }

# Body assertion via Python
chk() {
  local name=$1 expr=$2 body=$3
  if echo "$body" | python -c "import sys,json; d=json.load(sys.stdin); assert $expr" 2>/dev/null; then
    pass "$name"
  else
    fail "$name" "$(echo "$body" | head -c 200)"
  fi
}

# Status-code check
chkcode() {
  local name=$1 expected=$2 got=$3
  if [ "$got" = "$expected" ]; then pass "$name ($got)"; else fail "$name" "expected $expected got $got"; fi
}

extract_token() {
  python -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
}
extract_id() {
  python -c 'import sys, json; print(json.load(sys.stdin)["id"])'
}

echo "===== HEALTH ====="
chk "GET /health" 'd["status"]=="ok"' "$(curl -s "$B/health")"
chk "GET /"       'd["status"]=="ok"' "$(curl -s "$B/")"

echo
echo "===== STATS / PUBLIC DATA ====="
chk "GET /api/v1/stats/public"          'd["total_doctors"]>=50 and d["total_hospitals"]>=18'   "$(curl -s "$B/api/v1/stats/public")"
chk "GET /api/v1/hospitals/"             'isinstance(d,list) and len(d)>=18'                   "$(curl -s "$B/api/v1/hospitals/")"
chk "GET /api/v1/hospitals/?region=Delhi" 'isinstance(d,list) and all(h["region"]=="Delhi" for h in d)' "$(curl -s "$B/api/v1/hospitals/?region=Delhi")"
chk "GET /api/v1/hospitals/regions"      'isinstance(d,list) and "Delhi" in d and "Mumbai" in d' "$(curl -s "$B/api/v1/hospitals/regions")"
chk "GET /api/v1/hospitals/near"         'isinstance(d,list) and len(d)>0'                      "$(curl -s "$B/api/v1/hospitals/near?latitude=28.61&longitude=77.21&radius_km=100")"
chk "GET /api/v1/hospitals/1/doctor-types" 'isinstance(d,list) and len(d)>0'                    "$(curl -s "$B/api/v1/hospitals/1/doctor-types")"
chk "GET /api/v1/doctors/"               'isinstance(d,list) and len(d)>=50'                    "$(curl -s "$B/api/v1/doctors/")"
chk "GET /api/v1/doctors/?hospital_id=1"  'isinstance(d,list) and len(d)>=2'                    "$(curl -s "$B/api/v1/doctors/?hospital_id=1")"
chk "GET /api/v1/doctors/?specialization=Cardiologist" 'all("Cardio" in x["specialization"] for x in d)' "$(curl -s "$B/api/v1/doctors/?specialization=Cardiologist")"

echo
echo "===== AUTH (PATIENT REGISTER + LOGIN) ====="
EMAIL="audit.$(date +%s)@docbook.local"
REG=$(curl -s -X POST "$B/api/v1/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Audit P\",\"email\":\"$EMAIL\",\"password\":\"AuditP1!\",\"role\":\"user\"}")
chk "POST /auth/register" "d[\"email\"]==\"$EMAIL\" and d[\"role\"]==\"user\"" "$REG"
LOGIN=$(curl -s -X POST "$B/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"AuditP1!\"}")
chk "POST /auth/login" 'd["role"]=="user"' "$LOGIN"
PTOK=$(echo "$LOGIN" | extract_token)
chk "GET /auth/me (patient)" "d[\"email\"]==\"$EMAIL\"" "$(curl -s -H "Authorization: Bearer $PTOK" "$B/api/v1/auth/me")"
chkcode "/auth/login wrong pwd" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"x\"}")"
chkcode "/auth/register dup email" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/v1/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"x\",\"email\":\"$EMAIL\",\"password\":\"AuditP1!\",\"role\":\"user\"}")"

echo
echo "===== AUTH (DOCTOR / HOSPITAL / ADMIN) ====="
DLOG=$(curl -s -X POST "$B/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"dr.krishna.sharma@docbook.local","password":"Doctor123!"}')
chk "Doctor login" 'd["role"]=="doctor"' "$DLOG"
DTOK=$(echo "$DLOG" | extract_token)
HLOG=$(curl -s -X POST "$B/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"aiims.delhi@docbook.local","password":"Hospital123!"}')
chk "Hospital login" 'd["role"]=="hospital"' "$HLOG"
HTOK=$(echo "$HLOG" | extract_token)
ALOG=$(curl -s -X POST "$B/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@docbook.local","password":"Admin123!"}')
chk "Admin login" 'd["role"]=="admin"' "$ALOG"
ATOK=$(echo "$ALOG" | extract_token)

echo
echo "===== PATIENT APPOINTMENT FLOW ====="
BK=$(curl -s -X POST "$B/api/v1/appointments/" -H "Authorization: Bearer $PTOK" -H "Content-Type: application/json" -d '{"doctor_id":1,"appointment_date":"2026-09-20","appointment_time":"10:00","notes":"audit"}')
chk "POST /appointments/" 'd["status"]=="pending" and d["doctor_id"]==1' "$BK"
APT=$(echo "$BK" | extract_id)
chk "GET /appointments/me" "isinstance(d,list) and any(a[\"id\"]==$APT for a in d)" "$(curl -s -H "Authorization: Bearer $PTOK" "$B/api/v1/appointments/me")"
chkcode "DELETE /appointments/{id}" "204" "$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $PTOK" "$B/api/v1/appointments/$APT")"

echo
echo "===== DOCTOR DASHBOARD ====="
chk "GET /appointments/doctor" 'isinstance(d,list)' "$(curl -s -H "Authorization: Bearer $DTOK" "$B/api/v1/appointments/doctor")"

echo
echo "===== HOSPITAL PORTAL ====="
chk "GET /hospital/dashboard" 'd["hospital"]["name"]=="AIIMS Delhi"' "$(curl -s -H "Authorization: Bearer $HTOK" "$B/api/v1/hospital/dashboard")"
chk "GET /hospital/doctors"   'isinstance(d,list) and len(d)>=2'    "$(curl -s -H "Authorization: Bearer $HTOK" "$B/api/v1/hospital/doctors")"
chk "GET /hospital/appointments" 'isinstance(d,list)'              "$(curl -s -H "Authorization: Bearer $HTOK" "$B/api/v1/hospital/appointments")"
chk "GET /hospital/patients"  'isinstance(d,list)'                   "$(curl -s -H "Authorization: Bearer $HTOK" "$B/api/v1/hospital/patients")"
NEWDOC=$(curl -s -X POST "$B/api/v1/hospital/doctors" -H "Authorization: Bearer $HTOK" -H "Content-Type: application/json" -d '{"name":"Dr. Audit Test","specialization":"Cardiologist","experience_years":10}')
chk "POST /hospital/doctors"  'd["name"]=="Dr. Audit Test"'         "$NEWDOC"

echo
echo "===== ADMIN DASHBOARD ====="
chk "GET /admin/stats"        '"total_users" in d'                   "$(curl -s -H "Authorization: Bearer $ATOK" "$B/api/v1/admin/stats")"
chk "GET /admin/users"        'isinstance(d,list) and len(d)>=20'   "$(curl -s -H "Authorization: Bearer $ATOK" "$B/api/v1/admin/users")"
chk "GET /admin/doctors"      'isinstance(d,list) and len(d)>=50'   "$(curl -s -H "Authorization: Bearer $ATOK" "$B/api/v1/admin/doctors")"
chk "GET /admin/hospitals"    'isinstance(d,list) and len(d)>=18'   "$(curl -s -H "Authorization: Bearer $ATOK" "$B/api/v1/admin/hospitals")"
chk "GET /admin/appointments" 'isinstance(d,list)'                   "$(curl -s -H "Authorization: Bearer $ATOK" "$B/api/v1/admin/appointments")"

echo
echo "===== ROLE GUARDS ====="
chkcode "patient->/admin/stats blocked"        "403" "$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PTOK" "$B/api/v1/admin/stats")"
chkcode "patient->/hospital/dashboard blocked" "403" "$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PTOK" "$B/api/v1/hospital/dashboard")"
chkcode "doctor->/hospital/dashboard blocked"  "403" "$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $DTOK" "$B/api/v1/hospital/dashboard")"
chkcode "doctor->/admin/stats blocked"         "403" "$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $DTOK" "$B/api/v1/admin/stats")"
chkcode "hospital->/admin/stats blocked"       "403" "$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $HTOK" "$B/api/v1/admin/stats")"
chkcode "no token->/admin/stats"                "422" "$(curl -s -o /dev/null -w "%{http_code}" "$B/api/v1/admin/stats")"

echo
echo "===== FACE ID ====="
chk "/face/status (doctor pre)" 'd["enrolled"]==False' "$(curl -s -H "Authorization: Bearer $DTOK" "$B/api/v1/auth/face/status")"
DESC=$(python -c "import json,random; random.seed(7); print(json.dumps([random.gauss(0,0.05) for _ in range(128)]))")
chk "/face/enroll" 'd["enrolled"]==True' "$(curl -s -X POST "$B/api/v1/auth/face/enroll" -H "Authorization: Bearer $DTOK" -H "Content-Type: application/json" -d "{\"descriptor\":$DESC}")"
chk "/face/login (matching)" 'd["role"]=="doctor"' "$(curl -s -X POST "$B/api/v1/auth/face/login" -H "Content-Type: application/json" -d "{\"email\":\"dr.krishna.sharma@docbook.local\",\"descriptor\":$DESC}")"
BAD=$(python -c "import json,random; random.seed(99); print(json.dumps([random.gauss(0,0.5) for _ in range(128)]))")
chkcode "/face/login (mismatch)" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/v1/auth/face/login" -H "Content-Type: application/json" -d "{\"email\":\"dr.krishna.sharma@docbook.local\",\"descriptor\":$BAD}")"
chkcode "/face/login (bad len)" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/v1/auth/face/login" -H "Content-Type: application/json" -d '{"email":"dr.krishna.sharma@docbook.local","descriptor":[1,2,3]}')"
chkcode "/face/enroll patient->403" "403" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/v1/auth/face/enroll" -H "Authorization: Bearer $PTOK" -H "Content-Type: application/json" -d "{\"descriptor\":$DESC}")"
chk "/face/enroll DELETE" 'd["enrolled"]==False' "$(curl -s -X DELETE -H "Authorization: Bearer $DTOK" "$B/api/v1/auth/face/enroll")"

echo
echo "===== LOCATION REVERSE ====="
chk "/location/reverse Delhi" 'd["region"]=="Delhi"' "$(curl -s -m 15 "$B/api/v1/location/reverse?latitude=28.6139&longitude=77.2090")"

echo
echo "===== FRONTEND STATIC + ROUTES ====="
chkcode "Index html"                "200" "$(curl -s -o /dev/null -w "%{http_code}" "$F/")"
chkcode "Face model: tinyDetector"  "200" "$(curl -s -o /dev/null -w "%{http_code}" "$F/face-models/tiny_face_detector_model-weights_manifest.json")"
chkcode "Face model: landmark68"    "200" "$(curl -s -o /dev/null -w "%{http_code}" "$F/face-models/face_landmark_68_model.bin")"
chkcode "Face model: faceRec"       "200" "$(curl -s -o /dev/null -w "%{http_code}" "$F/face-models/face_recognition_model.bin")"
# Angular SPA: every route serves index.html with 200
for route in "" "doctors" "login" "register" "doctor/login" "doctor/register" "hospital/login" "hospital/register" "my-appointments" "profile" "doctor-dashboard" "admin" "hospital/dashboard" "book-appointment" "definitely-not-real-route"; do
  chkcode "SPA route /$route" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$F/$route")"
done

echo
echo "============================="
echo "TOTAL: $OK passed, $FAIL failed"
echo "============================="
exit $FAIL
