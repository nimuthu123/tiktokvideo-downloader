const express = require('express');
const axios = require('axios');
const app = express();
const port = 3006;

app.use(express.static('public'));
app.use(express.json());

async function tryDownloadService(videoURL, service) {
    try {
        switch (service) {
            case 'savefrom':
                const response1 = await axios({
                    method: 'GET',
                    url: `https://api.savefrom.net/api/convert?url=${encodeURIComponent(videoURL)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Origin': 'https://savefrom.net',
                        'Referer': 'https://savefrom.net/'
                    }
                });

                return response1.data?.url?.[0]?.url || null;

            case 'savett':
                const formData = new URLSearchParams();
                formData.append('url', videoURL);

                const response2 = await axios({
                    method: 'POST',
                    url: 'https://savett.cc/download',
                    data: formData,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://savett.cc',
                        'Referer': 'https://savett.cc/'
                    }
                });

                const match = response2.data.match(/href="([^"]+)">Download MP4<\/a>/);
                return match ? match[1] : null;

            case 'ttsave':
                const response3 = await axios({
                    method: 'GET',
                    url: `https://ttsave.app/download?mode=video&url=${encodeURIComponent(videoURL)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Origin': 'https://ttsave.app',
                        'Referer': 'https://ttsave.app/'
                    }
                });

                return response3.data?.download_url || null;
        }
    } catch (error) {
        console.error(`Error with ${service}:`, error.message);
        return null;
    }
}

app.get('/download', async (req, res) => {
    try {
        const videoURL = req.query.url;
        if (!videoURL) {
            return res.status(400).send('Please provide a TikTok video URL');
        }

        // Try multiple services in sequence
        const services = ['savefrom', 'savett', 'ttsave'];
        let videoUrl = null;

        for (const service of services) {
            console.log(`Trying ${service}...`);
            videoUrl = await tryDownloadService(videoURL, service);
            if (videoUrl) {
                console.log(`Successfully got video URL from ${service}`);
                break;
            }
        }

        if (!videoUrl) {
            throw new Error('Failed to get video URL from all services');
        }

        // Download the video
        const videoResponse = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            },
            timeout: 30000
        });

        // Verify content type
        const contentType = videoResponse.headers['content-type'];
        if (!contentType || !contentType.includes('video')) {
            throw new Error('Invalid content type received');
        }

        // Set headers for video download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="tiktok_video_${Date.now()}.mp4"`);

        // Log download progress
        let downloadedBytes = 0;
        const totalBytes = parseInt(videoResponse.headers['content-length'] || '0');

        videoResponse.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
                const progress = Math.round((downloadedBytes / totalBytes) * 100);
                console.log(`Download progress: ${progress}%`);
            }
        });

        // Pipe the video stream to response with error handling
        videoResponse.data.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Error during video streaming');
            }
        });

        videoResponse.data.pipe(res);

        // Handle response completion
        res.on('finish', () => {
            console.log('Download completed successfully');
        });

    } catch (error) {
        console.error('Download error:', error.message);
        if (error.response) {
            console.error('Error response:', error.response.status, error.response.statusText);
            console.error('Error data:', error.response.data);
        }
        res.status(500).send('Error downloading video. Please make sure the video URL is valid and try again.');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(port, () => {
    console.log(`TikTok downloader app listening at http://localhost:${port}`);
});
