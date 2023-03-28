const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
//Zip nodejs folder and upload to s3 , create lambda layer with src from s3 (file limitations)
//Needs to be nodejs folder in root with node_modules inside for the lambda to recognise the packages


//Debug timer
// let times = [];
// const timer = () => {
//   var currentdate = new Date();
//   var datetime =
//     "Now: " +
//     currentdate.getDate() +
//     "/" +
//     (currentdate.getMonth() + 1) +
//     "/" +
//     currentdate.getFullYear() +
//     " @ " +
//     currentdate.getHours() +
//     ":" +
//     currentdate.getMinutes() +
//     ":" +
//     currentdate.getSeconds();
//   times.push(datetime);
//   console.log(datetime);
// };

exports.handler = async (event, context) => {
    //timer();

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
        
        // await page.exposeFunction("timer", timer);

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
                // onBeforeRender: async () => {
                //   await timer();
                // },
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
        await page.waitForTimeout(2000);

        // Take a screenshot and save it as a png or add to buffer as response / change to png but takes more resources
        const screenshot = await page.screenshot({type: 'png',  encoding: 'base64'});
       
        // Take screenshot of page and convert to png buffer
        const screenshotBuffer = screenshot;
        
        ///save the screenshot locally or upload to s3
        // fs.writeFileSync('deckgl-globe.png', screenshot);

        await browser.close();
        // await timer();
        // let responseBody = {
        //   image: screenshotBuffer.toString("base64"),
        //   times: times,
        // };
        // Return png buffer as response
        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'image/png',
            },
            isBase64Encoded: true,
            body: screenshotBuffer.toString("base64")
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
