# Ορατό πλάνο + emails αίτησης — Οδηγίες

## Τι αλλάζει
1. partners-index.html → μπαίνει ως partners/index.html (αντικατάσταση)
   - Δείχνει καθαρά ποιο πλάνο επιλέχθηκε, πάνω από τα πεδία της φόρμας
   - Η φόρμα στέλνει πλέον στο δικό μας function (όχι Formspree)

2. netlify/functions/partner-inquiry.js → ΝΕΟ αρχείο
   - Στέλνει email ειδοποίησης σε: akronservices@mail.com (μπορείς να το αλλάξεις
     βάζοντας env var PARTNER_NOTIFY_EMAIL στο Netlify αν θες άλλο email)
   - Στέλνει email επιβεβαίωσης στον υποψήφιο πελάτη

## Βήματα (μέσα στο Desktop/restaurant)
1. partners-index.html → rename σε index.html → βάλε το μέσα στο partners/ (Replace)
2. netlify/functions/partner-inquiry.js → βάλε το μέσα στο netlify/functions/ (νέο αρχείο)

## Commit & push
    git add partners/index.html netlify/functions/partner-inquiry.js
    git commit -m "Show selected plan in form, send inquiry emails via Resend"
    git push

## Δοκίμασε
Πήγαινε στο tablereserve.gr, διάλεξε ένα πλάνο, γέμισε τη φόρμα με ΔΙΚΟ ΣΟΥ email
για δοκιμή, και στείλε. Θα πρέπει να λάβεις 2 emails: ένα στο akronservices@mail.com
(ειδοποίηση) και ένα στο email που έβαλες στη φόρμα (επιβεβαίωση).
