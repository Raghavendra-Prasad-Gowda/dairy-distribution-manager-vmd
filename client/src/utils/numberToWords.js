const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertHundreds(n) {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
}

/**
 * Converts a numeric amount to Indian-format words.
 * e.g. 1,25,340.50 → "One Lakh Twenty Five Thousand Three Hundred Forty Rupees and Fifty Paise Only"
 */
export function numberToWords(amount) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return '';

  const num    = Math.abs(Number(amount));
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);

  const parts = [];

  const crores    = Math.floor(rupees / 10_000_000);
  const lakhs     = Math.floor((rupees % 10_000_000) / 100_000);
  const thousands = Math.floor((rupees % 100_000) / 1_000);
  const hundreds  = rupees % 1_000;

  if (crores    > 0) parts.push(convertHundreds(crores)    + ' Crore');
  if (lakhs     > 0) parts.push(convertHundreds(lakhs)     + ' Lakh');
  if (thousands > 0) parts.push(convertHundreds(thousands) + ' Thousand');
  if (hundreds  > 0) parts.push(convertHundreds(hundreds));

  let result = parts.join(' ');

  if (rupees > 0 && paise > 0) {
    result += ' Rupees and ' + convertHundreds(paise) + ' Paise Only';
  } else if (rupees > 0) {
    result += ' Rupees Only';
  } else if (paise > 0) {
    result = convertHundreds(paise) + ' Paise Only';
  }

  return result;
}
