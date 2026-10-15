import { Hocuspocus } from "@hocuspocus/server";

// Configure the server …
const server = new Hocuspocus({
  port: 1414,
});

// … and run it!
server.listen();