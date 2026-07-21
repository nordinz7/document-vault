import { migrate } from "./src/infra/db/migrate.ts";
import { view, list, upload } from "./src/modules/swift-payslips/controller.ts";

migrate();

const openapiSpec = await Bun.file("./openapi.yaml").text();

const docsPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Document Vault — API docs</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

const server = Bun.serve({
  routes: {
    "/": () => new Response("OK"),

    "/openapi.yaml": () =>
      new Response(openapiSpec, {
        headers: { "content-type": "application/yaml" },
      }),

    "/docs": () =>
      new Response(docsPage, {
        headers: { "content-type": "text/html" },
      }),

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