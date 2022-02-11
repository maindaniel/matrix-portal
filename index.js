import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';
import Jimp from 'jimp';
import im from 'imagemagick';
import path from 'path';
import stream from 'stream';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';

const app = express();
const port = 7000;

const __dirname = path.resolve();

// Cloud Layer Functionality only
const openWeatherAPIKey = 'API_KEY_GOES_HERE';

const months = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

app.use((req, res, next) => {
	req.requestId = uuidv4();
	return next();
});

app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', async (req, res) => {
	res.send('Radar BMP Converter is running!');
});
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/generate/:zoom/:x_coord/:y_coord', async (req, res) => {
	const { zoom, x_coord, y_coord } = req.params;

	// await generateTileImage(zoom, x_coord, y_coord);

	const file =
		__dirname + `/images/bmp/${zoom}-${x_coord}-${y_coord}-composite.bmp`;

	const readStream = fs.createReadStream(file);
	readStream.on('open', () => {
		res.set('content-Type', 'image/bmp');
		readStream.pipe(res);
	});
	readStream.on('error', () => {
		res.set('Content-Type', 'text-plain');
		res.status(404).end('Not found');
	});
});

app.post('/error', async (req, res) => {
	// Get today's date
	let date = new Date();

	console.log(req.body);

	console.log(
		`Today is ${daysOfWeek[date.getDay()]}, ${
			months[date.getMonth()]
		} ${date.getDate()}, ${date.getFullYear()}`
	);

	const currentMonthInt = ('0' + (date.getMonth() + 1)).slice(-2);
	const currentDayInt = ('0' + date.getDate()).slice(-2);
	const currentTimeHours = parseInt(date.getHours(), 10);
	const currentTimeMinutes = parseInt(date.getMinutes(), 10);
	const currentTimeMilliseconds = date.getMilliseconds();

	const fileName = `${date.getFullYear()}-${currentMonthInt}-${currentDayInt}_errors.log`;

	const logMessage = `[${currentTimeHours}:${currentTimeMinutes}:${currentTimeMilliseconds}] - ERROR: ${JSON.stringify(
		req.body
	)}\n`;

	try {
		await fs.writeFile(
			path.resolve(__dirname, `./errors/${fileName}`),
			logMessage,
			{ flag: 'a' },
			(error) => {
				if (error) {
					console.log(error);
				} else {
					console.log('error successfully created');
				}
			}
		);
	} catch (e) {
		res.status(500).send({ message: e });
	}

	res.status(200).send('success');
});

app.listen(port, () => {
	console.log(`Radar BMP Converter listening at http://localhost:${port}`);
});

// Downloads an image from the specified URL
const downloadImage = async (fileName, url) => {
	console.log(`Downloading image from: ${url}`);
	console.log('-'.repeat(40));

	const response = await fetch(url);
	const buffer = await response.buffer();
	await fs.writeFile(`images/png/${fileName}.png`, buffer, () => {
		console.log('Finished downloading image');
		console.log('-'.repeat(40));
	});
};

// Cloud layer code
// Downloads a cloud image from Rainviewer given a tile zoom level, x, and y coords
const downloadCloudImage = async (tileZoom, tileX, tileY) => {
	console.log(`Starting cloud download`);
	console.log('-'.repeat(40));

	const url = `https://tile.openweathermap.org/map/clouds_new/${tileZoom}/${tileX}/${tileY}.png?appid=${openWeatherAPIKey}`;

	await downloadImage(`${tileZoom}-${tileX}-${tileY}-cloud`, url);
};

// Get current radar forecast data
const getRadarJSON = async () => {
	console.log('Getting Radar JSON');
	console.log('-'.repeat(40));
	const url = 'https://api.rainviewer.com/public/weather-maps.json';

	const nowcastPromise = await fetch(url)
		.then((response) => response.json())
		.then((data) => {
			return data.radar.nowcast[0].path;
		});

	console.log('Returning Radar JSON');
	console.log('-'.repeat(40));
	return nowcastPromise || false;
};

// Downloads a radar image from Rainviewer given a tile zoom level, x, and y coords
const downloadRadarImage = async (tileZoom, tileX, tileY) => {
	console.log(`Starting radar download`);
	console.log('-'.repeat(40));
	const currentAPIPath = await getRadarJSON();

	if (currentAPIPath) {
		const url = `https://tilecache.rainviewer.com${currentAPIPath}/256/${tileZoom}/${tileX}/${tileY}/4/1_1.png`;

		await downloadImage(`${tileZoom}-${tileX}-${tileY}-radar`, url);
	}

	return false;
};

// Layers provided BMPs in order received
const overlayBMPs = async (
	cloudResult,
	radarResult,
	tileZoom,
	tileX,
	tileY
) => {
	console.log(`Starting overlay`);
	console.log('-'.repeat(40));

	let jimps = [];

	jimps.push(Jimp.read(`images/png/${tileZoom}-${tileX}-${tileY}.png`));

	// Cloud layer code
	// if(cloudResult) {
	//     jimps.push(Jimp.read(`images/png/${tileZoom}-${tileX}-${tileY}-cloud.png`));
	// }

	if (radarResult) {
		jimps.push(Jimp.read(`images/png/${tileZoom}-${tileX}-${tileY}-radar.png`));
	}

	await Promise.all(jimps)
		.then((data) => {
			return Promise.all(jimps);
		})
		.then((data) => {
			if (data.length > 1) {
				console.log(`Data 1 found`);
				console.log('-'.repeat(40));
				data[0].composite(data[1], 0, 0);

				if (data.length > 2) {
					console.log(`Data 2 found`);
					console.log('-'.repeat(40));
					data[0].composite(data[2], 0, 0);
				}
			}
			return data[0].resize(32, 32);
		})
		.then((data) => {
			console.log(`Resizing successful`);
			console.log('-'.repeat(40));
			return data.write(
				`images/bmp/${tileZoom}-${tileX}-${tileY}-composite.bmp`
			);
		})
		.then((data) => {
			console.log(`Writing successful`);
			console.log('-'.repeat(40));
			return im.convert(
				[
					`images/bmp/${tileZoom}-${tileX}-${tileY}-composite.bmp`,
					'-type',
					'Palette',
					`images/bmp/${tileZoom}-${tileX}-${tileY}-composite.bmp`,
				],
				function (err, stdout) {
					if (err) throw err;
					// console.log(`Palette conversion successful`);
					// console.log('-'.repeat(40));
				}
			);
		})
		.then((data) => {
			console.log('after palette');
			console.log('-'.repeat(40));
			// console.log(data.stdout)
		});

	console.log(`Finished generating image`);
	console.log('-'.repeat(40));

	return `images/bmp/${tileZoom}-${tileX}-${tileY}-composite.bmp`;
};

// Generates entire tile image
const generateTileImage = async (zoom, x, y) => {
	// Cloud layer code
	// await downloadCloudImage(zoom, x, y);
	await downloadRadarImage(zoom, x, y);
	const cloudResult = true;
	const radarResult = true;
	return await overlayBMPs(cloudResult, radarResult, zoom, x, y);
};

const generateTilesOnTimer = async () => {
	console.log(new Date().toUTCString() + ` --- Generating Tile Images`);
	console.log('-'.repeat(40));
	await generateTileImage(9, 131, 193);
	await generateTileImage(9, 132, 193);
	console.log(
		new Date().toUTCString() + ` --- Finished generating Tile Images`
	);
	console.log('-'.repeat(40));
};

const minutes = 10;
const generateInterval = minutes * 60 * 1000;

generateTilesOnTimer();

setInterval(async () => {
	await generateTilesOnTimer();
}, generateInterval);
