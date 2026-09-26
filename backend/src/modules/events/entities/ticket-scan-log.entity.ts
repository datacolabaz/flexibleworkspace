import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Audit log for every QR check-in scan attempt.
 * result values: success | duplicate | invalid_token | cancelled |
 *                not_confirmed | unauthorized
 */
@Entity({ name: 'ticket_scan_log' })
export class TicketScanLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'scanner_user_id', type: 'uuid' })
  scannerUserId: string;

  @Column({ type: 'varchar', length: 30 })
  result: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'scanned_at', type: 'timestamptz' })
  scannedAt: Date;

  @Column({ type: 'jsonb', nullable: true, name: 'device_info' })
  deviceInfo: Record<string, unknown> | null;
}
