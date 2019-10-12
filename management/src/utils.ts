import log4js from 'log4js';
import fsExtra from 'fs-extra';
import { Accounts } from './entities/mysql/accounts';
import { getConnectionOptions, createConnection, BaseEntity } from 'typeorm';
const fs = require('fs');
export const firebaseAdmin = require('firebase-admin');

// DB接続
export let postgresConnection: any = null;
export let mysqlConnection: any = null;
const postgresConnect = async () => {
    const connectionOptions = await getConnectionOptions('postgres');
    postgresConnection = await createConnection(connectionOptions);
    // 管理情報格納DBのpostgresをデフォルトのコネクション設定
    BaseEntity.useConnection(postgresConnection);
};
postgresConnect();
const mysqlConnect = async () => {
    const connectionOptions = await getConnectionOptions('mysql');
    mysqlConnection = await createConnection(connectionOptions);
    // BaseEntity.useConnection(mysqlConnection);
};
mysqlConnect();

// firebase authenticationサービスを使用
firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(require('../firebase-service.json')),
});

// logger設定
log4js.configure({
    appenders: {
        system: { type: 'dateFile', filename: './logs/access.log', pattern: '-yyyy-MM-dd' },
    },
    categories: {
        default: { appenders:['system'], level: 'debug' },
    },
});
export const logger = log4js.getLogger();

// 権限チェック
export const isValidAuth = (req: any, annonymous: boolean = false): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
        // トークンヘッダの存在チェック
        const authorization = req.headers.authorization;
        if (authorization === undefined) {
            reject();
            return;
        }

        // firebase 匿名認証、google認証を通過しているかチェック
        const idToken = authorization.split(' ')[1];
        let userInfo: any = {};
        let isValidAnnonymous = false;
        await firebaseAdmin.auth().verifyIdToken(idToken)
        .then((decodedToken: any) => {
            console.log(decodedToken);
            logger.info(decodedToken.uid);
            logger.info(decodedToken.email);
            userInfo = decodedToken;

            if (annonymous) {
                resolve();
                isValidAnnonymous = true;
                return;
            }
        }).catch((err: any) => {
            console.log(err);
            logger.error(err);
            reject();
            return;
        });

        // 匿名認証でも可能な処理の場合
        if (isValidAnnonymous) {
            return;
        }

        // 以下、google認証の場合（ログインはしている）
        // DB接続確認
        await maintainDbConnection();

        // 管理者権限を持っているかチェック
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

// mp4動画をhls用に分割させるモジュール導入
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// mp4動画ファイルをhls用に分割
export const exchangeCodec = (path: string, folder: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
        if (fs.existsSync(folder)) {
            fsExtra.removeSync(folder);
        }
        fs.mkdirSync(folder);

        // pathのディレクトリにあるmp4データを分割し、folderのディレクトリに配置
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
            logger.info(`Running ffmpeg with command:${commandLine}`);
        })
        .on('codecData', (data: any) => {
            logger.info(`Input is${data.audio}audio with${data.video}video`);
        })
        .on('progress', (progress: any) => {
            logger.info(`Processing:${progress.percent}% done`);
        })
        .on('error', (err: any, stdout: any, stderr: any) => {
            logger.error(`Error while Processing video: ${err.message}`);
            console.log(stderr);
            reject();
        })
        .on('end', () => {
            logger.info('Transcoding succeeded!');
            resolve();
        })
        .run();
    });
};

const maintainDbConnection = async () => {
    if (mysqlConnection === null) {
        await mysqlConnect();
    }
    if (postgresConnection === null) {
        await postgresConnect();
    }
}
