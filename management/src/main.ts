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
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/hls');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});
// // アップロードされたファイルを一時的にメモリへ保存する場合
const memory = multer.memoryStorage();
const uploadMemory = multer({ storage: memory });
const uploadStorage = multer({ storage });
const gm = require('gm');
const fs = require('fs');
const moment = require('moment');
const swaggerDocument = yamljs.load('swagger.yaml');
const admin = require('firebase-admin');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
import { Contacts } from './entities/postgres/contacts';
import { Photographs } from './entities/postgres/photographs';
import { Videos } from './entities/postgres/videos';
import { getConnectionOptions, createConnection, BaseEntity, Brackets,
     Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { resolve } from 'path';
import { Accounts } from './entities/mysql/accounts';
import fsExtra from 'fs-extra';

const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerDocument));
app.use(express.static('./public'));

admin.initializeApp({
    credential: admin.credential.cert(require('../firebase-service.json')),
});

let postgresConnection: any = null;
let mysqlConnection: any = null;

const postgresConnect = async () => {
    const connectionOptions = await getConnectionOptions('postgres');
    postgresConnection = await createConnection(connectionOptions);
    BaseEntity.useConnection(postgresConnection);
};

postgresConnect();

const mysqlConnect = async () => {
    const connectionOptions = await getConnectionOptions('mysql');
    mysqlConnection = await createConnection(connectionOptions);
    // BaseEntity.useConnection(mysqlConnection);
};

mysqlConnect();

const exchangeCodec = (path: string, folder: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
        if (fs.existsSync(folder)) {
            fsExtra.removeSync(folder);
        }
        fs.mkdirSync(folder);

        ffmpeg(path)
        .audioCodec('libopus')
        // .audioBitrate(96)
        .outputOptions([
            '-codec: copy',
            '-hls_time 10',
            '-hls_playlist_type vod',
            `-hls_segment_filename ${folder}/%03d.ts`,
        ])
        .output(`${folder}/index.m3u8`)
        .on('start', (commandLine: any) => {
            console.log(`Running ffmpeg with command:${commandLine}`);
        })
        .on('codecData', (data: any) => {
            console.log(`Input is${data.audio}audio with${data.video}video`);
        })
        .on('progress', (progress: any) => {
            console.log(`Processing:${progress.percent}% done`);
        })
        .on('error', (err: any, stdout: any, stderr: any) => {
            console.log(`Error while Processing video: ${err.message}`);
            console.log(stderr);
            reject();
        })
        .on('end', () => {
            console.log('Transcoding succeeded!');
            resolve();
        })
        .run();
    });
};

const isValidAuth = (req: any, annonymous: boolean = false): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
        const authorization = req.headers.authorization;
        if (authorization === undefined) {
            reject();
            return;
        }
        const idToken = authorization.split(' ')[1];
        let userInfo: any = {};
        let isValidAnnonymous = false;
        await admin.auth().verifyIdToken(idToken)
        .then((decodedToken: any) => {
            console.log(decodedToken);
            userInfo = decodedToken;
            if (annonymous) {
                resolve();
                isValidAnnonymous = true;
                return;
            }
        }).catch((err: any) => {
            console.log(err);
            reject();
            return;
        });

        if (isValidAnnonymous) {
            return;
        }

        const count = await mysqlConnection.getRepository(Accounts).createQueryBuilder()
        .where('uid = :uid', { uid: userInfo.uid })
        .andWhere('admin_flag = :bool', { bool: true })
        .getCount();
        if (count >= 1) {
            resolve();
            return;
        }
        reject();
    });
};

app.get('/minify', async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.query.photoId;
    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
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

app.post('/photographs', uploadMemory.single('file'), async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

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

app.post('/video', uploadMemory.single('file'), async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

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
    await isValidAuth(req, true).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.query.photoId;
    const video: Videos = await postgresConnection.getRepository(Videos).findOne({
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

app.get('/download', async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.query.photoId;

    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
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
    await isValidAuth(req, true).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photos = await postgresConnection.getRepository(Photographs).find({
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
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.query.photoId;
    let response = {};
    console.log(photoId);

    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
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

app.put('/photographs', uploadMemory.single('file'), async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.body.photoId;
    const thumbnail = req.file;
    const subTitle = req.body.subTitle;
    const title = req.body.title;
    let response = {};

    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
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

app.put('/video', uploadStorage.single('file'), async (req, res, next) => {
    let response = {
        result: false,
    };

    const path = `./public/hls/${req.file.originalname}`;
    const folder = `./public/hls/video-${req.body.photoId}`;

    await exchangeCodec(path, folder).then(() => {
        console.log('success');
        response = {
            result: true,
        };
    }).catch((err) => {
        console.log(err);
    });

    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    // const photoId = req.body.photoId;
    // const videoData = req.file;

    // let video: Videos = await postgresConnection.getRepository(Videos).findOne({
    //     where: {
    //         photograph_id: photoId,
    //     },
    // });

    // const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    // const fileName = videoData.originalname;
    // const buffer = videoData.buffer;
    // const mimetype = videoData.mimetype;
    // const size = videoData.size;
    // console.log(fileName);
    // console.log(buffer);
    // console.log(mimetype);
    // console.log(size);
    // console.log(process.env.POSTGRES_DB);

    // if (video) {
    //     video.file_name = fileName;
    //     video.data = buffer;
    //     video.mimetype = mimetype;
    //     video.size = size;
    //     video.modified_datetime = now;
    // } else {
    //     video = new Videos();
    //     video.photograph_id = photoId;
    //     video.mimetype = mimetype;
    //     video.file_name = fileName;
    //     video.size = size;
    //     video.data = buffer;
    //     video.created_datetime = now;
    //     video.modified_datetime = now;
    // }

    // await video.save()
    // .then(() => {
    //     response = {
    //         result: true,
    //     };
    // })
    // .catch(() => {
    //     response = {
    //         result: false,
    //     };
    // });

    res.send(response);
});

app.get('/contact', async (req, res, next) => {
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const query = req.query;
    const searchString = query.search;
    const createdTo = query.createdTo;
    let contacts: any = [];
    let count: number = 0;

    if (searchString.length === 0 && createdTo.length === 0) {
        count = await postgresConnection.getRepository(Contacts).count();

        if (query.type === 'true') {
            contacts = await postgresConnection.getRepository(Contacts).find({
                order: {
                    created_datetime: 'DESC',
                },
                take: 100,
            });
        } else {
            contacts = await postgresConnection.getRepository(Contacts).find({
                order: {
                    created_datetime: 'ASC',
                },
                take: 100,
            });
        }
    } else if (searchString.length !== 0 && createdTo.length === 0) {
        count = await postgresConnection.getRepository(Contacts).createQueryBuilder()
        .where("account like '%' || :search || '%'", { search: searchString })
        .orWhere("name like '%' || :search || '%'", { search: searchString })
        .orWhere("email like '%' || :search || '%'", { search: searchString })
        .orWhere("message like '%' || :search ||'%'", { search: searchString })
        .getCount();

        if (query.type === 'true') {
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
            .where("account like '%' || :search || '%'", { search: searchString })
            .orWhere("name like '%' || :search || '%'", { search: searchString })
            .orWhere("email like '%' || :search || '%'", { search: searchString })
            .orWhere("message like '%' || :search ||'%'", { search: searchString })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length === 0 && createdTo.length !== 0) {
        count = await postgresConnection.getRepository(Contacts).createQueryBuilder()
        .where('created_datetime <= :to', { to: createdTo })
        .getCount();

        if (query.type === 'true') {
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'DESC')
            .limit(100)
            .getMany();
        } else {
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
            .where('created_datetime <= :to', { to: createdTo })
            .orderBy('created_datetime', 'ASC')
            .limit(100)
            .getMany();
        }
    } else if (searchString.length !== 0 && createdTo.length !== 0) {
        count = await postgresConnection.getRepository(Contacts).createQueryBuilder()
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
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
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
            contacts = await postgresConnection.getRepository(Contacts).createQueryBuilder()
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
