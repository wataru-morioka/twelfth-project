import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from 'typeorm';

@Entity('contacts')
export class Contacts extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number = 0;

    @Column()
    public account: string = '';

    @Column()
    public name: string = '';

    @Column()
    public organization: string = '';

    @Column()
    public state: string = '';

    @Column()
    public email: string = '';

    @Column()
    public phone: string = '';

    @Column()
    public message: string = '';

    @Column()
    public created_datetime: Date = new Date;
}

export default Contacts;
