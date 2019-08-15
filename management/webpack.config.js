const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    mode: 'production',
    entry: './src/main.ts',     // src下に書いていくので　src/server.tsにしとく
    target: 'node',               // Module not found: Error: Can't resolve 'fs'とかいっぱい出たら、この行書き忘れ
    externals: [nodeExternals()], 
    module: {
        rules: [
            {
                enforce: 'pre',
                loader: 'tslint-loader',
                test: /\.ts$/,
                exclude: [
                    /node_modules/
                ],
                options: {
                    emitErrors: true,
                    typeCheck: true
                }
            },
            {
                loader: 'ts-loader',
                test: /\.ts$/,
                exclude: [
                    /node_modules/
                ],
                options: {
                    configFile: 'tsconfig.json'
                }
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist')
    },
};