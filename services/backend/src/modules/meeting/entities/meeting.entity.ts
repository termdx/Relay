import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MeetingTask } from './meeting-task.entity';

export type MeetingStatus =
  | 'DRAFTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CHANGES_REQUESTED';

@Entity('meetings')
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  transcript!: string;

  @Column()
  clientEmail!: string;

  /** Target repo for pushed tasks, "owner/repo". Inlined for v0.1; becomes a
   * Project relation later. */
  @Column()
  githubRepo!: string;

  @Column({ type: 'varchar', default: 'DRAFTED' })
  status!: MeetingStatus;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /**
   * The client's most recent response comment (from an approval decision).
   * Surfaced here so the founder's read of the meeting shows *what* the client
   * said — especially when they requested changes.
   */
  @Column({ type: 'text', nullable: true })
  clientComment!: string | null;

  @OneToMany(() => MeetingTask, (task) => task.meeting, {
    cascade: true,
    eager: true,
  })
  tasks!: MeetingTask[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
