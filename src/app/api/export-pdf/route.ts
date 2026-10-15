import puppeteer from 'puppeteer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { html } = await req.json();

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      "args": [
        "--no-sandbox"
      ]
    });
    const page = await browser.newPage();

    // Set content and wait for network idle
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    await browser.close();

    // Return PDF as response
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=document.pdf'
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
