# Landing page + Analytics — Οδηγίες

## Τι αλλάζει

1. **index.html** (ρίζα repo) — αντικατάσταση
   - Νέο tab "Analytics" στο admin panel (γραφήματα κρατήσεων/ατόμων/ωρών/ημερών/πηγής/τοποθεσίας/γεγονότων + επαναλαμβανόμενοι πελάτες)
   - Redirect: όποιος μπει στο tablereserve.gr χωρίς ?shop=... πάει αυτόματα στο /partners/

2. **partners/index.html** — νέο αρχείο
   Η landing page (marketing σελίδα) με τη φωτογραφία στο hero.

3. **partners/assets/hero-table.jpg** — νέο αρχείο
   Η φωτογραφία που χρησιμοποιεί η landing page.

## Πώς να τα βάλεις στο repo

Μέσα στο ήδη υπάρχον `Desktop/restaurant` (το repo σου):

1. Αντικατέστησε το `index.html` στη ρίζα με το νέο (θα σου ζητήσει Replace — πάτα ναι)
2. Αντικατέστησε το `partners/index.html` με το νέο (ήδη υπήρχε — Replace)
3. Αντέγραψε το `partners/assets/hero-table.jpg` μέσα στο `partners/assets/` (νέος φάκελος αν δεν υπάρχει ήδη)

## Commit & push

Στο Git Bash, μέσα στο `~/Desktop/restaurant`:

    git add index.html partners/
    git commit -m "Add partners landing page, analytics tab, and root redirect"
    git push

Το Netlify θα κάνει αυτόματα deploy σε ~1-2 λεπτά.

## Δοκιμή

- **Landing page**: πήγαινε στο https://tablereserve.gr (χωρίς τίποτα μετά) — θα πρέπει να σε πάει αυτόματα στο /partners/ και να δεις τη νέα σελίδα με τη φωτογραφία
- **Booking widget**: το https://tablereserve.gr/?shop=pandrosougarden συνεχίζει να δουλεύει κανονικά, χωρίς καμία αλλαγή
- **Analytics**: κάνε login σε Admin για ένα μαγαζί, πήγαινε στο νέο tab "📊 Analytics", δοκίμασε να αλλάξεις το εύρος ημερομηνιών και δες αν ενημερώνονται τα γραφήματα
