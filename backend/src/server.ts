import { createApp } from "./app.js";
import { env } from "./config.js";

const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : env.PORT;
createApp().listen(port, env.HOST, () => console.log(`Algorithmic Tutor API listening on ${env.HOST}:${port}`));
