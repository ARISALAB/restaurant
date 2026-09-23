# URL fix — tablereserve.gr μένει στη γραμμή διεύθυνσης

## Τι αλλάζει
- netlify.toml — προστέθηκε ρύθμιση edge function
- netlify/edge-functions/root-rewrite.js — ΝΕΟ αρχείο, κάνει το "μαγικό" rewrite
- index.html — αφαιρέθηκε το παλιό JavaScript redirect (δεν χρειάζεται πια)

## Βήματα (μέσα στο Desktop/restaurant)

1. Αντικατέστησε το netlify.toml (στη ρίζα) με το νέο
2. Αντικατέστησε το index.html (στη ρίζα) με το νέο
3. Δημιούργησε τον φάκελο netlify/edge-functions/ (αν δεν υπάρχει) και βάλε μέσα το root-rewrite.js

## Commit & push

    git add netlify.toml netlify/edge-functions/ index.html
    git commit -m "Serve partners page at bare domain via edge function instead of JS redirect"
    git push

## Δοκιμή
Μετά το deploy, πήγαινε σε tablereserve.gr — θα δεις το περιεχόμενο του partners page,
αλλά η γραμμή διεύθυνσης θα παραμείνει "tablereserve.gr" (χωρίς /partners/).
Το tablereserve.gr/?shop=pandrosougarden συνεχίζει να δουλεύει κανονικά όπως πάντα.
