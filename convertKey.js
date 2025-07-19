const fs = require('fs');
const key = fs.readFileSync('./my-medi-camp-firebase-adminsdk-fbsvc-2fae8884c4.json', 'utf8');
const base64 = Buffer.from(key).toString('base64')
