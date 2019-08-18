import express from 'express';
import swaggerUiExpress from 'swagger-ui-express';
import multer from 'multer';
import yamljs from 'yamljs';
const cors = require('cors');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/tmp');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});
// // アップロードされたファイルを一時的にメモリへ保存する場合
// const storage = multer.memoryStorage();
const upload = multer({ storage });
const gm = require('gm');
const fs = require('fs');
const swaggerDocument = yamljs.load('swagger.yaml');
const app = express();

app.use(cors());
app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerDocument));

app.get('/hello', (req, res) => {
    res.json({
        message: `Hello ${req.query.name}!`,
        yourName: req.query.name,
    });
});

app.post('/image', upload.single('file'), (req, res, next) => {
    console.log('test');
    console.log(req.file.originalname);

    // gm(req.files[0].path)
    //   .resize(300)
    //   .quality(70)
    //   .noProfile()
    //   .write('uploads/reformat.png', function (err) {
    //       if (err) {
    //         logger.debug(err);
    //       } else {
    //         logger.debug('done');
    //       }
    //   });
    res.status(200).end('ok');
});

app.listen(7000, () => console.log('Listen on port 7000!!'));

export default app;
