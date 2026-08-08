const PDFDocument = require('pdfkit');

function formatMoney(paise, currency) {
    return `${currency || 'INR'} ${(paise / 100).toFixed(2)}`;
}

function streamInvoice(res, { order, items, customerName, customerEmail, site }) {
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.id || order._id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor('#1e293b').text(site.company_name || 'Invoice', { align: 'left' });
    doc.fontSize(10).fillColor('#64748b')
        .text(site.address || '', { align: 'left' })
        .text(`${site.location || ''}${site.postal_code ? ' - ' + site.postal_code : ''}`)
        .text(site.gst ? `GST: ${site.gst}` : '')
        .text(site.email || '');

    doc.moveDown(1.5);
    doc.fontSize(16).fillColor('#1e293b').text('Invoice', { align: 'right' });
    doc.fontSize(10).fillColor('#64748b')
        .text(`Order ID: ${order.id || order._id}`, { align: 'right' })
        .text(`Date: ${new Date(order.created_at).toLocaleDateString('en-IN')}`, { align: 'right' })
        .text(`Payment ID: ${order.razorpay_payment_id || '-'}`, { align: 'right' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#1e293b').text(`Billed to: ${customerName || ''} (${customerEmail || ''})`);

    doc.moveDown(1.5);
    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#1e293b');
    doc.text('Item', 50, tableTop, { width: 300 });
    doc.text('Qty', 350, tableTop, { width: 60, align: 'right' });
    doc.text('Amount', 420, tableTop, { width: 120, align: 'right' });
    doc.moveTo(50, tableTop + 16).lineTo(540, tableTop + 16).strokeColor('#e2e8f0').stroke();

    let y = tableTop + 24;
    items.forEach((item) => {
        doc.fontSize(10).fillColor('#334155');
        doc.text(item.title, 50, y, { width: 300 });
        doc.text(String(item.quantity || 1), 350, y, { width: 60, align: 'right' });
        doc.text(formatMoney(item.amount_paise, order.currency), 420, y, { width: 120, align: 'right' });
        y += 20;
    });

    doc.moveTo(50, y + 4).lineTo(540, y + 4).strokeColor('#e2e8f0').stroke();
    doc.fontSize(12).fillColor('#1e293b').text('Total', 350, y + 14, { width: 60 });
    doc.text(formatMoney(order.amount_paise, order.currency), 420, y + 14, { width: 120, align: 'right' });

    doc.moveDown(3);
    doc.fontSize(9).fillColor('#94a3b8').text('This is a computer-generated invoice and does not require a signature.', 50, doc.y, { align: 'center', width: 490 });

    doc.end();
}

module.exports = { streamInvoice };
