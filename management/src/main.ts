import express from 'express';
import swaggerUiExpress from 'swagger-ui-express';
import yamljs from 'yamljs';
const swaggerDocument = yamljs.load('swagger.yaml');
const app = express();

app.use('/api-docs', swaggerUiExpress.serve, swaggerUiExpress.setup(swaggerDocument));

app.get('/hello', (req, res) => res.json({
    message: `Hello ${req.query.name}!`,
    yourName: req.query.name,
}));

app.listen(7000, () => console.log('Listen on port 7000!!'));

export default app;
