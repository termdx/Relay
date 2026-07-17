import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';

/** Immutable snapshot of exactly what the client is asked to approve. */
export interface ApprovalPayload {
  title: string;
  summary: string;
  tasks: { title: string; body: string; assignee?: string | null }[];
}

@Entity('approvals')
export class Approval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The meeting this approval belongs to (owned by the meeting module). */
  @Column()
  meetingId!: string;

  /** Magic-link secret. This is the client's only credential in v0.1. */
  @Index({ unique: true })
  @Column()
  token!: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status!: ApprovalStatus;

  /** Frozen at send time so the record reflects what was actually agreed. */
  @Column({ type: 'simple-json' })
  payload!: ApprovalPayload;

  @Column({ type: 'text', nullable: true })
  clientComment!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
}
