import { migrate } from "./src/infra/db/migrate.ts";
import { getOne, list, upload } from "./src/modules/swift-payslips/controller.ts";

migrate(); // Ensure the schema is up to date before serving requests.

const server = Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: {
    "/": () => new Response("OK"),

    "/payslips": {
      GET: list,
      POST: upload,
    },

    "/payslips/:id": {
      GET: getOne,
    },
  },

  // (optional) fallback for unmatched routes:
  // Required if Bun's version < 1.2.3
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at ${server.url}`);