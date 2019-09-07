import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from 'typeorm';

@Entity()
export class Videos extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number = 0;

    @Column()
    public photograph_id: number = 0;

    @Column()
    public mimetype: string = '';

    @Column()
    public file_name: string = '';

    @Column()
    public size: number = 0;

    @Column({ type: 'bytea' })
    public data: Buffer = Buffer.from([]);

    @Column()
    public created_datetime: Date = new Date;

    @Column()
    public modified_datetime: Date = new Date;
}

export default Videos;
