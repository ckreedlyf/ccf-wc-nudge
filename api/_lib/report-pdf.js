const PDFDocument = require('pdfkit');
const { PassThrough } = require('node:stream');

const COLORS = { ink: '#17324d', blue: '#1e6b9f', sky: '#e7f4fb', green: '#23785a', gold: '#b9822b', red: '#b54747', gray: '#62748a', line: '#dce5ee', pale: '#f5f8fb' };

function renderReportPdf(report, output) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, right: 46, bottom: 110, left: 46 }, info: { Title: report.title, Author: 'CCF Welcome Center', Subject: `${report.reportType} report for ${report.period}` } });
  doc.pipe(output);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let pageNumber = 1;
  const addFooter = () => {
    const y = doc.page.height - 120;
    doc.moveTo(doc.page.margins.left, y - 7).lineTo(doc.page.width - doc.page.margins.right, y - 7).strokeColor(COLORS.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.gray).text('Confidential - For authorized CCF Welcome Center use only.', doc.page.margins.left, y, { width: 300, lineBreak: false });
    doc.text(`${report.period}  |  Page ${pageNumber}`, doc.page.width - doc.page.margins.right - 180, y, { width: 180, align: 'right', lineBreak: false });
    doc.x = doc.page.margins.left;
    doc.y = doc.page.margins.top;
  };
  doc.on('pageAdded', () => { pageNumber += 1; addFooter(); });
  addFooter();
  const ensureSpace = (height) => { if (doc.y + height > doc.page.height - doc.page.margins.bottom - 20) doc.addPage(); };
  const sectionTitle = (title, subtitle = '') => {
    ensureSpace(subtitle ? 78 : 55);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(title, doc.page.margins.left, y, { width: pageWidth });
    if (subtitle) doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.gray).text(subtitle, doc.page.margins.left, y + 18, { width: pageWidth, lineGap: 2 });
    doc.x = doc.page.margins.left;
    doc.y = y + (subtitle ? 40 : 25);
  };
  const bar = (label, value, max, rightText, color = COLORS.blue) => {
    ensureSpace(30);
    const y = doc.y;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(label, doc.page.margins.left, y, { width: 145 });
    const x = doc.page.margins.left + 150;
    const width = pageWidth - 215;
    doc.roundedRect(x, y + 1, width, 8, 4).fill(COLORS.line);
    doc.roundedRect(x, y + 1, Math.max(0, Math.min(width, max ? width * value / max : 0)), 8, 4).fill(color);
    doc.font('Helvetica-Bold').fillColor(COLORS.ink).text(rightText, x + width + 8, y - 1, { width: 58, align: 'right' });
    doc.x = doc.page.margins.left;
    doc.y = y + 22;
  };
  const metricCards = (items) => {
    const gap = 8;
    const width = (pageWidth - gap * 3) / 4;
    const y = doc.y;
    items.forEach((item, index) => {
      const x = doc.page.margins.left + index * (width + gap);
      doc.roundedRect(x, y, width, 66, 5).fillAndStroke(index === 1 ? '#edf9f3' : COLORS.pale, COLORS.line);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gray).text(item.label.toUpperCase(), x + 9, y + 10, { width: width - 18 });
      doc.font('Helvetica-Bold').fontSize(21).fillColor(index === 1 ? COLORS.green : COLORS.ink).text(String(item.value), x + 9, y + 27, { width: width - 18 });
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.gray).text(item.note || '', x + 9, y + 52, { width: width - 18 });
    });
    doc.x = doc.page.margins.left;
    doc.y = y + 78;
  };
  const lineChart = (series) => {
    if (!series.some((item) => item.total)) return;
    ensureSpace(155);
    const x = doc.page.margins.left + 22;
    const y = doc.y + 8;
    const width = pageWidth - 44;
    const height = 92;
    [0, 25, 50, 75, 100].forEach((tick) => {
      const lineY = y + height - height * tick / 100;
      doc.moveTo(x, lineY).lineTo(x + width, lineY).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.gray).text(`${tick}%`, x - 22, lineY - 3, { width: 18, align: 'right' });
    });
    const points = series.map((item, index) => ({ x: x + (series.length === 1 ? width / 2 : width * index / (series.length - 1)), y: y + height - height * item.placementRate / 100, item }));
    points.forEach((point, index) => { if (!index) doc.moveTo(point.x, point.y); else doc.lineTo(point.x, point.y); });
    doc.strokeColor(COLORS.blue).lineWidth(2).stroke();
    points.forEach((point) => {
      doc.circle(point.x, point.y, 3).fill(COLORS.blue);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.ink).text(`${point.item.placementRate}%`, point.x - 15, point.y - 14, { width: 30, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.gray).text(point.item.label, point.x - 30, y + height + 9, { width: 60, align: 'center' });
    });
    doc.x = doc.page.margins.left;
    doc.y = y + height + 34;
  };
  const table = (headers, rows, widths) => {
    const rowHeight = 18;
    const drawRow = (cells, header = false) => {
      ensureSpace(rowHeight + 4);
      const y = doc.y;
      if (header) doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill(COLORS.sky);
      let x = doc.page.margins.left;
      cells.forEach((cell, index) => {
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(COLORS.ink).text(String(cell), x + 5, y + 5, { width: widths[index] - 10, ellipsis: true });
        x += widths[index];
      });
      doc.moveTo(doc.page.margins.left, y + rowHeight).lineTo(doc.page.margins.left + pageWidth, y + rowHeight).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      doc.y = y + rowHeight;
      doc.x = doc.page.margins.left;
    };
    drawRow(headers, true);
    rows.forEach((row) => drawRow(row));
    doc.moveDown(0.7);
  };

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.blue).text('CCF WELCOME CENTER');
  doc.font('Helvetica-Bold').fontSize(23).fillColor(COLORS.ink).text('Miner Nudge Report', { lineGap: 2 });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.gray).text(`${report.reportType === 'detailed' ? 'Detailed Operational Report' : 'Executive Summary'}  |  ${report.period}  |  ${report.scope}`);
  doc.moveDown(0.8);
  const infoBoxY = doc.y;
  doc.roundedRect(doc.page.margins.left, infoBoxY, pageWidth, 45, 5).fill(COLORS.sky);
  const infoY = infoBoxY + 9;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gray).text('GENERATED', doc.page.margins.left + 12, infoY);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(new Date(report.generatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }), doc.page.margins.left + 12, infoY + 13, { width: 170 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gray).text('GENERATED BY', doc.page.margins.left + 220, infoY);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(report.generatedBy, doc.page.margins.left + 220, infoY + 13, { width: 260 });
  doc.x = doc.page.margins.left;
  doc.y = infoBoxY + 57;

  sectionTitle('Executive Insight');
  const insightY = doc.y;
  doc.roundedRect(doc.page.margins.left, insightY, pageWidth, 48, 5).fillAndStroke('#f7fbfe', '#b9ddf5');
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(report.executiveSummary, doc.page.margins.left + 12, insightY + 11, { width: pageWidth - 24, lineGap: 3 });
  doc.x = doc.page.margins.left;
  doc.y = insightY + 60;

  sectionTitle('Key Metrics', 'Aggregated from the selected Harvest Sheet months and status scope.');
  metricCards([
    { label: 'Total Seekers', value: report.metrics.total, note: report.scope },
    { label: 'Placed / Connected', value: report.metrics.placed, note: `${report.metrics.placementRate}% placement rate` },
    { label: 'Needs Follow-up', value: report.metrics.needsFollowUp, note: 'Active / ongoing' },
    { label: 'Ready for Repost', value: report.metrics.readyForRepost, note: 'Status 5' },
  ]);
  metricCards([
    { label: 'Placement Rate', value: `${report.metrics.placementRate}%`, note: 'Existing placed definition' },
    { label: 'Ongoing', value: report.metrics.ongoing, note: 'Statuses 1 through 4' },
    { label: 'Already Has DGroup', value: report.metrics.alreadyHasDGroup, note: 'Included as connected' },
    { label: 'Unsuccessful', value: report.metrics.unsuccessful, note: 'Placement outcome' },
  ]);

  sectionTitle('Placement Progress', `${report.metrics.placed} placed or connected out of ${report.metrics.total} seekers.`);
  bar('Placement rate', report.metrics.placed, report.metrics.total, `${report.metrics.placementRate}%`, COLORS.green);

  if (report.monthly.some((item) => item.total)) {
    sectionTitle('Monthly Placement Trend', 'Placement rate by available month; labels include placed / total volume.');
    lineChart(report.monthly);
    report.monthly.forEach((item) => bar(item.label, item.placed, Math.max(1, item.total), `${item.placed} / ${item.total}`, COLORS.blue));
  }

  if (report.statusDistribution.length) {
    sectionTitle('Status Distribution');
    report.statusDistribution.forEach((item) => bar(item.label, item.count, report.metrics.total, `${item.count} (${item.percentage}%)`, item.label.startsWith('Placed') ? COLORS.green : item.label.includes('Repost') ? COLORS.gold : COLORS.blue));
  }

  if (report.imts.length) {
    sectionTitle('IMT Performance', 'Placement rate and placed / assigned volume are shown together.');
    report.imts.forEach((item) => bar(item.imt, item.placementRate, 100, `${item.placementRate}%  ${item.placed}/${item.total}`, COLORS.blue));
  }

  if (report.bottlenecks.length) {
    sectionTitle('Operational Bottlenecks', 'Only categories reliably derived from centralized placement statuses are included.');
    const max = Math.max(...report.bottlenecks.map((item) => item.count));
    report.bottlenecks.forEach((item) => bar(item.label, item.count, max, String(item.count), item.label.includes('Repost') ? COLORS.gold : COLORS.red));
  }

  if (report.reportType === 'detailed') {
    doc.addPage();
    sectionTitle('Monthly Breakdown');
    table(['Month', 'Total', 'Placed / Connected', 'Placement Rate'], report.monthly.map((item) => [item.label, item.total, item.placed, `${item.placementRate}%`]), [190, 85, 135, pageWidth - 410]);
    sectionTitle('Per-IMT Metrics');
    table(['IMT', 'Assigned', 'Placed / Connected', 'Placement Rate'], report.imts.map((item) => [item.imt, item.total, item.placed, `${item.placementRate}%`]), [190, 85, 135, pageWidth - 410]);
    sectionTitle('Detailed Status Counts');
    table(['Status', 'Description', 'Count', 'Share'], report.detailedStatuses.map((item) => [item.code, item.label, item.count, `${item.percentage}%`]), [55, 280, 70, pageWidth - 405]);
  }

  doc.end();
  return doc;
}

async function renderReportPdfBuffer(report) {
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  renderReportPdf(report, output);
  await complete;
  return Buffer.concat(chunks);
}

module.exports = { renderReportPdf, renderReportPdfBuffer };
