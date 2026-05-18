# TableReserve — Google Booking API Backend

Backend server για σύνδεση της εφαρμογής **TableReserve** με το **Reserve with Google** πρόγραμμα.

---

## 📁 Δομή Αρχείων

```
tablereserve-api/
├── server.js                  # Κεντρικός Express server
├── firebase.js                # Firebase Admin SDK init
├── middleware/
│   └── auth.js                # Google JWT verification
├── routes/
│   ├── availability.js        # GET /v3/availability
│   ├── bookings.js            # POST/PATCH/GET /v3/bookings
│   ├── feed.js                # GET /feeds/merchants.xml
│   └── notifications.js       # POST /v3/notifications
├── package.json
├── Dockerfile                 # Για Google Cloud Run
├── .env.example               # Μεταβλητές περιβάλλοντος
└── .gitignore
```

---

## ⚙️ Εγκατάσταση

```bash
npm install
cp .env.example .env
# Συμπλήρωσε τιμές στο .env
npm start
```

---

## 🚀 Deploy σε Google Cloud Run

```bash
# 1. Σύνδεση με Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Build & Deploy
gcloud run deploy tablereserve-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars="FIREBASE_PROJECT_ID=xxx,FIREBASE_CLIENT_EMAIL=xxx,..."

# 3. Πάρε το URL
gcloud run services describe tablereserve-api --region europe-west1 --format='value(status.url)'
```

---

## 🔥 Firebase — Δομή Δεδομένων

Κάθε μαγαζί στο Firebase χρειάζεται:

```json
{
  "shop_details": {
    "SHOP_ID": {
      "displayName": "Το Μαγαζί μου",
      "googlePlaceId": "ChIJxxxxxxxxxxxxxxx",
      "openHour": 8,
      "closeHour": 23,
      "totalCapacity": 20,
      "maxGuests": 10
    }
  }
}
```

### Πώς να βρεις το Google Place ID:
1. Πήγαινε στο Google Maps
2. Ψάξε το μαγαζί
3. Κλικ στο "Share"
4. Αντέγραψε το ID από το link (μετά το `place_id=`)

---

## 📡 API Endpoints

| Method | Path | Περιγραφή |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/feeds/merchants.xml` | Merchant feed για Google |
| GET | `/v3/availability` | Διαθέσιμα slots |
| POST | `/v3/bookings` | Νέα κράτηση από Google |
| PATCH | `/v3/bookings/:id` | Ακύρωση/τροποποίηση |
| GET | `/v3/bookings/:id` | Κατάσταση κράτησης |
| POST | `/v3/notifications` | Events από Google |

---

## 📝 Υποβολή στο Reserve with Google

1. Deploy το API
2. Πάρε το URL (π.χ. `https://tablereserve-api-xxx.run.app`)
3. Βεβαιώσου ότι το `GET /feeds/merchants.xml` επιστρέφει σωστό XML
4. Υπέβαλε αίτηση: https://maps.google.com/business/reserve-with-google/
5. Στείλε το feed URL: `https://YOUR_URL/feeds/merchants.xml`
