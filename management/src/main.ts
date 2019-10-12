import express from 'express';
import multer from 'multer';
import { Contacts } from './entities/postgres/contacts';
import { Photographs } from './entities/postgres/photographs';
import { Videos } from './entities/postgres/videos';
import { Brackets } from 'typeorm';
import { exchangeCodec, logger, isValidAuth,
        postgresConnection } from './utils';
const fs = require('fs');
const moment = require('moment');
const cors = require('cors');
const bodyParser = require('body-parser');
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
const imageminSvgo = require('imagemin-svgo');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminMozjpeg = require('imagemin-mozjpeg');

// 動画アップロード先
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/hls');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});
const uploadStorage = multer({ storage });

// アップロードされたファイルを一時的にメモリへ保存する場合
const memory = multer.memoryStorage();
const uploadMemory = multer({ storage: memory });

// 以下、express設定
const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('./public'));

// プロジェクト動画のサムネイルを圧縮リクエスト
app.get('/minify', async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    logger.info('minify');
    const photoId = req.query.photoId;
    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
        where: {
            id: photoId,
        },
    });

    // 圧縮前、/uploads/tmpフォルダに書き出し
    const fileName = photo!.file_name;
    await fs.createWriteStream(`./uploads/tmp/${fileName}`).write(photo!.data);

    // 圧縮後、/minified/tmpディクトリに書き出し
    const files = await imagemin([`./uploads/tmp/${fileName}`], {
        destination: './minified/tmp',
        plugins: [
            imageminMozjpeg({ quality: 80 }),
            imageminPngquant({
                quality: [0.6, 0.8],
            }),
            imageminGifsicle({
                interlaced: false,
                optimizationLevel: 3,
            }),
            imageminSvgo(),
        ],
    }).catch((err: any) => {
        console.log(err);
        logger.error(err);
        res.status(500).end('サーバ処理に失敗');
    });

    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    // 圧縮後のファイルを読み取りバイトバッファを取得
    const data = fs.readFileSync(`./minified/tmp/${fileName}`);
    photo!.data = data;
    photo!.size = data.length;
    photo!.modified_datetime = now;

    await photo!.save()
    .then((result) => {
        logger.info('success');
        res.status(200).end('ok');
    }).catch((err) => {
        console.log(err);
        logger.error(err);
        res.status(500).end('サーバ処理に失敗');
    });
});

// addボタンにて、新規プロジェクトの動画サムネイルの追加リクエスト
app.post('/photographs', uploadMemory.single('file'), async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    if (!req.file) {
        res.status(500).end('no file');
        next();
    }

    logger.info('thumbnail');
    const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
    const photo = new Photographs();
    photo.mimetype = req.file.mimetype;
    photo.file_name = req.file.originalname;
    photo.size = req.file.size;
    photo.data = req.file.buffer;
    photo.created_datetime = now;
    photo.modified_datetime = now;

    await photo.save()
    .then((result) => {
        logger.info('success');
        res.status(200).end('ok');
    }).catch((err) => {
        console.log(err);
        logger.error(err);
        res.status(500).end('サーバ処理に失敗');
    });
});

// 現在の動画サムネイルのダウンロードリクエスト
app.get('/download', async (req, res, next) => {
    // 管理者権限チェック
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

// プロジェクト動画リスト取得リクエスト
app.get('/photographs', async (req, res, next) => {
    // 匿名認証（サイト閲覧者かどうか）チェック
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

    // 日付フォーマット変換
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

// プロジェクト一覧からプロジェクトを消去リクエスト
app.delete('/photographs', async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.query.photoId;
    logger.info(`delete photo: ${photoId}`);
    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
        where: {
            id: photoId,
        },
    });

    await photo!.remove()
    .then(() => {
        res.status(200).end('ok');
    })
    .catch(() => {
        res.status(500).end('サーバ処理に失敗');
    });
});

// 動画情報（サムネイル、サブタイトル、タイトルのいずれか）の変更リクエスト
app.put('/photographs', uploadMemory.single('file'), async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    const photoId = req.body.photoId;
    const thumbnail = req.file;
    const subTitle = req.body.subTitle;
    const title = req.body.title;

    logger.info(`set photo: ${photoId}`);
    const photo: Photographs = await postgresConnection.getRepository(Photographs).findOne({
        where: {
            id: photoId,
        },
    });

    // サムネイルの変更リクエスト
    if (thumbnail) {
        const now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
        photo!.file_name = thumbnail.originalname;
        photo!.data = thumbnail.buffer;
        photo!.mimetype = thumbnail.mimetype;
        photo!.size = thumbnail.size;
        photo!.modified_datetime = now;
    } else {
        // タイトルの変更リクエスト
        if (subTitle === undefined) {
            photo!.title = title;
        // サブタイトルの変更リクエスト
        } else {
            photo!.sub_title = subTitle;
        }
    }

    await photo!.save()
    .then(() => {
        res.status(200).end('ok');
    })
    .catch(() => {
        res.status(500).end('サーバ処理に失敗');
    });
});

// 動画アップロードリクエスト
app.put('/video', uploadStorage.single('file'), async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    // アップロードしたmp4データ配置先
    const path = `./public/hls/${req.file.originalname}`;
    // mp4を分割したデータ配置先
    const folder = `./public/hls/video-${req.body.photoId}`;

    logger.info(`set video: ${req.body.photoId}`);

    // 分割後、指定先に配置
    await exchangeCodec(path, folder).then(() => {
        logger.info('success');
        res.status(200).end('ok');
    }).catch((err: any) => {
        console.log(err);
        logger.error(err);
        res.status(500).end('サーバ処理に失敗');
    });
});

// お問い合わせ履歴取得リクエスト（検索条件により最大100件）
app.get('/contact', async (req, res, next) => {
    // 管理者権限チェック
    await isValidAuth(req).then(() => {
    }).catch((err) => {
        res.status(404).end();
        next();
    });

    logger.info('contact');
    const query = req.query;
    const searchString = query.search;
    const createdTo = query.createdTo;
    let contacts: any = [];
    let count: number = 0;

    // TODO like構文から全文検索ロジック（ngramパーサー）に変更

    // 検索フィルターがない場合
    if (searchString.length === 0 && createdTo.length === 0) {
        count = await postgresConnection.getRepository(Contacts).count();
        // createdDTの降順リクエスト（デフォルト）
        if (query.type === 'true') {
            contacts = await postgresConnection.getRepository(Contacts).find({
                order: {
                    created_datetime: 'DESC',
                },
                take: 100,
            });
        // createdDTの昇順リクエスト
        } else {
            contacts = await postgresConnection.getRepository(Contacts).find({
                order: {
                    created_datetime: 'ASC',
                },
                take: 100,
            });
        }
    // 日付フィルターのみあった場合
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
     // 文字列検索のみあった場合
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
    // 文字列検索と日付フィルターのどちらもあった場合
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

    // 日付フォーマット変換
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

// ポート解放
app.listen(7000, () => console.log('Listen on port 7000!!'));

export default app;
