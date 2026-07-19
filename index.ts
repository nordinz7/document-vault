import { migrate } from "./src/infra/db/migrate.ts";
import { getOne, list, upload } from "./src/modules/swift-payslips/controller.ts";

migrate();

const server = Bun.serve({
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

  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at ${server.url}`);