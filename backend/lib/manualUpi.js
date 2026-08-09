// Personal UPI VPA for the manual-confirmation QR flow. A payment made to this
// ID never touches this server or Razorpay, so it can't be auto-verified -
// the customer submits their UTR reference and an admin manually confirms it
// against their bank statement before the order/ticket is marked paid.
const MANUAL_UPI_ID = 'punithraras-2@okhdfcbank';

function buildUpiUri({ amountPaise, referenceId, companyName }) {
    const params = new URLSearchParams({
        pa: MANUAL_UPI_ID,
        pn: companyName || 'Technical of RSP Groups',
        am: (amountPaise / 100).toFixed(2),
        cu: 'INR',
        tn: `Order ${referenceId}`,
    });
    return `upi://pay?${params.toString()}`;
}

module.exports = { MANUAL_UPI_ID, buildUpiUri };
