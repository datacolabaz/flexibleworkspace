import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminSearchResult {
  type: 'BOOKING' | 'PROVIDER' | 'ROOM' | 'CUSTOMER' | 'PAYMENT';
  id: string;
  label: string;
  meta?: Record<string, unknown>;
}

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §18 "Search Everywhere" — a single
 * query box across booking IDs, provider emails/names, room names, and
 * customer emails, so an admin working a support ticket doesn't need to
 * know which module a thing lives in. Cross-entity NAVIGATION (Provider ->
 * Location -> Room -> Booking -> Payment -> Review) is left to the
 * frontend, which isn't built yet (P4-9/10) — this returns enough (type +
 * id) for it to route correctly once it exists.
 */
@Injectable()
export class AdminSearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(query: string): Promise<AdminSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const results: AdminSearchResult[] = [];

    if (UUID_RE.test(q)) {
      const [booking] = await this.dataSource.query(
        `SELECT id, status, total_amount, currency FROM booking WHERE id = $1`,
        [q],
      );
      if (booking) {
        results.push({
          type: 'BOOKING',
          id: booking.id,
          label: `Booking ${booking.id} — ${booking.status}`,
          meta: {
            status: booking.status,
            totalAmount: booking.total_amount,
            currency: booking.currency,
          },
        });
      }
      const [payment] = await this.dataSource.query(
        `SELECT id, status, booking_id FROM payment WHERE id = $1`,
        [q],
      );
      if (payment) {
        results.push({
          type: 'PAYMENT',
          id: payment.id,
          label: `Payment ${payment.id} — ${payment.status}`,
          meta: { bookingId: payment.booking_id },
        });
      }
    }

    const like = `%${q}%`;

    const providers = await this.dataSource.query(
      `SELECT p.id, p.display_name, u.email
       FROM provider p JOIN app_user u ON u.id = p.owner_user_id
       WHERE p.display_name ILIKE $1 OR p.legal_name ILIKE $1 OR u.email ILIKE $1
       LIMIT 10`,
      [like],
    );
    for (const p of providers) {
      results.push({
        type: 'PROVIDER',
        id: p.id,
        label: `${p.display_name} (${p.email ?? 'no email'})`,
      });
    }

    const rooms = await this.dataSource.query(
      `SELECT r.id, r.name, p.display_name AS provider_name
       FROM room r JOIN location l ON l.id = r.location_id JOIN provider p ON p.id = l.provider_id
       WHERE r.name ILIKE $1
       LIMIT 10`,
      [like],
    );
    for (const r of rooms) {
      results.push({
        type: 'ROOM',
        id: r.id,
        label: `${r.name} — ${r.provider_name}`,
      });
    }

    const customers = await this.dataSource.query(
      `SELECT id, email, phone, display_name FROM app_user WHERE email ILIKE $1 OR phone ILIKE $1 OR display_name ILIKE $1 LIMIT 10`,
      [like],
    );
    for (const c of customers) {
      results.push({
        type: 'CUSTOMER',
        id: c.id,
        label: `${c.display_name ?? c.email ?? c.phone}`,
      });
    }

    return results;
  }
}
