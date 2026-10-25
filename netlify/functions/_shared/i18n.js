// Κείμενα προς τον πελάτη (email, υπενθυμίσεις, Wallet, ημερολόγιο) σε όλες τις γλώσσες της σελίδας κράτησης.
// Η γλώσσα έρχεται από την κράτηση (b.lang) ή από το link (?lang=). Κράτηση χωρίς γλώσσα = ελληνικά.
const LANGS = ['el', 'en', 'de', 'fr', 'it', 'es', 'tr', 'pt'];
const LOCALE = { el: 'el-GR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', tr: 'tr-TR', pt: 'pt-PT' };
const normLang = l => (LANGS.includes(l) ? l : 'el');

// "2026-10-24" -> "Σάββατο 24 Οκτωβρίου" / "Saturday 24 October" / ...
function fmtDate(d, lang) {
  const [y, m, dd] = String(d).split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[normLang(lang)], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
}

const M = {
  el: {
    // επιβεβαίωση
    c_subject: 'Επιβεβαίωση Κράτησης', c_header: 'Επιβεβαίωση Κράτησης', dear: n => `Αγαπητέ/ή <strong>${n}</strong>,`,
    c_confirmed: 'Η κράτησή σας επιβεβαιώθηκε με επιτυχία!', persons: 'άτομα',
    c_location: '📍 Χώρος', c_occasion: '🎉 Γεγονός', c_comments: '💬 Αιτήματα', no_pref: 'Δεν έχω προτίμηση',
    c_cal: '📅 Προσθέστε το στο ημερολόγιο για να σας θυμίσει το κινητό σας 2 ώρες πριν', c_cal_google: 'Google Calendar', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Θέλετε να ακυρώσετε την κράτησή σας;', c_cancel_btn: '❌ Ακύρωση Κράτησης', c_cancel_note: 'Η ακύρωση επιτρέπεται έως 2 ώρες πριν την κράτηση',
    wallet_alt: 'Προσθήκη στο Πορτοφόλι Google',
    // υπενθύμιση
    r_subject: (s, t) => `⏰ Υπενθύμιση: ${s} στις ${t}`, r_head: 'Σας περιμένουμε!', r_line: 'Σας υπενθυμίζουμε την κράτησή σας σε λίγο.',
    r_addr: '📍 Διεύθυνση', r_map: 'Οδηγίες', r_phone: '📞 Τηλέφωνο',
    r_cant: 'Αν τελικά δεν μπορείτε να έρθετε, ενημερώστε το κατάστημα ώστε να δώσει το τραπέζι σε κάποιον άλλο.',
    p_title: (s, t) => `⏰ ${s} στις ${t}`, p_body: g => `Σας περιμένουμε, τραπέζι για ${g}. Πατήστε για οδηγίες.`,
    // λίστα αναμονής
    w_subject: (s, t) => `🎉 Ελευθερώθηκε τραπέζι: ${s}, ${t}`, w_head: 'Ελευθερώθηκε τραπέζι!',
    w_line: 'Ελευθερώθηκε τραπέζι στην ώρα που περιμένατε. Θα το πάρει όποιος κλείσει πρώτος, οπότε μην αργήσετε.',
    w_btn: 'Κλείστε το τραπέζι', w_note: 'Αν δεν το χρειάζεστε πια, απλώς αγνοήστε αυτό το email.',
    // Wallet
    g_date: 'Ημερομηνία', g_guests: 'Άτομα', g_name: 'Όνομα', g_address: 'Διεύθυνση', g_directions: 'Οδηγίες', g_call: 'Τηλέφωνο ',
    g_cancel: 'Ακύρωση κράτησης', g_table_for: g => `Τραπέζι για ${g}`,
    // ημερολόγιο
    k_title: (s, g) => `Κράτηση: ${s} (${g} άτομα)`, k_details: (g, t) => `Τραπέζι για ${g} στις ${t}. Κράτηση μέσω TableReserve.`, k_cancel: 'Ακύρωση: ',
    e_not_found: 'Η κράτηση δεν βρέθηκε', e_cancelled: 'Η κράτηση έχει ακυρωθεί',
    // προς το εστιατόριο
    s_new: "Νέα κράτηση", s_cancel: "Ακύρωση Κράτησης", s_by_guest: "από πελάτη", s_name: "Όνομα", s_phone: "Τηλέφωνο", s_comments: "Σχόλια", s_occasion: "Περίσταση", s_btn: "Δείτε τις κρατήσεις →", s_wl_subject: "Λίστα αναμονής", s_wl_new: "Νέο αίτημα στη λίστα αναμονής", s_wl_upd: "Ενημέρωση αιτήματος στη λίστα αναμονής", s_wl_any: "οποιαδήποτε ώρα", s_date: "Ημερομηνία", s_time: "Ώρα", s_guests: "Άτομα", s_wl_note: "Η ώρα είναι πλήρης. Αν ακυρωθεί κάποια κράτηση, ο πελάτης θα πάρει αυτόματα email για να κλείσει το τραπέζι. Μπορείτε επίσης να τον καλέσετε εσείς, αν βρείτε θέση.",
    loc: { in: 'Εσωτερικός χώρος', out: 'Εξωτερικός χώρος', none: 'Χωρίς προτίμηση' },
  },
  en: {
    c_subject: 'Booking Confirmation', c_header: 'Booking Confirmation', dear: n => `Dear <strong>${n}</strong>,`,
    c_confirmed: 'Your reservation has been confirmed!', persons: 'guests',
    c_location: '📍 Seating', c_occasion: '🎉 Occasion', c_comments: '💬 Requests', no_pref: 'No preference',
    c_cal: '📅 Add it to your calendar so your phone reminds you 2 hours before', c_cal_google: 'Google Calendar', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Would you like to cancel your reservation?', c_cancel_btn: '❌ Cancel Reservation', c_cancel_note: 'Cancellation is allowed up to 2 hours before the reservation',
    wallet_alt: 'Add to Google Wallet',
    r_subject: (s, t) => `⏰ Reminder: ${s} at ${t}`, r_head: 'See you soon!', r_line: 'This is a friendly reminder of your upcoming reservation.',
    r_addr: '📍 Address', r_map: 'Directions', r_phone: '📞 Phone',
    r_cant: 'If you can no longer make it, please let the restaurant know so they can give the table to someone else.',
    p_title: (s, t) => `⏰ ${s} at ${t}`, p_body: g => `Your table for ${g} is waiting for you. Tap for directions.`,
    w_subject: (s, t) => `🎉 A table opened up: ${s}, ${t}`, w_head: 'A table just opened up!',
    w_line: `A table became available at the time you were waiting for. It goes to whoever books first, so don't wait too long.`,
    w_btn: 'Book this table', w_note: 'If you no longer need it, simply ignore this email.',
    g_date: 'Date', g_guests: 'Guests', g_name: 'Name', g_address: 'Address', g_directions: 'Directions', g_call: 'Call ',
    g_cancel: 'Cancel reservation', g_table_for: g => `Table for ${g}`,
    k_title: (s, g) => `Reservation: ${s} (${g} guests)`, k_details: (g, t) => `Table for ${g} at ${t}. Booked via TableReserve.`, k_cancel: 'Cancel: ',
    e_not_found: 'Reservation not found', e_cancelled: 'This reservation was cancelled',
    // προς το εστιατόριο
    s_new: "New booking", s_cancel: "Booking cancelled", s_by_guest: "by the guest", s_name: "Name", s_phone: "Phone", s_comments: "Comments", s_occasion: "Occasion", s_btn: "View bookings →", s_wl_subject: "Waitlist", s_wl_new: "New waitlist request", s_wl_upd: "Waitlist request updated", s_wl_any: "any time", s_date: "Date", s_time: "Time", s_guests: "Guests", s_wl_note: "This time is full. If a booking is cancelled, the guest will automatically get an email to book the table. You can also call them yourself if you find a spot.",
    loc: { in: 'Indoor', out: 'Outdoor', none: 'No preference' },
  },
  de: {
    c_subject: 'Reservierungsbestätigung', c_header: 'Reservierungsbestätigung', dear: n => `Hallo <strong>${n}</strong>,`,
    c_confirmed: 'Ihre Reservierung ist bestätigt!', persons: 'Personen',
    c_location: '📍 Sitzplatz', c_occasion: '🎉 Anlass', c_comments: '💬 Wünsche', no_pref: 'Keine Präferenz',
    c_cal: '📅 Tragen Sie den Termin in Ihren Kalender ein, damit Ihr Handy Sie 2 Stunden vorher erinnert', c_cal_google: 'Google Kalender', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Möchten Sie Ihre Reservierung stornieren?', c_cancel_btn: '❌ Reservierung stornieren', c_cancel_note: 'Eine Stornierung ist bis 2 Stunden vor der Reservierung möglich',
    wallet_alt: 'Zu Google Wallet hinzufügen',
    r_subject: (s, t) => `⏰ Erinnerung: ${s} um ${t}`, r_head: 'Bis gleich!', r_line: 'Wir möchten Sie kurz an Ihre bevorstehende Reservierung erinnern.',
    r_addr: '📍 Adresse', r_map: 'Route', r_phone: '📞 Telefon',
    r_cant: 'Falls Sie doch nicht kommen können, geben Sie bitte dem Restaurant Bescheid, damit der Tisch an andere Gäste gehen kann.',
    p_title: (s, t) => `⏰ ${s} um ${t}`, p_body: g => `Ihr Tisch für ${g} wartet auf Sie. Tippen Sie für die Route.`,
    w_subject: (s, t) => `🎉 Ein Tisch ist frei geworden: ${s}, ${t}`, w_head: 'Ein Tisch ist frei geworden!',
    w_line: 'Zu Ihrer gewünschten Uhrzeit ist ein Tisch frei geworden. Wer zuerst bucht, bekommt ihn – warten Sie also nicht zu lange.',
    w_btn: 'Diesen Tisch reservieren', w_note: 'Wenn Sie ihn nicht mehr brauchen, ignorieren Sie diese E-Mail einfach.',
    g_date: 'Datum', g_guests: 'Personen', g_name: 'Name', g_address: 'Adresse', g_directions: 'Route', g_call: 'Anrufen: ',
    g_cancel: 'Reservierung stornieren', g_table_for: g => `Tisch für ${g}`,
    k_title: (s, g) => `Reservierung: ${s} (${g} Personen)`, k_details: (g, t) => `Tisch für ${g} um ${t}. Reserviert über TableReserve.`, k_cancel: 'Stornieren: ',
    e_not_found: 'Reservierung nicht gefunden', e_cancelled: 'Diese Reservierung wurde storniert',
    // προς το εστιατόριο
    s_new: "Neue Reservierung", s_cancel: "Reservierung storniert", s_by_guest: "vom Gast", s_name: "Name", s_phone: "Telefon", s_comments: "Kommentare", s_occasion: "Anlass", s_btn: "Reservierungen ansehen →", s_wl_subject: "Warteliste", s_wl_new: "Neue Anfrage auf der Warteliste", s_wl_upd: "Anfrage auf der Warteliste aktualisiert", s_wl_any: "beliebige Uhrzeit", s_date: "Datum", s_time: "Uhrzeit", s_guests: "Personen", s_wl_note: "Diese Uhrzeit ist ausgebucht. Wird eine Reservierung storniert, erhält der Gast automatisch eine E-Mail, um den Tisch zu buchen. Sie können ihn auch selbst anrufen, wenn Sie einen Platz finden.",
    loc: { in: 'Innen', out: 'Draußen', none: 'Keine Präferenz' },
  },
  fr: {
    c_subject: 'Confirmation de réservation', c_header: 'Confirmation de réservation', dear: n => `Bonjour <strong>${n}</strong>,`,
    c_confirmed: 'Votre réservation est confirmée !', persons: 'personnes',
    c_location: '📍 Placement', c_occasion: '🎉 Occasion', c_comments: '💬 Demandes', no_pref: 'Pas de préférence',
    c_cal: '📅 Ajoutez-la à votre agenda pour que votre téléphone vous la rappelle 2 heures avant', c_cal_google: 'Google Agenda', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Souhaitez-vous annuler votre réservation ?', c_cancel_btn: '❌ Annuler la réservation', c_cancel_note: "L'annulation est possible jusqu'à 2 heures avant la réservation",
    wallet_alt: 'Ajouter à Google Wallet',
    r_subject: (s, t) => `⏰ Rappel : ${s} à ${t}`, r_head: 'À tout à l’heure !', r_line: 'Petit rappel de votre réservation à venir.',
    r_addr: '📍 Adresse', r_map: 'Itinéraire', r_phone: '📞 Téléphone',
    r_cant: "Si vous ne pouvez finalement pas venir, merci de prévenir le restaurant afin qu'il puisse donner la table à quelqu'un d'autre.",
    p_title: (s, t) => `⏰ ${s} à ${t}`, p_body: g => `Votre table pour ${g} vous attend. Touchez pour l'itinéraire.`,
    w_subject: (s, t) => `🎉 Une table s'est libérée : ${s}, ${t}`, w_head: "Une table vient de se libérer !",
    w_line: "Une table s'est libérée à l'heure que vous attendiez. Elle revient au premier qui réserve, alors ne tardez pas.",
    w_btn: 'Réserver cette table', w_note: "Si vous n'en avez plus besoin, ignorez simplement cet e-mail.",
    g_date: 'Date', g_guests: 'Personnes', g_name: 'Nom', g_address: 'Adresse', g_directions: 'Itinéraire', g_call: 'Appeler ',
    g_cancel: 'Annuler la réservation', g_table_for: g => `Table pour ${g}`,
    k_title: (s, g) => `Réservation : ${s} (${g} personnes)`, k_details: (g, t) => `Table pour ${g} à ${t}. Réservé via TableReserve.`, k_cancel: 'Annuler : ',
    e_not_found: 'Réservation introuvable', e_cancelled: 'Cette réservation a été annulée',
    // προς το εστιατόριο
    s_new: "Nouvelle réservation", s_cancel: "Réservation annulée", s_by_guest: "par le client", s_name: "Nom", s_phone: "Téléphone", s_comments: "Commentaires", s_occasion: "Occasion", s_btn: "Voir les réservations →", s_wl_subject: "Liste d'attente", s_wl_new: "Nouvelle demande sur la liste d'attente", s_wl_upd: "Demande mise à jour sur la liste d'attente", s_wl_any: "n'importe quelle heure", s_date: "Date", s_time: "Heure", s_guests: "Personnes", s_wl_note: "Cette heure est complète. Si une réservation est annulée, le client recevra automatiquement un e-mail pour réserver la table. Vous pouvez aussi l'appeler vous-même si vous trouvez une place.",
    loc: { in: 'En salle', out: 'En terrasse', none: 'Pas de préférence' },
  },
  it: {
    c_subject: 'Conferma della prenotazione', c_header: 'Conferma della prenotazione', dear: n => `Gentile <strong>${n}</strong>,`,
    c_confirmed: 'La tua prenotazione è confermata!', persons: 'persone',
    c_location: '📍 Tavolo', c_occasion: '🎉 Occasione', c_comments: '💬 Richieste', no_pref: 'Nessuna preferenza',
    c_cal: '📅 Aggiungila al calendario e il telefono te la ricorderà 2 ore prima', c_cal_google: 'Google Calendar', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Vuoi annullare la prenotazione?', c_cancel_btn: '❌ Annulla la prenotazione', c_cancel_note: "L'annullamento è possibile fino a 2 ore prima della prenotazione",
    wallet_alt: 'Aggiungi a Google Wallet',
    r_subject: (s, t) => `⏰ Promemoria: ${s} alle ${t}`, r_head: 'Ti aspettiamo!', r_line: 'Ti ricordiamo la tua prenotazione tra poco.',
    r_addr: '📍 Indirizzo', r_map: 'Indicazioni', r_phone: '📞 Telefono',
    r_cant: 'Se alla fine non riesci a venire, avvisa il ristorante così potrà dare il tavolo a qualcun altro.',
    p_title: (s, t) => `⏰ ${s} alle ${t}`, p_body: g => `Il tuo tavolo per ${g} ti aspetta. Tocca per le indicazioni.`,
    w_subject: (s, t) => `🎉 Si è liberato un tavolo: ${s}, ${t}`, w_head: 'Si è appena liberato un tavolo!',
    w_line: "Si è liberato un tavolo all'ora che aspettavi. Va a chi prenota per primo, quindi non aspettare troppo.",
    w_btn: 'Prenota questo tavolo', w_note: "Se non ti serve più, ignora pure quest'email.",
    g_date: 'Data', g_guests: 'Persone', g_name: 'Nome', g_address: 'Indirizzo', g_directions: 'Indicazioni', g_call: 'Chiama ',
    g_cancel: 'Annulla la prenotazione', g_table_for: g => `Tavolo per ${g}`,
    k_title: (s, g) => `Prenotazione: ${s} (${g} persone)`, k_details: (g, t) => `Tavolo per ${g} alle ${t}. Prenotato tramite TableReserve.`, k_cancel: 'Annulla: ',
    e_not_found: 'Prenotazione non trovata', e_cancelled: 'Questa prenotazione è stata annullata',
    // προς το εστιατόριο
    s_new: "Nuova prenotazione", s_cancel: "Prenotazione annullata", s_by_guest: "dal cliente", s_name: "Nome", s_phone: "Telefono", s_comments: "Commenti", s_occasion: "Occasione", s_btn: "Vedi le prenotazioni →", s_wl_subject: "Lista d'attesa", s_wl_new: "Nuova richiesta in lista d'attesa", s_wl_upd: "Richiesta in lista d'attesa aggiornata", s_wl_any: "qualsiasi orario", s_date: "Data", s_time: "Orario", s_guests: "Persone", s_wl_note: "Quest'orario è completo. Se una prenotazione viene annullata, il cliente riceverà automaticamente un'email per prenotare il tavolo. Puoi anche chiamarlo tu, se trovi un posto.",
    loc: { in: "All'interno", out: "All'aperto", none: 'Nessuna preferenza' },
  },
  es: {
    c_subject: 'Confirmación de reserva', c_header: 'Confirmación de reserva', dear: n => `Hola <strong>${n}</strong>:`,
    c_confirmed: '¡Tu reserva está confirmada!', persons: 'personas',
    c_location: '📍 Mesa', c_occasion: '🎉 Ocasión', c_comments: '💬 Peticiones', no_pref: 'Sin preferencia',
    c_cal: '📅 Añádela al calendario y tu móvil te la recordará 2 horas antes', c_cal_google: 'Google Calendar', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: '¿Quieres cancelar tu reserva?', c_cancel_btn: '❌ Cancelar reserva', c_cancel_note: 'Puedes cancelar hasta 2 horas antes de la reserva',
    wallet_alt: 'Añadir a Google Wallet',
    r_subject: (s, t) => `⏰ Recordatorio: ${s} a las ${t}`, r_head: '¡Te esperamos!', r_line: 'Te recordamos tu reserva de dentro de un rato.',
    r_addr: '📍 Dirección', r_map: 'Cómo llegar', r_phone: '📞 Teléfono',
    r_cant: 'Si al final no puedes venir, avisa al restaurante para que pueda dar la mesa a otra persona.',
    p_title: (s, t) => `⏰ ${s} a las ${t}`, p_body: g => `Tu mesa para ${g} te espera. Toca para ver cómo llegar.`,
    w_subject: (s, t) => `🎉 Ha quedado una mesa libre: ${s}, ${t}`, w_head: '¡Acaba de quedar una mesa libre!',
    w_line: 'Ha quedado libre una mesa a la hora que esperabas. Será para quien reserve primero, así que no tardes.',
    w_btn: 'Reservar esta mesa', w_note: 'Si ya no la necesitas, simplemente ignora este email.',
    g_date: 'Fecha', g_guests: 'Personas', g_name: 'Nombre', g_address: 'Dirección', g_directions: 'Cómo llegar', g_call: 'Llamar ',
    g_cancel: 'Cancelar reserva', g_table_for: g => `Mesa para ${g}`,
    k_title: (s, g) => `Reserva: ${s} (${g} personas)`, k_details: (g, t) => `Mesa para ${g} a las ${t}. Reservado con TableReserve.`, k_cancel: 'Cancelar: ',
    e_not_found: 'Reserva no encontrada', e_cancelled: 'Esta reserva ha sido cancelada',
    // προς το εστιατόριο
    s_new: "Nueva reserva", s_cancel: "Reserva cancelada", s_by_guest: "por el cliente", s_name: "Nombre", s_phone: "Teléfono", s_comments: "Comentarios", s_occasion: "Ocasión", s_btn: "Ver las reservas →", s_wl_subject: "Lista de espera", s_wl_new: "Nueva solicitud en la lista de espera", s_wl_upd: "Solicitud actualizada en la lista de espera", s_wl_any: "cualquier hora", s_date: "Fecha", s_time: "Hora", s_guests: "Personas", s_wl_note: "Esta hora está completa. Si se cancela una reserva, el cliente recibirá automáticamente un email para reservar la mesa. También puedes llamarle tú si encuentras sitio.",
    loc: { in: 'Interior', out: 'Terraza', none: 'Sin preferencia' },
  },
  tr: {
    c_subject: 'Rezervasyon onayı', c_header: 'Rezervasyon onayı', dear: n => `Sayın <strong>${n}</strong>,`,
    c_confirmed: 'Rezervasyonunuz onaylandı!', persons: 'kişi',
    c_location: '📍 Oturma yeri', c_occasion: '🎉 Özel gün', c_comments: '💬 İstekler', no_pref: 'Fark etmez',
    c_cal: '📅 Takviminize ekleyin, telefonunuz size 2 saat önce hatırlatsın', c_cal_google: 'Google Takvim', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Rezervasyonunuzu iptal etmek mi istiyorsunuz?', c_cancel_btn: '❌ Rezervasyonu iptal et', c_cancel_note: 'Rezervasyondan 2 saat öncesine kadar iptal edebilirsiniz',
    wallet_alt: "Google Cüzdan'a ekle",
    r_subject: (s, t) => `⏰ Hatırlatma: ${s}, saat ${t}`, r_head: 'Sizi bekliyoruz!', r_line: 'Yaklaşan rezervasyonunuzu hatırlatmak istedik.',
    r_addr: '📍 Adres', r_map: 'Yol tarifi', r_phone: '📞 Telefon',
    r_cant: 'Gelemeyecekseniz, masayı başkasına verebilmesi için lütfen restorana haber verin.',
    p_title: (s, t) => `⏰ ${s}, saat ${t}`, p_body: g => `${g} kişilik masanız sizi bekliyor. Yol tarifi için dokunun.`,
    w_subject: (s, t) => `🎉 Bir masa boşaldı: ${s}, ${t}`, w_head: 'Bir masa boşaldı!',
    w_line: 'Beklediğiniz saatte bir masa boşaldı. Masa ilk rezervasyon yapana verilir, o yüzden fazla beklemeyin.',
    w_btn: 'Bu masayı ayırt', w_note: 'Artık ihtiyacınız yoksa bu e-postayı dikkate almayın.',
    g_date: 'Tarih', g_guests: 'Kişi', g_name: 'Ad', g_address: 'Adres', g_directions: 'Yol tarifi', g_call: 'Ara ',
    g_cancel: 'Rezervasyonu iptal et', g_table_for: g => `${g} kişilik masa`,
    k_title: (s, g) => `Rezervasyon: ${s} (${g} kişi)`, k_details: (g, t) => `${g} kişilik masa, saat ${t}. TableReserve ile ayrıldı.`, k_cancel: 'İptal: ',
    e_not_found: 'Rezervasyon bulunamadı', e_cancelled: 'Bu rezervasyon iptal edildi',
    // προς το εστιατόριο
    s_new: "Yeni rezervasyon", s_cancel: "Rezervasyon iptal edildi", s_by_guest: "misafir tarafından", s_name: "Ad", s_phone: "Telefon", s_comments: "Yorumlar", s_occasion: "Özel gün", s_btn: "Rezervasyonları gör →", s_wl_subject: "Bekleme listesi", s_wl_new: "Bekleme listesine yeni talep", s_wl_upd: "Bekleme listesindeki talep güncellendi", s_wl_any: "herhangi bir saat", s_date: "Tarih", s_time: "Saat", s_guests: "Kişi", s_wl_note: "Bu saat dolu. Bir rezervasyon iptal edilirse misafire masayı ayırtması için otomatik e-posta gider. Yer bulursanız onu kendiniz de arayabilirsiniz.",
    loc: { in: 'İç mekân', out: 'Dış mekân', none: 'Fark etmez' },
  },
  pt: {
    c_subject: 'Confirmação de reserva', c_header: 'Confirmação de reserva', dear: n => `Olá <strong>${n}</strong>,`,
    c_confirmed: 'A sua reserva está confirmada!', persons: 'pessoas',
    c_location: '📍 Mesa', c_occasion: '🎉 Ocasião', c_comments: '💬 Pedidos', no_pref: 'Sem preferência',
    c_cal: '📅 Adicione-a ao calendário e o seu telemóvel lembra-o 2 horas antes', c_cal_google: 'Google Calendar', c_cal_other: 'iPhone / Outlook',
    c_cancel_q: 'Quer cancelar a sua reserva?', c_cancel_btn: '❌ Cancelar reserva', c_cancel_note: 'Pode cancelar até 2 horas antes da reserva',
    wallet_alt: 'Adicionar ao Google Wallet',
    r_subject: (s, t) => `⏰ Lembrete: ${s} às ${t}`, r_head: 'Estamos à sua espera!', r_line: 'Lembramos a sua reserva daqui a pouco.',
    r_addr: '📍 Morada', r_map: 'Direções', r_phone: '📞 Telefone',
    r_cant: 'Se afinal não puder vir, avise o restaurante para que possa dar a mesa a outra pessoa.',
    p_title: (s, t) => `⏰ ${s} às ${t}`, p_body: g => `A sua mesa para ${g} está à sua espera. Toque para ver as direções.`,
    w_subject: (s, t) => `🎉 Vagou uma mesa: ${s}, ${t}`, w_head: 'Acabou de vagar uma mesa!',
    w_line: 'Vagou uma mesa à hora que esperava. Fica para quem reservar primeiro, por isso não demore.',
    w_btn: 'Reservar esta mesa', w_note: 'Se já não precisar, ignore simplesmente este email.',
    g_date: 'Data', g_guests: 'Pessoas', g_name: 'Nome', g_address: 'Morada', g_directions: 'Direções', g_call: 'Ligar ',
    g_cancel: 'Cancelar reserva', g_table_for: g => `Mesa para ${g}`,
    k_title: (s, g) => `Reserva: ${s} (${g} pessoas)`, k_details: (g, t) => `Mesa para ${g} às ${t}. Reservado com TableReserve.`, k_cancel: 'Cancelar: ',
    e_not_found: 'Reserva não encontrada', e_cancelled: 'Esta reserva foi cancelada',
    // προς το εστιατόριο
    s_new: "Nova reserva", s_cancel: "Reserva cancelada", s_by_guest: "pelo cliente", s_name: "Nome", s_phone: "Telefone", s_comments: "Comentários", s_occasion: "Ocasião", s_btn: "Ver as reservas →", s_wl_subject: "Lista de espera", s_wl_new: "Novo pedido na lista de espera", s_wl_upd: "Pedido atualizado na lista de espera", s_wl_any: "qualquer hora", s_date: "Data", s_time: "Hora", s_guests: "Pessoas", s_wl_note: "Esta hora está esgotada. Se uma reserva for cancelada, o cliente recebe automaticamente um email para reservar a mesa. Também pode ligar-lhe se arranjar lugar.",
    loc: { in: 'Interior', out: 'Esplanada', none: 'Sem preferência' },
  },
};

const msg = lang => M[normLang(lang)];

// Η προτίμηση χώρου αποθηκεύεται στα ελληνικά (τιμή της φόρμας). Εδώ μόνο για εμφάνιση.
const LOC_KEY = { 'Εσωτερικός': 'in', 'Εξωτερικός': 'out', 'Δεν έχω προτίμηση': 'none' };
function locationLabel(value, lang) {
  if (!value) return '';
  const k = LOC_KEY[value];
  return k ? msg(lang).loc[k] : value;
}

// Γλώσσα για τα email προς το εστιατόριο: ό,τι διάλεξε στο admin, αλλιώς η γλώσσα της εγγραφής
async function shopLang(db, shop, details) {
  const a = await db.ref(`shop_profile/${shop}/adminLang`).get().then(x => x.val()).catch(() => null);
  if (LANGS.includes(a)) return a;
  const d = details || await db.ref(`shop_details/${shop}/lang`).get().then(x => ({ lang: x.val() })).catch(() => ({}));
  return normLang(d && d.lang);
}


// Οι έτοιμες περιστάσεις (λίστα στη φόρμα) αποθηκεύονται στα ελληνικά. Εδώ μόνο για εμφάνιση.
const OCC = {
  "el": {
    "birthday": "Γενέθλια",
    "anniversary": "Επέτειος",
    "nameday": "Ονομαστική γιορτή",
    "romantic": "Ρομαντικό δείπνο",
    "proposal": "Πρόταση γάμου",
    "business": "Επαγγελματικό γεύμα",
    "family": "Οικογενειακή γιορτή"
  },
  "en": {
    "birthday": "Birthday",
    "anniversary": "Anniversary",
    "nameday": "Name day",
    "romantic": "Romantic dinner",
    "proposal": "Marriage proposal",
    "business": "Business meal",
    "family": "Family celebration"
  },
  "de": {
    "birthday": "Geburtstag",
    "anniversary": "Jahrestag",
    "nameday": "Namenstag",
    "romantic": "Romantisches Abendessen",
    "proposal": "Heiratsantrag",
    "business": "Geschäftsessen",
    "family": "Familienfeier"
  },
  "fr": {
    "birthday": "Anniversaire",
    "anniversary": "Anniversaire de couple",
    "nameday": "Fête du prénom",
    "romantic": "Dîner romantique",
    "proposal": "Demande en mariage",
    "business": "Repas d'affaires",
    "family": "Fête de famille"
  },
  "it": {
    "birthday": "Compleanno",
    "anniversary": "Anniversario",
    "nameday": "Onomastico",
    "romantic": "Cena romantica",
    "proposal": "Proposta di matrimonio",
    "business": "Pranzo di lavoro",
    "family": "Festa di famiglia"
  },
  "es": {
    "birthday": "Cumpleaños",
    "anniversary": "Aniversario",
    "nameday": "Santo (onomástica)",
    "romantic": "Cena romántica",
    "proposal": "Pedida de mano",
    "business": "Comida de negocios",
    "family": "Celebración familiar"
  },
  "tr": {
    "birthday": "Doğum günü",
    "anniversary": "Yıldönümü",
    "nameday": "İsim günü",
    "romantic": "Romantik akşam yemeği",
    "proposal": "Evlilik teklifi",
    "business": "İş yemeği",
    "family": "Aile kutlaması"
  },
  "pt": {
    "birthday": "Aniversário",
    "anniversary": "Aniversário de casamento",
    "nameday": "Dia do santo",
    "romantic": "Jantar romântico",
    "proposal": "Pedido de casamento",
    "business": "Almoço de negócios",
    "family": "Celebração familiar"
  }
};
const OCC_KEY = Object.fromEntries(Object.entries(OCC.el).map(([k, v]) => [v, k]));
function occasionLabel(value, lang) {
  if (!value) return '';
  const k = OCC_KEY[value];
  return k ? (OCC[normLang(lang)] || OCC.en)[k] : value;
}

module.exports = { LANGS, LOCALE, normLang, fmtDate, msg, locationLabel, occasionLabel, shopLang };
