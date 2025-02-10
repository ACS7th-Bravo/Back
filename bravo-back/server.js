// /bravo-back/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const spotifyRouter = require("./routes/spotify");
const youtubeRouter = require("./routes/youtube");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/spotify", spotifyRouter);
app.use("/api/youtube", youtubeRouter);

app.listen(PORT, () => {
  console.log(`🥰 Server is running on port ${PORT}`);
});
