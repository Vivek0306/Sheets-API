const dotenv = require("dotenv");
const express = require('express');
const { google } = require('googleapis');
const open = require('open');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();
const app = express();
const port = 3000;
const spreadsheetId = process.env.SPREADSHEET_ID;
const range = 'A1:E51'; // Range of sheet values to be fetched


// Configure session middleware
app.use(session({ secret: 'your-secret-key', resave: true, saveUninitialized: true }));

// OAuth2 credentials
const oauth2Client = new OAuth2Client({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: `http://localhost:${port}/auth/callback`,
});

// Google Sheets API configuration
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });


// Get and Transform Sheet Data
async function fetchSheetData(spreadsheetId, range) {
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const data = response.data.values;

        // Now you can process the 'data' variable as needed
        // For example, you can transform it into an array of objects with headers as keys
        const headers = data[0];
        const sheetData = data.slice(1).map(dataRow =>
            headers.reduce((userData, header, index) => {
                userData[header] = dataRow[index];
                return userData;
            }, {})
        );
        return sheetData;
    } catch (error) {
        console.error('Error fetching and transforming data:', error);
        throw error;
    }
}


// Redirect to Google OAuth2 consent screen
app.get('/auth', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    res.redirect(authUrl);
});

// Handle OAuth2 callback and store tokens in session
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        req.session.tokens = tokens;
        res.redirect('/data');
    } catch (error) {
        console.error('Error getting access token:', error);
        res.status(500).send('Error getting access token');
    }
});

// Check if the user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.tokens) {
        oauth2Client.setCredentials(req.session.tokens);
        return next();
    }
    res.redirect('/auth');
};

// Fetch Google Sheets data
app.get('/data', isAuthenticated, async (req, res) => {
    try {
        const sheetData = await fetchSheetData(spreadsheetId, range);
        // Send the transformed data as a JSON response
        res.json(sheetData);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/members/:group', isAuthenticated, async (req, res) => {
    try {
        const sheetData = await fetchSheetData(spreadsheetId, range);
        const groupGet = req.params.group;
        const groupMembers = sheetData.filter(member => member.Group === groupGet);

        res.json({ members: groupMembers });

    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// Start the Express server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    open(`http://localhost:${port}/auth`);
});
