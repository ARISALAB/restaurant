# Δυναμικό site μαγαζιού — Οδηγίες

## Τι προστίθεται
- site/index.html → ΝΕΟΣ φάκελος + αρχείο. Διαβάζει ?shop=... από το URL,
  τραβάει δεδομένα από shop_profile/{shop} στο Firebase, και δείχνει
  αυτόματα το site του μαγαζιού.

## Βήματα (μέσα στο Desktop/restaurant)
1. Δημιούργησε φάκελο "site" μέσα στο Desktop/restaurant (αν δεν υπάρχει)
2. Βάλε το index.html μέσα σε αυτόν τον φάκελο site/

## Commit & push
    git add site/
    git commit -m "Add dynamic per-shop website template"
    git push

## Δοκιμή
Μετά το deploy, πήγαινε στο:
https://tablereserve.gr/site/?shop=plaki

Θα δεις το site του Πλάκι με ό,τι στοιχεία έχεις ήδη συμπληρώσει στο
"Προφίλ Μαγαζιού" (tagline, περιγραφή, ώρες, διεύθυνση, τηλέφωνο, cover photo).
Ό,τι λείπει θα δείχνει λογικό εναλλακτικό κείμενο αντί να σπάει.

Αν θες να δεις καλύτερο αποτέλεσμα, συμπλήρωσε πρώτα περισσότερα πεδία στο
Admin panel → Προφίλ Μαγαζιού για το Πλάκι, πριν δοκιμάσεις.
