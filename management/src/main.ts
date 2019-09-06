import express from 'express';
import swaggerUiExpress from 'swagger-ui-express';
import multer from 'multer';
import yamljs from 'yamljs';
const cors = require('cors');
import { Client } from 'pg';
const bodyParser = require('body-parser');
const imagemin = require('imagemin');
// const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');
const imageminSvgo = require('imagemin-svgo');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminMozjpeg = require('imagemin-mozjpeg');
const storage2 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/tmp');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});
// // アップロードされたファイルを一時的にメモリへ保存する場合
const storage = multer.memoryStorage();
const upload = multer({ storage });
const upload2 = multer({ storage: storage2 });
const gm = require('gm');
const fs = require('fs');
const moment = require('moment');
const swaggerDocument = yamljs.load('swagger.yaml');
const admin = require('firebase-admin');
import { Contacts } from './entities/contacts';
import { getConnectionOptions, createConnection, BaseEntity,
     Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerDocument));

admin.initializeApp({
    credential: admin.credential.cert(require('../firebase-service.json')),
});

const dbConnect = async () => {
    const connectionOptions = await getConnectionOptions();
    const connection = await createConnection(connectionOptions);
    BaseEntity.useConnection(connection);
};

dbConnect();

export class Postgres{
    private client: Client;

    constructor() {
        this.client = new Client({
            database: process.env.POSTGRES_DB,
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            host: 'postgres',
            port: 5432,
        });
        this.client.connect();
    }

    public async query(sql: string, parameters: any[] = []) {
        return (await this.client.query(sql, parameters)).rows;
    }

    public async exec(sql: string, parameters: any[] = []) {
        return await this.client.query(sql, parameters);
    }

    public async end() {
        await this.client.end();
    }
}

app.post('/minify', upload2.single('file'), async (req, res, next) => {
    if (!req.file) {
        res.status(500).end('no file');
        next();
    }
    const fileName = req.file.originalname;
    const path = req.file.path;
    const mimetype = req.file.mimetype;
    const size = req.file.size;
    console.log(fileName);
    console.log(path);
    console.log(mimetype);
    console.log(size);

    const files = await imagemin([`./uploads/tmp/${fileName}`], {
        destination: './minified/tmp',
        plugins: [
            // imageminJpegtran(),
            imageminMozjpeg({ quality: 80 }),
            imageminPngquant({
                quality: [0.6, 0.8],
            }),
            imageminGifsicle({
                interlaced: false,
                optimizationLevel: 3,
                // colors:180
            }),
            imageminSvgo(),
        ],
    });

    res.download(`./minified/tmp/${fileName}`);
});

app.post('/image', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        res.status(500).end('no file');
        next();
    }
    const fileName = req.file.originalname;
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const size = req.file.size;
    console.log(fileName);
    console.log(buffer);
    console.log(mimetype);
    console.log(size);
    console.log(process.env.POSTGRES_DB);

    // TODO サイズチェック

    const now = new Date();

    // const sql = 'INSERT INTO \
    //         photos(id, file_name, mimetype, size, data, created_datetime, modified_datetime) \
    //         VALUES($1, $2, $3, $4, $5, $6, $7)';
    // const parameters = ['test2', fileName, mimetype, size, buffer, now, now];
    // // const sql = 'select * from users';
    // const pg = new Postgres();

    // await pg.query(sql, parameters).then((result) => {
    //     console.log(result);
    // }).catch((err) => {
    //     console.log(err);
    // });

    // // await pg.query(sql).then((rows) => {
    // //     console.log(rows[0]);
    // // }).catch((err) => {
    // //     console.log(err);
    // // });

    // pg.end();

    res.status(200).end('ok');
});

app.post('/download', async (req, res, next) => {
    if (!req.body) {
        res.status(500).end('no id');
        next();
    }
    // console.log(req.params.id);
    console.log(req.body);
    console.log(req.body.id);

    const pg = new Postgres();
    const sql = 'select file_name, mimetype, data from photos where id = $1';
    const parameters = [req.body.id];
    await pg.query(sql, parameters).then((rows) => {
        console.log(rows[0]);
        res.send(rows[0]);
    }).catch((err) => {
        console.log(err);
        res.status(500).end('server err');
    });
});

app.get('/contact', async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (authorization === undefined) {
        res.status(404).end();
        return;
    }

    const idToken = authorization.split(' ')[1];

    let userInfo: any = {};
    await admin.auth().verifyIdToken(idToken)
    .then((decodedToken: any) => {
        console.log(decodedToken);
        userInfo = decodedToken;
    }).catch((err: any) => {
        console.log(err);
        res.status(404).end();
        return;
    });

    const name = userInfo.name;
    const uid = userInfo.uid;
    const email = userInfo.email;

    const query = req.query;
    const searchString = query.search;
    const createdTo = query.createdTo;
    let contacts: any = [];
    let count: number = 0;

    if (searchString.length === 0 && createdTo.length === 0) {
        count = await Contacts.count();

        if (query.type === 'true') {
            contacts = await Contacts.find({
                order: {
                    created_datetime: 'DESC',
                },
                take: 100,
            });
        } else {
            console.log('test');
            contacts = await Contacts.find({
                order: {
                    created_datetime: 'ASC',
                },
                take: 100,
            });
        }
    } else if (searchString.length !== 0 && createdTo.length === 0) {
        count = await Contacts.createQueryBuilder('contacts')
        .where("account like '%' || :search || '%'", { search: searchString })
        .orWhere("name like '%' || :search || '%'", { search: searchString })
        .orWhere("email like '%' || :search || '%'", { search: searchString })
        .orWhere("message like '%' || :search ||'%'", { search: searchString })
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length === 0 && createdTo.length !== 0) {
        count = await Contacts.createQueryBuilder('contacts')
        .where('created_datetime <= :to', { to: createdTo })
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length !== 0 && createdTo.length !== 0) {
        count = await Contacts.createQueryBuilder('contacts')
        .where("account like '%' || :search || '%'", { search: searchString })
        .orWhere("name like '%' || :search || '%'", { search: searchString })
        .orWhere("email like '%' || :search || '%'", { search: searchString })
        .orWhere("message like '%' || :search ||'%'", { search: searchString })
        .andWhere('created_datetime <= :to', { to: createdTo })
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .andWhere('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder('contacts')
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .andWhere('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    }

    contacts.forEach((contact: any) => {
        contact.created_datetime = moment(new Date(contact.created_datetime))
                                    .format('YYYY-MM-DD HH:mm:ss');
    });

    const response = {
        result: true,
        contactList: contacts,
        totalCount: count,
    };

    res.send(response);
});

app.listen(7000, () => console.log('Listen on port 7000!!'));

export default app;
