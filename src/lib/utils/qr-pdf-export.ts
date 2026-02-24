import jsPDF from 'jspdf';
import QRCode from 'qrcode';

interface ParticipantEntry {
	name: string;
	token: string;
}

const COLS = 2;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;

const MARGIN = 10; // mm
const PAGE_W = 210; // A4
const PAGE_H = 297;

const CELL_W = (PAGE_W - 2 * MARGIN) / COLS; // ~95mm
const CELL_H = (PAGE_H - 2 * MARGIN) / ROWS; // ~69mm

const QR_SIZE = 45; // mm

export async function generateQrPdf(participants: ParticipantEntry[]): Promise<void> {
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });

	for (let i = 0; i < participants.length; i++) {
		if (i > 0 && i % PER_PAGE === 0) {
			doc.addPage();
		}

		const indexOnPage = i % PER_PAGE;
		const col = indexOnPage % COLS;
		const row = Math.floor(indexOnPage / COLS);

		const cellX = MARGIN + col * CELL_W;
		const cellY = MARGIN + row * CELL_H;

		const qrDataUrl = await QRCode.toDataURL(participants[i].token, {
			width: 400,
			margin: 1,
			errorCorrectionLevel: 'M'
		});

		// Center QR code horizontally in cell
		const qrX = cellX + (CELL_W - QR_SIZE) / 2;
		const qrY = cellY + 4;

		doc.addImage(qrDataUrl, 'PNG', qrX, qrY, QR_SIZE, QR_SIZE);

		// Name below QR code, centered
		doc.setFontSize(11);
		const textX = cellX + CELL_W / 2;
		const textY = qrY + QR_SIZE + 6;
		doc.text(participants[i].name, textX, textY, { align: 'center' });
	}

	doc.save('participants-qr-codes.pdf');
}
