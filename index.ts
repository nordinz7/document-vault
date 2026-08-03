import { migrate } from "./src/infra/db/migrate.ts";
import { docs, spec } from "./src/modules/docs/controller.ts";
import { view, list, upload } from "./src/modules/swift-payslips/controller.ts";

migrate();

const server = Bun.serve({
  routes: {
    "/": () => new Response("OK"),

    "/openapi.yaml": spec,

    "/docs": docs,

    "/payslips": {
      GET: list,
      POST: upload,
    },

    "/payslips/:id": {
      GET: view,
    },
  },

  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.error(`Server running at ${server.url}`);
