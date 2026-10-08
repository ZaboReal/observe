// Observe's first-party route: GET /_observe/s.js (the sensor) and POST /_observe/v1/sdk/events (its batches).
// The folder is `%5Fobserve` because a plain `_observe` folder is private in the App Router and never routed.
export { GET, POST } from "@observe/next/route";
