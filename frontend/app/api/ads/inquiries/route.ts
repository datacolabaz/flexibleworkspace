import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        contactName?: string;
        contactPhone?: string;
        contactEmail?: string;
        companyName?: string;
        message?: string;
      }
    | null;

  if (
    !body ||
    typeof body.contactName !== 'string' ||
    !body.contactName.trim() ||
    typeof body.contactPhone !== 'string' ||
    !body.contactPhone.trim()
  ) {
    return NextResponse.json(
      { message: 'Ad, soyad və telefon nömrəsi tələb olunur.' },
      { status: 400 },
    );
  }

  const backend = process.env.BACKEND_API_URL;
  if (!backend) {
    return NextResponse.json(
      { message: 'Xidmət hazırda əlçatan deyil.' },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${backend.replace(/\/$/, '')}/ads/inquiries`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail || undefined,
          companyName: body.companyName || undefined,
          message: body.message || undefined,
        }),
      },
    );
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        json ?? { message: 'Sorğu göndərilmədi.' },
        { status: response.status },
      );
    }
    return NextResponse.json(json ?? { ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Sorğu göndərilmədi. Yenidən cəhd edin.' },
      { status: 502 },
    );
  }
}
