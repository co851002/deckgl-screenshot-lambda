//Avg response 20sec with below settings and 2048mb memory

const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
//Layer instructions
//install deps
//create a new folder called nodejs:
//move node_modules folder into the nodejs folder:
//zip the nodejs folder:
//zip -r nodejs.zip 
//create lambda layer with src from s3 and attach to lambda

exports.handler = async (event, context) => {
    let browser = null;
    let result = null;

    // Get URL parameters or default to London, UK
    // 51.12 N, 0.13° W
    // Get URL parameters
    const queryParams = event.queryStringParameters || {};
    const latitude = parseFloat(queryParams.latitude) || 51.12;
    const longitude = parseFloat(queryParams.longitude) || 0.13;
    const zoom = parseFloat(queryParams.zoom) || 5;

    try {
        //Launch new browser
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        // Set vp
        await page.setViewport({ width: 1920, height: 1080 });

        // Load external scripts
        const deckScript = 'https://unpkg.com/deck.gl@latest/dist.min.js';
        await page.addScriptTag({ url: deckScript });


        // Add HTML content
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                body { margin: 0;
                    width: 100vw;
                    height: 100vh;
                    overflow: hidden; }
                canvas { display: block; }
                </style>
            </head>
            <body>
                <canvas id="deck-canvas"></canvas>
            </body>
            </html>
        `);

        // Define the Deck.gl Globe
        await page.evaluate(({ latitude, longitude, zoom }) => {
            const { DeckGL, _GlobeView, TileLayer, BitmapLayer, COORDINATE_SYSTEM } = deck;

            new DeckGL({
                views: new _GlobeView({
                    resolution: 10
                }),
                initialViewState: {
                    longitude: longitude,
                    latitude: latitude,
                    zoom: zoom,
                    minZoom: 0,
                    maxZoom: 20
                },
                controller: true,

                layers: [
                    new TileLayer({
                        data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        minZoom: 0,
                        maxZoom: 15,
                        tileSize: 256,

                        renderSubLayers: props => {
                            const {
                                bbox: { west, south, east, north }
                            } = props.tile;

                            return new BitmapLayer(props, {
                                data: null,
                                image: props.data,
                                _imageCoordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
                                bounds: [west, south, east, north]
                            });
                        }
                    })
                ]
            });

        }, { latitude, longitude, zoom });

        // Wait for the scene to render 12sec seem enough, any lower will have missing tiles from the render
        await page.waitForTimeout(12000);

        // Take a screenshot and save it as a jpeg or add to buffer as response / change to png but takes more resources
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64' });

        // Take screenshot of page and convert to jpeg buffer
        const screenshotBuffer = screenshot;

        ///save the screenshot locally or upload to s3
        // fs.writeFileSync('deckgl-globe.png', screenshot);

        await browser.close();
        // Return jpeg buffer as response
        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/jpeg',
            },
            isBase64Encoded: true,
            body: screenshotBuffer.toString('base64'),
        };
        return response

    } catch (error) {
        console.error(error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }


};
