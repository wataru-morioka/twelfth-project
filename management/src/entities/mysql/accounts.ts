import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from 'typeorm';

@Entity('accounts')
export class Accounts extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number = 0;

    @Column()
    public delete_flag: boolean = false;

    @Column()
    public webrtc_flag: boolean = false;

    @Column()
    public admin_flag: boolean = false;

    @Column()
    public account: string = '';

    @Column()
    public name: string = '';

    @Column()
    public state: string = '';

    @Column()
    public login_count: number = 0;

    @Column()
    public latest_login: Date = new Date;

    @Column()
    public created_datetime: Date = new Date;

    @Column()
    public modified_datetime: Date = new Date;
}

export default Accounts;
