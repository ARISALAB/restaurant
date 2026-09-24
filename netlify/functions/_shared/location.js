// Η προτίμηση χώρου αποθηκεύεται στα ελληνικά. Εδώ τη μεταφράζουμε μόνο για εμφάνιση.
const LOC = {
  'Εσωτερικός':        { el: 'Εσωτερικός χώρος', en: 'Indoor' },
  'Εξωτερικός':        { el: 'Εξωτερικός χώρος', en: 'Outdoor' },
  'Δεν έχω προτίμηση': { el: 'Χωρίς προτίμηση',  en: 'No preference' }
};
function locationLabel(value, lang) {
  if (!value) return '';
  const m = LOC[value];
  return m ? m[lang === 'en' ? 'en' : 'el'] : value;
}
module.exports = { locationLabel };
