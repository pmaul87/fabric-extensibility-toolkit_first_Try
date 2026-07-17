import type { Server } from "http";
import { createApp } from "./app";

export function createServerApp() {
  return createApp();
}

export async function startServer(port = Number(process.env.PORT || 7071)): Promise<{ server: Server; port: number }> {
  const app = createServerApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      console.log(`[lineage-workbench-v2] listening on port ${resolvedPort}`);
      resolve({ server, port: resolvedPort });
    });

    server.on("error", (error) => {
      reject(error);
    });
  });
}

if (require.main === module) {
  void startServer();
}
