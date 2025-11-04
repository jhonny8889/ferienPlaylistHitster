import fetch from "node-fetch";
import querystring from "querystring";

let access_token = "";
let refresh_token = "";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URI = process.env.FRONTEND_URI;

export default async function handler(req, res) {
  const { method, url } = req;

  // Step 1 — login
  if (url.startsWith("/api/login")) {
    const scope = "user-read-playback-state user-modify-playback-state";
    const params = querystring.stringify({
      response_type: "code",
      client_id: CLIENT_ID,
      scope,
      redirect_uri: REDIRECT_URI,
    });
    return res.redirect(`https://accounts.spotify.com/authorize?${params}`);
  }

  // Step 2 — callback
  if (url.startsWith("/api/callback")) {
    const code = new URL(req.url, `https://${req.headers.host}`).searchParams.get("code");
    const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    try {
      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
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

      return res.redirect(FRONTEND_URI);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error during Spotify login");
    }
  }

  // Step 3 — play track
  if (url.startsWith("/api/play") && method === "POST") {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const { uri } = JSON.parse(Buffer.concat(buffers).toString());

    if (!access_token) return res.status(401).send("Login first at /api/login");

    try {
      let response = await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [uri] }),
      });

      // Refresh token if expired
      if (response.status === 401 && refresh_token) {
        const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
        const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
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
        const refreshData = await refreshRes.json();
        access_token = refreshData.access_token;

        response = await fetch("https://api.spotify.com/v1/me/player/play", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [uri] }),
        });
      }

      if (response.ok) return res.status(200).send("Playing track!");
      const text = await response.text();
      return res.status(response.status).send(text);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error playing track");
    }
  }

  // default: not found
  return res.status(404).send("Not found");
}
