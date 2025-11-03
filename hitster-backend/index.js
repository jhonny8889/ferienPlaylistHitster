import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import querystring from "querystring";

dotenv.config();

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URI = process.env.FRONTEND_URI;

let access_token = "";
let refresh_token = "";

// Step 1: Login redirect
app.get("/login", (req, res) => {
const scope = "user-read-playback-state user-modify-playback-state";
const params = querystring.stringify({
response_type: "code",
client_id: CLIENT_ID,
scope,
redirect_uri: REDIRECT_URI,
});
res.redirect("[https://accounts.spotify.com/authorize](https://accounts.spotify.com/authorize)?" + params);
});

// Step 2: Callback from Spotify after login
app.get("/callback", async (req, res) => {
const code = req.query.code;
const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

try {
const tokenResponse = await fetch("[https://accounts.spotify.com/api/token](https://accounts.spotify.com/api/token)", {
method: "POST",
headers: {
Authorization: "Basic " + creds,
"Content-Type": "application/x-www-form-urlencoded",
},
body: querystring.stringify({
grant_type: "authorization_code",
code,
redirect_uri: REDIRECT_URI,
}),
});
const data = await tokenResponse.json();
access_token = data.access_token;
refresh_token = data.refresh_token;

```
// Redirect back to frontend after login
res.redirect(FRONTEND_URI);
```

} catch (err) {
console.error(err);
res.send("Error during Spotify login");
}
});

// Helper: refresh access token
async function refreshAccessToken() {
const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
const response = await fetch("[https://accounts.spotify.com/api/token](https://accounts.spotify.com/api/token)", {
method: "POST",
headers: {
Authorization: "Basic " + creds,
"Content-Type": "application/x-www-form-urlencoded",
},
body: querystring.stringify({
grant_type: "refresh_token",
refresh_token,
}),
});
const data = await response.json();
access_token = data.access_token;
}

// Step 3: /play endpoint
app.post("/play", async (req, res) => {
const trackUri = req.body.uri;
if (!trackUri) return res.status(400).send("Missing uri");

// Ensure token exists
if (!access_token) return res.status(400).send("Login first at /login");

try {
let response = await fetch("[https://api.spotify.com/v1/me/player/play](https://api.spotify.com/v1/me/player/play)", {
method: "PUT",
headers: {
Authorization: `Bearer ${access_token}`,
"Content-Type": "application/json",
},
body: JSON.stringify({ uris: [trackUri] }),
});

```
// If token expired, refresh and retry
if (response.status === 401 && refresh_token) {
  await refreshAccessToken();
  response = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

if (response.ok) {
  res.send("Playing track!");
} else {
  const text = await response.text();
  res.status(response.status).send(text);
}
```

} catch (err) {
console.error(err);
res.status(500).send("Error sending request to Spotify");
}
});

app.listen(process.env.PORT || 3000, () =>
console.log(`Server running on port ${process.env.PORT || 3000}`)
);
