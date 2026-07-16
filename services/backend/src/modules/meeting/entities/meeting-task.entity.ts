import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Meeting } from './meeting.entity';

@Entity('meeting_tasks')
export class MeetingTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.tasks, {
    onDelete: 'CASCADE',
  })
  meeting!: Meeting;

  @Column()
  title!: string;

  @Column({ type: 'text', default: '' })
  body!: string;

  @Column({ type: 'varchar', nullable: true })
  assignee!: string | null;

  /** Set once the task has been pushed to GitHub on approval. */
  @Column({ type: 'varchar', nullable: true })
  githubIssueUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;
}
