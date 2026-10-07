const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PDF_WIDTH = 1200;

const PORT = 1313;
const PAGE = '/blog/posts/glitching/';
const OUTPUT = 'glitching.pdf';

const {
    interval
} = require('rxjs');

const {
    filter,
    first,
    mergeMap
} = require('rxjs/operators');

const fetchResponse = () => {
    return new Promise((res, rej) => {
        try {
            const req = http.request(
                `http://localhost:${PORT}${PAGE}`,
                response => res(response.statusCode)
            );

            req.on('error', err => rej(err));
            req.end();
        } catch (err) {
            rej(err);
        }
    });
};

const waitForServerReachable = () => {
    return interval(1000).pipe(
        mergeMap(async () => {
            try {
                const statusCode = await fetchResponse();

                if (statusCode === 200) {
                    return true;
                }
            } catch (err) {}

            return false;
        }),
        filter(ok => !!ok)
    );
};

const convert = async () => {
    await waitForServerReachable().pipe(
        first()
    ).toPromise();

    console.log('Connected to server ...');
    console.log('Exporting ...');

    try {
        const fullDirectoryPath = path.join(__dirname, '../pdf/');

        const browser = await puppeteer.launch({
            args: ['--no-sandbox']
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: PDF_WIDTH,
            height: 1000
        });

        await page.goto(
            `http://localhost:${PORT}${PAGE}`,
            {
                waitUntil: 'networkidle2'
            }
        );

        if (!fs.existsSync(fullDirectoryPath)) {
            fs.mkdirSync(fullDirectoryPath);
        }

        await page.addStyleTag({
            content:
            `html {
                -webkit-print-color-adjust: exact !important;
            }
            #content {
                max-width: 80% !important;
            }
            `
        });

        /*
         * Keep this if your Hugo theme has a .content element,
         * as your original project did.
         *
         * If it doesn't, this simply does nothing.
         */
        await page.evaluate(() => {
            const content = document.querySelector('.content');

            if (content) {
                content.style.background = 'none';
            }
        });

        const height = await page.evaluate(
            () => document.documentElement.offsetHeight + 1
        );

        await page.pdf({
            path: path.join(fullDirectoryPath, OUTPUT),
            width: `${PDF_WIDTH}px`,
            height: `${height}px`,
            printBackground: true,
            margin: 'none'
        });

        await browser.close();
    } catch (err) {
        throw new Error(err);
    }

    console.log(`Finished export: pdf/${OUTPUT}`);
};

convert();
