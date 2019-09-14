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
import { Photographs } from './entities/photographs';
import { Videos } from './entities/videos';
import { getConnectionOptions, createConnection, BaseEntity, Brackets,
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

// app.post('/minify', upload2.single('file'), async (req, res, next) => {
//     const fileName = req.file.originalname;

//     const files = await imagemin([`./uploads/tmp/${fileName}`], {
//     });

//     res.download(`./minified/tmp/${fileName}`);
// });

app.get('/minify', async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.query.photoId;
    const photo = await Photographs.findOne({
        where: {
            id: photoId,
        },
    });

    // tmpフォルダに書き出し
    const fileName = photo!.file_name;
    // const file = new File([photo!.data], fileName, { type: photo!.mimetype });
    await fs.createWriteStream(`./uploads/tmp/${fileName}`).write(photo!.data);
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

    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    const data = fs.readFileSync(`./minified/tmp/${fileName}`);
    photo!.data = data;
    photo!.size = data.length;
    photo!.modified_datetime = now;
    let response = {};

    await photo!.save().then((result) => {
        console.log('success');
        response = {
            result: true,
        };
    }).catch((err) => {
        console.log(err);
        response = {
            result: false,
        };
    });

    res.send(response);
});

app.post('/photographs', upload.single('file'), async (req, res, next) => {
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

    // TODO admin権限確認

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

    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    const photo = new Photographs();
    photo.mimetype = mimetype;
    photo.file_name = fileName;
    photo.size = size;
    photo.data = buffer;
    photo.created_datetime = now;
    photo.modified_datetime = now;

    await photo.save().then((result) => {
        console.log('success');
    }).catch((err) => {
        console.log(err);
    });

    res.status(200).end('ok');
});

app.post('/video', upload.single('file'), async (req, res, next) => {
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

    // TODO admin権限確認

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

    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    const video = new Videos();
    video.photograph_id = 1;
    video.mimetype = mimetype;
    video.file_name = fileName;
    video.size = size;
    video.data = buffer;
    video.created_datetime = now;
    video.modified_datetime = now;

    await video.save().then((result) => {
        console.log('success');
    }).catch((err) => {
        console.log(err);
    });

    res.status(200).end('ok');
});

app.get('/video', async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.query.photoId;
    const video = await Videos.findOne({
        where: {
            photograph_id: photoId,
        },
    });

    let response = {};
    console.log(video);

    if (video) {
        video.created_datetime = moment(new Date(video!.created_datetime))
                                .format('YYYY-MM-DD HH:mm:ss');
        response = {
            result: true,
            videoInfo: video,
        };
    } else {
        response = {
            result: false,
        };
    }

    res.send(response);
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

app.get('/download', async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.query.photoId;

    const photo = await Photographs.findOne({
        where: {
            id: photoId,
        },
    });

    const response = {
        result: true,
        photoInfo: photo,
    };

    res.send(response);
});

app.get('/photographs', async (req, res, next) => {
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

    // TODO admin権限確認

    const photos = await Photographs.find({
        order: {
            created_datetime: 'DESC',
        },
    });

    photos.forEach((photo: any) => {
        photo.created_datetime = moment(new Date(photo.created_datetime))
                                    .format('YYYY-MM-DD HH:mm:ss');
    });

    const response = {
        result: true,
        photoArray: photos,
    };

    res.send(response);
});

app.delete('/photographs', async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.query.photoId;
    let response = {};
    console.log(photoId);

    const photo = await Photographs.findOne({
        where: {
            id: photoId,
        },
    });

    await photo!.remove()
    .then(() => {
        response = {
            result: true,
        };
    })
    .catch(() => {
        response = {
            result: false,
        };
    });

    res.send(response);
});

app.put('/photographs', upload.single('file'), async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.body.photoId;
    const thumbnail = req.file;
    const subTitle = req.body.subTitle;
    const title = req.body.title;
    let response = {};

    const photo = await Photographs.findOne({
        where: {
            id: photoId,
        },
    });

    if (thumbnail) {
        const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
        // photoId = req.photoId;
        const fileName = thumbnail.originalname;
        const buffer = thumbnail.buffer;
        const mimetype = thumbnail.mimetype;
        const size = thumbnail.size;
        console.log(fileName);
        console.log(buffer);
        console.log(mimetype);
        console.log(size);
        console.log(process.env.POSTGRES_DB);
        photo!.file_name = fileName;
        photo!.data = buffer;
        photo!.mimetype = mimetype;
        photo!.size = size;
        photo!.modified_datetime = now;
    } else {
        if (subTitle === undefined) {
            photo!.title = title;
        } else {
            photo!.sub_title = subTitle;
        }
    }

    await photo!.save()
    .then(() => {
        response = {
            result: true,
        };
    })
    .catch(() => {
        response = {
            result: false,
        };
    });

    res.send(response);
});

app.put('/video', upload.single('file'), async (req, res, next) => {
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

    // TODO admin権限確認

    const photoId = req.body.photoId;
    const videoData = req.file;
    let response = {};

    let video = await Videos.findOne({
        where: {
            photograph_id: photoId,
        },
    });

    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    const fileName = videoData.originalname;
    const buffer = videoData.buffer;
    const mimetype = videoData.mimetype;
    const size = videoData.size;
    console.log(fileName);
    console.log(buffer);
    console.log(mimetype);
    console.log(size);
    console.log(process.env.POSTGRES_DB);

    if (video) {
        video.file_name = fileName;
        video.data = buffer;
        video.mimetype = mimetype;
        video.size = size;
        video.modified_datetime = now;
    } else {
        video = new Videos();
        video.photograph_id = photoId;
        video.mimetype = mimetype;
        video.file_name = fileName;
        video.size = size;
        video.data = buffer;
        video.created_datetime = now;
        video.modified_datetime = now;
    }

    await video.save()
    .then(() => {
        response = {
            result: true,
        };
    })
    .catch(() => {
        response = {
            result: false,
        };
    });

    res.send(response);
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
            contacts = await Contacts.find({
                order: {
                    created_datetime: 'ASC',
                },
                take: 100,
            });
        }
    } else if (searchString.length !== 0 && createdTo.length === 0) {
        count = await Contacts.createQueryBuilder()
        .where("account like '%' || :search || '%'", { search: searchString })
        .orWhere("name like '%' || :search || '%'", { search: searchString })
        .orWhere("email like '%' || :search || '%'", { search: searchString })
        .orWhere("message like '%' || :search ||'%'", { search: searchString })
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder()
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder()
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length === 0 && createdTo.length !== 0) {
        count = await Contacts.createQueryBuilder()
        .where('created_datetime <= :to', { to: createdTo })
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length !== 0 && createdTo.length !== 0) {
        count = await Contacts.createQueryBuilder()
        .where('created_datetime <= :to', { to: createdTo })
        .andWhere(
            new Brackets((q) => {
              q.where("account like '%' || :search || '%'", { search: searchString });
              q.orWhere("name like '%' || :search || '%'", { search: searchString });
              q.orWhere("email like '%' || :search || '%'", { search: searchString });
              q.orWhere("message like '%' || :search ||'%'", { search: searchString });
            }),
        )
        .getCount();

        if (query.type === 'true') {
            contacts = await Contacts.createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .andWhere(
                new Brackets((q) => {
                  q.where("account like '%' || :search || '%'", { search: searchString });
                  q.orWhere("name like '%' || :search || '%'", { search: searchString });
                  q.orWhere("email like '%' || :search || '%'", { search: searchString });
                  q.orWhere("message like '%' || :search ||'%'", { search: searchString });
                }),
            )
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await Contacts.createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .andWhere(
                new Brackets((q) => {
                    q.where("account like '%' || :search || '%'", { search: searchString });
                    q.orWhere("name like '%' || :search || '%'", { search: searchString });
                    q.orWhere("email like '%' || :search || '%'", { search: searchString });
                    q.orWhere("message like '%' || :search ||'%'", { search: searchString });
                }),
            )
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
